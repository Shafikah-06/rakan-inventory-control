// Stock rules for the "Order today" tool. All plain maths, no magic.

export type SkuInfo = {
  sku: string;
  name: string;
  supplier: string;
  reorderLevel: number;
  leadTimeDays: number;
  packSize: number;
  onOrder: number; // already ordered, not yet arrived
  unitCost?: number; // last HQ cost per unit (RM), for order value
  displayQty?: number; // shelf display target (all outlets); stock should not fall below it
  rank?: string; // the file's own item ranking, e.g. "02. TopItem"
};
export type StockRow = { sku: string; location: string; onHand: number };
export type SaleRow = { sku: string; outlet: string; date: string; qty: number };

// perDay (optional): ready-made "sold per day" per SKU, used when sales come as monthly totals.
export type Data = { skus: SkuInfo[]; stock: StockRow[]; sales: SaleRow[]; perDay?: Record<string, number> };

export type Speed = "Fast" | "Medium" | "Slow" | "Dead";

export type Item = SkuInfo & {
  dcStock: number;
  totalStock: number;
  perDay: number;
  daysLeft: number | null; // null = not selling
  speed: Speed;
  lowStock: boolean;
  overstock: boolean;
  suggestedQty: number;
  note: string;
};

export type Settings = { coverDays: number };

const DAY = 86400000;

export function analyse(data: Data, settings: Settings): Item[] {
  const stockBySku = new Map<string, { dc: number; total: number }>();
  for (const s of data.stock) {
    const e = stockBySku.get(s.sku) ?? { dc: 0, total: 0 };
    e.total += s.onHand;
    if (s.location.trim().toUpperCase() === "DC") e.dc += s.onHand;
    stockBySku.set(s.sku, e);
  }
  // Negative stock (system errors, returns not yet booked) counts as zero.
  for (const e of stockBySku.values()) {
    e.dc = Math.max(0, e.dc);
    e.total = Math.max(0, e.total);
  }

  // Sales window = first to last sales date found in the file.
  let min = Infinity;
  let max = -Infinity;
  const soldBySku = new Map<string, number>();
  for (const s of data.sales) {
    const t = new Date(s.date).getTime();
    if (!Number.isNaN(t)) {
      if (t < min) min = t;
      if (t > max) max = t;
    }
    soldBySku.set(s.sku, (soldBySku.get(s.sku) ?? 0) + s.qty);
  }
  const windowDays = isFinite(min) ? Math.max(1, Math.round((max - min) / DAY) + 1) : 1;

  // Fast / medium / slow = rank among items that actually sell.
  const dailySales = (sku: string) => data.perDay?.[sku] ?? (soldBySku.get(sku) ?? 0) / windowDays;
  const selling = data.skus
    .map((k) => ({ sku: k.sku, perDay: dailySales(k.sku) }))
    .filter((k) => k.perDay > 0)
    .sort((a, b) => b.perDay - a.perDay);
  const rank = new Map(selling.map((k, i) => [k.sku, i]));

  return data.skus.map((k) => {
    const st = stockBySku.get(k.sku) ?? { dc: 0, total: 0 };
    const perDay = dailySales(k.sku);
    const r = rank.get(k.sku);
    let speed: Speed = "Dead";
    if (r !== undefined) {
      const pct = r / selling.length;
      speed = pct < 0.2 ? "Fast" : pct < 0.5 ? "Medium" : "Slow";
    }
    const daysLeft = perDay > 0 ? st.total / perDay : null;
    const lowStock = st.total <= k.reorderLevel;
    const overstock = speed === "Dead" ? st.total > 0 : daysLeft !== null && daysLeft > 120;

    let suggestedQty = 0;
    let note = "OK";
    if (speed === "Dead") {
      // No sales, but the shelves still need filling up to the display target.
      const displayNeed = (k.displayQty ?? 0) - st.total - k.onOrder;
      if (displayNeed > 0) {
        const pack = Math.max(1, k.packSize);
        suggestedQty = Math.ceil(Math.ceil(displayNeed / pack) * pack);
        note = "Below shelf display level (no sales)";
      } else note = st.total > 0 ? "Do not reorder – no sales" : "No sales, no stock";
    } else {
      const salesNeed = perDay * (k.leadTimeDays + settings.coverDays) - st.total - k.onOrder;
      // Display top-up: stock left after the lead time (and arriving orders) must still fill the shelves.
      const leftAfterLead = st.total - perDay * k.leadTimeDays;
      const afterArrive = k.onOrder > 0 ? leftAfterLead + k.onOrder : Math.max(0, leftAfterLead);
      const displayNeed = (k.displayQty ?? 0) > 0 ? (k.displayQty ?? 0) - afterArrive : 0;
      const need = Math.max(salesNeed, displayNeed);
      const runningOut = salesNeed > 0 && (lowStock || (daysLeft !== null && daysLeft <= k.leadTimeDays + settings.coverDays));
      if (need > 0 && (runningOut || displayNeed > 0)) {
        const pack = Math.max(1, k.packSize);
        suggestedQty = Math.ceil(Math.ceil(need / pack) * pack);
        note = st.total === 0 ? "Out of stock – order now" : runningOut ? (lowStock ? "Below reorder level" : "Will run out soon") : "Below shelf display level";
      } else if (overstock) note = "Too much stock – hold off";
      else if (lowStock) note = "Below reorder level (already covered by open orders)";
    }
    return { ...k, dcStock: st.dc, totalStock: st.total, perDay, daysLeft, speed, lowStock, overstock, suggestedQty, note };
  });
}

export function groupBySupplier(items: Item[]) {
  const map = new Map<string, Item[]>();
  for (const i of items.filter((x) => x.suggestedQty > 0)) {
    map.set(i.supplier, [...(map.get(i.supplier) ?? []), i]);
  }
  return [...map.entries()]
    .map(([supplier, rows]) => ({
      supplier,
      rows: rows.sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)),
      units: rows.reduce((n, r) => n + r.suggestedQty, 0),
    }))
    .sort((a, b) => b.rows.length - a.rows.length);
}
