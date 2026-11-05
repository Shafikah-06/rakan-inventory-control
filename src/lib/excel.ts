import * as XLSX from "xlsx";
import type { Data, Item } from "./inventory";

type Row = Record<string, unknown>;

// Match column names loosely: "SKU Code", "sku_code" and "Sku" all work.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function pick(row: Row, names: string[]): unknown {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => norm(x) === n);
    if (k !== undefined) return row[k];
  }
  return undefined;
}
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
function dateStr(v: unknown) {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return str(v).slice(0, 10);
}

async function readRows(file: File, sheetName: string): Promise<Row[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames.find((n) => norm(n) === norm(sheetName)) ?? wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: "" });
}

export async function readSkus(file: File): Promise<Data["skus"]> {
  const rows = await readRows(file, "SKUs");
  const out = rows
    .map((r) => ({
      sku: str(pick(r, ["sku", "skucode", "itemcode"])),
      name: str(pick(r, ["name", "description", "itemname", "product"])),
      supplier: str(pick(r, ["supplier", "vendor"])) || "Unknown supplier",
      reorderLevel: num(pick(r, ["reorderlevel", "reorderpoint", "minstock"])),
      leadTimeDays: num(pick(r, ["leadtimedays", "leadtime"])) || 7,
      packSize: num(pick(r, ["packsize", "pack", "moq"])) || 1,
      onOrder: num(pick(r, ["onorder", "openpo", "ordered"])),
    }))
    .filter((r) => r.sku);
  if (!out.length) throw new Error("No SKU rows found. Needed columns: SKU, Name, Supplier, ReorderLevel, LeadTimeDays, PackSize.");
  return out;
}

export async function readStock(file: File): Promise<Data["stock"]> {
  const rows = await readRows(file, "Stock");
  const out = rows
    .map((r) => ({
      sku: str(pick(r, ["sku", "skucode", "itemcode"])),
      location: str(pick(r, ["location", "outlet", "store", "warehouse"])) || "DC",
      onHand: num(pick(r, ["onhand", "stock", "qty", "quantity"])),
    }))
    .filter((r) => r.sku);
  if (!out.length) throw new Error("No stock rows found. Needed columns: SKU, Location, OnHand.");
  return out;
}

export async function readSales(file: File): Promise<Data["sales"]> {
  const rows = await readRows(file, "Sales");
  const out = rows
    .map((r) => ({
      sku: str(pick(r, ["sku", "skucode", "itemcode"])),
      outlet: str(pick(r, ["outlet", "location", "store"])),
      date: dateStr(pick(r, ["date", "saledate"])),
      qty: num(pick(r, ["qty", "quantity", "sold", "unitssold"])),
    }))
    .filter((r) => r.sku && r.date);
  if (!out.length) throw new Error("No sales rows found. Needed columns: SKU, Outlet, Date, Qty.");
  return out;
}

function save(sheets: Record<string, Row[]>, filename: string) {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), n.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const itemRow = (i: Item) => ({
  SKU: i.sku,
  Name: i.name,
  Supplier: i.supplier,
  "DC stock": i.dcStock,
  "Total stock": i.totalStock,
  "On order": i.onOrder,
  "Reorder level": i.reorderLevel,
  "Sold per day": Number(i.perDay.toFixed(2)),
  "Days left": i.daysLeft === null ? "" : Math.round(i.daysLeft),
  Speed: i.speed,
  "Suggested order": i.suggestedQty,
  Note: i.note,
});

export const exportStock = (items: Item[]) => save({ Stock: items.map(itemRow) }, `stock-report-${stamp()}.xlsx`);
export const exportLowStock = (items: Item[]) =>
  save({ "Low stock": items.filter((i) => i.lowStock).map(itemRow) }, `low-stock-${stamp()}.xlsx`);
export function exportReplenishment(items: Item[]) {
  const rows = items.filter((i) => i.suggestedQty > 0).sort((a, b) => a.supplier.localeCompare(b.supplier));
  save({ Replenishment: rows.map(itemRow) }, `replenishment-${stamp()}.xlsx`);
}
export function exportPo(supplier: string, items: Item[]) {
  save(
    {
      "Draft PO": items.map((i) => ({ SKU: i.sku, Name: i.name, "Pack size": i.packSize, "Order qty": i.suggestedQty })),
    },
    `PO-draft-${supplier.replace(/[^a-z0-9]+/gi, "-")}-${stamp()}.xlsx`,
  );
}

export function downloadSampleFiles(data: Data) {
  save(
    {
      SKUs: data.skus.map((s) => ({ SKU: s.sku, Name: s.name, Supplier: s.supplier, ReorderLevel: s.reorderLevel, LeadTimeDays: s.leadTimeDays, PackSize: s.packSize, OnOrder: s.onOrder })),
      Stock: data.stock.map((s) => ({ SKU: s.sku, Location: s.location, OnHand: s.onHand })),
      Sales: data.sales.map((s) => ({ SKU: s.sku, Outlet: s.outlet, Date: s.date, Qty: s.qty })),
    },
    "sample-files.xlsx",
  );
}
