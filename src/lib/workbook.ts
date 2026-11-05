import * as XLSX from "xlsx";
import type { Data } from "./inventory";

// Reads the "Ordering File.xlsx" layout: one workbook with 3 sheets
//  - "Master data Stock Balance": stock per outlet + DC, vendor
//  - "(A1) Sales Analyse": sales per month per SKU
//  - "(B1) Order Qty": pending orders, lead time, pack size
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const DC_COLUMNS = new Set(["dc2", "dc3", "dckl g", "dckl"].map(norm));
const DEFAULT_LEAD_DAYS = 14;

// Presentation mode: real "HQ Last Cost" is never read or saved. Each SKU gets a made-up
// (but stable) price instead, so the dashboard can be shown to an audience.
// Set to false to use the real prices from the file.
const SHOW_FAKE_PRICES = true;
// Same idea for vendor names: each real vendor becomes a made-up company, always the same one.
// Set to false to show the real vendor names.
const SHOW_FAKE_VENDORS = true;
const FAKE_A = ["Bright", "Golden", "Silver", "Prime", "Evergreen", "Sunrise", "Blue Ocean", "Red Maple", "Grand", "Swift", "Noble", "Lucky", "Royal", "Fresh", "Metro", "Pacific", "Summit", "Harbor", "Jade", "Crown"];
const FAKE_B = ["Trading", "Supplies", "Marketing", "Industries", "Enterprise", "Distribution", "Packaging", "Wholesale", "Resources", "Global", "Imports", "Products", "Logistics", "Ventures", "Foods", "Housewares", "Plastics", "Textiles", "Hardware", "Stationery", "Mills", "Craft", "Home", "Goods", "Link"];
const fakeVendors = new Map<string, string>();
function fakeVendor(real: string) {
  let name = fakeVendors.get(real);
  if (!name) {
    const i = fakeVendors.size; // order of first appearance in the file
    name = `${FAKE_A[i % FAKE_A.length]} ${FAKE_B[Math.floor(i / FAKE_A.length) % FAKE_B.length]} ${i >= FAKE_A.length * FAKE_B.length ? i + " " : ""}Sdn Bhd`;
    fakeVendors.set(real, name);
  }
  return name;
}
function fakePrice(code: string) {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.round((0.5 + ((h >>> 0) % 5950) / 100) * 100) / 100; // RM 0.50 – 60.00
}
const MONTHS_FOR_SPEED = 3; // average of the last 3 months of sales

type Grid = unknown[][];
function sheet(wb: XLSX.WorkBook, name: string): Grid {
  const real = wb.SheetNames.find((n) => norm(n) === norm(name));
  if (!real) throw new Error(`Sheet "${name}" not found in this workbook.`);
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[real], { header: 1, defval: "" });
}
function col(headers: unknown[], name: string, from = 0): number {
  const i = headers.findIndex((h, idx) => idx >= from && norm(h) === norm(name));
  if (i < 0) throw new Error(`Column "${name}" not found.`);
  return i;
}

export function isOrderingWorkbook(names: string[]) {
  return names.some((n) => norm(n).includes("masterdatastockbalance"));
}

export function parseOrderingWorkbook(bytes: Uint8Array): Data {
  const wb = XLSX.read(bytes, {
    type: "array",
    sheets: ["Master data Stock Balance", "(A1) Sales Analyse", "(B1) Order Qty"],
  });

  // --- Stock + vendor ---
  const master = sheet(wb, "Master data Stock Balance");
  const mh = master[0];
  const cCode = col(mh, "ARMS Code");
  const cDesc = col(mh, "Description");
  const cVendor = col(mh, "Vendor Name");
  const cCost = col(mh, "HQ Last Cost");
  const cRank = mh.findIndex((h) => norm(h) === "ranking"); // optional
  const cFirstOutlet = col(mh, "Stock Value (Using HQ Last Cost)") + 1;
  const cFirstDc = col(mh, "DC2");
  const dcCols: number[] = [];
  mh.forEach((h, i) => i >= cFirstDc && DC_COLUMNS.has(norm(h)) && dcCols.push(i));

  // --- Sales (monthly) ---
  const sales = sheet(wb, "(A1) Sales Analyse");
  const sh = sales[1];
  const sCode = col(sh, "ARMS Code");
  const monthCols = sh.map((h, i) => (norm(h).startsWith("salesqty") ? i : -1)).filter((i) => i >= 0);
  const lastMonths = monthCols.slice(-MONTHS_FOR_SPEED);
  const perDay: Record<string, number> = {};
  for (const r of sales.slice(2)) {
    const code = String(r[sCode] ?? "").trim();
    if (!code) continue;
    const total = lastMonths.reduce((n, c) => n + num(r[c]), 0);
    perDay[code] = total / lastMonths.length / 30;
  }

  // --- Pending orders, lead time, pack size ---
  const ord = sheet(wb, "(B1) Order Qty");
  const oh = ord[1];
  const oCode = col(oh, "ARMS Code");
  const oPending = col(oh, "Pending Order Qty");
  const oLead = col(oh, "TTl Lead time (Days)");
  const oPack = col(oh, "Pack Size");
  const oDisplay = col(oh, "All outlet Max Display Qty (IT)");
  const oSalesMonth = col(oh, "Sales/month (from sales analyse sheet)");
  const orderInfo = new Map<string, { pending: number; lead: number; pack: number; display: number }>();
  for (const r of ord.slice(2)) {
    const code = String(r[oCode] ?? "").trim();
    if (!code) continue;
    orderInfo.set(code, { pending: num(r[oPending]), lead: num(r[oLead]), pack: num(r[oPack]), display: num(r[oDisplay]) });
    // Your file's own monthly sales figure (forecast) wins; blank = keep the last-3-months average.
    if (String(r[oSalesMonth] ?? "").trim() !== "") perDay[code] = num(r[oSalesMonth]) / 30;
  }

  const skus: Data["skus"] = [];
  const stock: Data["stock"] = [];
  for (const r of master.slice(1)) {
    const code = String(r[cCode] ?? "").trim();
    if (!code) continue;
    const info = orderInfo.get(code);
    const lead = info?.lead || DEFAULT_LEAD_DAYS;
    skus.push({
      sku: code,
      name: String(r[cDesc] ?? "").trim(),
      supplier: SHOW_FAKE_VENDORS ? fakeVendor(String(r[cVendor] ?? "").trim()) : String(r[cVendor] ?? "").trim() || "Unknown supplier",
      // No reorder level in the file: use "stock that sells during the lead time".
      reorderLevel: Math.ceil((perDay[code] ?? 0) * lead),
      leadTimeDays: lead,
      packSize: info?.pack || 1,
      onOrder: info?.pending ?? 0,
      displayQty: info?.display ?? 0,
      unitCost: SHOW_FAKE_PRICES ? fakePrice(code) : num(r[cCost]),
      rank: cRank >= 0 ? String(r[cRank] ?? "").trim() || undefined : undefined,
    });
    let dc = 0;
    let outlets = 0;
    for (let c = cFirstOutlet; c < cFirstDc; c++) outlets += num(r[c]);
    for (const c of dcCols) dc += num(r[c]);
    stock.push({ sku: code, location: "DC", onHand: dc }, { sku: code, location: "Outlets", onHand: outlets });
  }
  if (!skus.length) throw new Error("No SKU rows found in the workbook.");
  return { skus, stock, sales: [], perDay };
}
