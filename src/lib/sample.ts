import type { Data } from "./inventory";

// Made-up demo data so the tool works before real files are loaded.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function makeSample(): Data {
  const r = rng(42);
  const suppliers = ["Fresh Foods Co", "Global Beverages", "HomeCare Supplies", "Snack Masters"];
  const words = ["Rice", "Noodles", "Juice", "Soap", "Chips", "Tea", "Oil", "Biscuits", "Detergent", "Water", "Coffee", "Sauce", "Cereal", "Tissue", "Candy"];
  const outlets = ["Outlet A", "Outlet B", "Outlet C"];
  const skus: Data["skus"] = [];
  const stock: Data["stock"] = [];
  const sales: Data["sales"] = [];

  for (let i = 1; i <= 80; i++) {
    const sku = `SKU${String(i).padStart(4, "0")}`;
    const popularity = i % 9 === 0 ? 0 : Math.pow(r(), 2) * 6; // every 9th item never sells
    const packSize = [1, 6, 12, 24][Math.floor(r() * 4)];
    skus.push({
      sku,
      name: `${words[i % words.length]} ${["500g", "1L", "250ml", "Pack"][i % 4]} #${i}`,
      supplier: suppliers[i % suppliers.length],
      reorderLevel: Math.round(popularity * 10),
      leadTimeDays: [3, 5, 7, 10][i % 4],
      packSize,
      onOrder: i % 11 === 0 ? packSize * 5 : 0,
    });
    const dcStock = i % 9 === 0 ? 120 : i % 5 === 0 ? 0 : Math.round(popularity * (5 + r() * 60));
    stock.push({ sku, location: "DC", onHand: dcStock });
    for (const o of outlets) stock.push({ sku, location: o, onHand: Math.round(popularity * r() * 8) });
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.UTC(2026, 9, 6 + d)).toISOString().slice(0, 10);
      for (const o of outlets) {
        const qty = Math.round(popularity * r() * 1.5);
        if (qty > 0) sales.push({ sku, outlet: o, date, qty });
      }
    }
  }
  return { skus, stock, sales };
}
