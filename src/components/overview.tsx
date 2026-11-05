"use client";

import { useState, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, ClipboardList, Package, Store, Truck, Users, FileText } from "lucide-react";
import type { Item } from "@/lib/inventory";
import { exportPo } from "@/lib/excel";
import { CountUp } from "@/components/count-up";

type Group = { supplier: string; rows: Item[]; units: number };

const ALERT_RANKS = ["SuperTop", "TopItem", "BasicItem", "SlowItem", "NewItem", "NonTrade"];
const fmt = (n: number) => Math.round(n).toLocaleString();
const rm = (n: number) => `RM ${Math.round(n).toLocaleString()}`;
const rmShort = (n: number) => (n >= 1e6 ? `RM ${(n / 1e6).toFixed(1)}M` : rm(n));

export function Overview({ items, groups, lowItems }: { items: Item[]; groups: Group[]; lowItems: Item[] }) {
  const [vendorSearch, setVendorSearch] = useState("");
  const [chosen, setChosen] = useState(""); // a vendor picked from the drop-down
  const [vendorLimit, setVendorLimit] = useState(8);
  const dc = items.reduce((n, i) => n + i.dcStock, 0);
  const outlets = items.reduce((n, i) => n + (i.totalStock - i.dcStock), 0);
  const pendingUnits = items.reduce((n, i) => n + i.onOrder, 0);
  const pendingSkus = items.filter((i) => i.onOrder > 0).length;
  const orderUnits = groups.reduce((n, g) => n + g.units, 0);
  const orderSkus = groups.reduce((n, g) => n + g.rows.length, 0);
  const value = (rows: Item[]) => rows.reduce((n, r) => n + r.suggestedQty * (r.unitCost ?? 0), 0);
  const totalValue = groups.reduce((n, g) => n + value(g.rows), 0);

  // Stock available (DC + outlets) grouped by the file's own item ranking, best rank first.
  const byRank = new Map<string, { stock: number; skus: number; oos: number }>();
  for (const i of items) {
    const key = i.rank || "Unranked";
    const e = byRank.get(key) ?? { stock: 0, skus: 0, oos: 0 };
    e.stock += i.dcStock; // DC on-hand (OHB)
    e.skus += 1;
    if (i.dcStock <= 0) e.oos += 1; // out of stock at the DC
    byRank.set(key, e);
  }
  const rankData = [...byRank.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => ({ name: name.replace(/^\d+\.\s*/, ""), code: name, ...v }));
  const locData = [
    { name: "DC", value: dc, color: "#4338ca" },
    { name: "Outlets", value: outlets, color: "#15803d" },
  ];
  const allVendors = groups.map((g) => ({ ...g, value: value(g.rows) }));
  const q = vendorSearch.trim().toLowerCase();
  const matching = allVendors.filter((g) => (chosen ? g.supplier === chosen : !q || g.supplier.toLowerCase().includes(q)));
  const shownVendors = matching.slice(0, vendorLimit);
  // Low stock alerts focus on the main rankings only, best ranking first, then least days left.
  const focusLow = lowItems
    .filter((i) => ALERT_RANKS.some((r) => i.rank?.endsWith(r)))
    .sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? "") || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  const alerts = focusLow.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={<Package />} tone="slate" label="DC stock" value={dc} sub="units available" />
        <Kpi icon={<Store />} tone="green" label="Outlet stock" value={outlets} sub="units in outlets" />
        <Kpi icon={<ClipboardList />} tone="amber" label="Pending orders" value={pendingUnits} sub={`${fmt(pendingSkus)} SKUs awaiting delivery`} />
        <Kpi icon={<Users />} tone="rose" label="Vendors to order from" value={groups.length} sub="need a new PO" />
        <Kpi icon={<Truck />} tone="blue" label="SKUs to order" value={orderSkus} sub={`${fmt(orderUnits)} units`} />
        <Kpi icon={<FileText />} tone="violet" label="Est. order value" value={totalValue} format={(n) => (n > 0 ? rmShort(n) : "–")} sub="at last HQ cost" />
      </section>

      {/* Charts + alerts */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Stock by location">
          <DonutWithLegend data={locData} centerLabel="Total units" />
        </Panel>
        <Panel title="SKU, DC OHB & OOS by ranking" aside={<span className="text-sm text-muted">OOS = no stock at DC</span>}>
          <RankingTable data={rankData} />
        </Panel>
        <Panel
          title="Low stock alerts"
          icon={<AlertTriangle className="size-5 text-red-600" aria-hidden />}
          aside={<span className="text-sm text-muted">{fmt(focusLow.length)} below reorder level</span>}
        >
          <p className="mb-3 text-xs text-muted">Focus: {ALERT_RANKS.join(", ")}</p>
          {alerts.length === 0 && <p className="text-sm text-muted">Nothing in these rankings is below its reorder level.</p>}
          <ul className="space-y-3">
            {alerts.map((i) => (
              <li key={i.sku} className="flex gap-3">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  <p className="text-xs text-muted">
                    Stock: {fmt(i.totalStock)} · Reorder level: {fmt(i.reorderLevel)}
                    {i.daysLeft !== null && ` · ${Math.round(i.daysLeft)} days left`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {/* Vendors needing a PO */}
      <Panel
        title="Vendors requiring a new PO"
        icon={<Truck className="size-5 text-primary" aria-hidden />}
        aside={
          <span className="text-sm text-muted">
            Showing {shownVendors.length} of {matching.length}
            {matching.length !== allVendors.length && ` (all ${allVendors.length} vendors)`}
          </span>
        }
      >
        {/* Choose a vendor: pick from the list, or type to search */}
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Choose vendor</span>
            <select
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value);
                setVendorSearch("");
                setVendorLimit(8);
              }}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="">All vendors ({allVendors.length})</option>
              {[...allVendors]
                .sort((a, b) => a.supplier.localeCompare(b.supplier))
                .map((g) => (
                  <option key={g.supplier} value={g.supplier}>
                    {g.supplier} — {g.rows.length} SKUs
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Or search by name</span>
            <input
              value={vendorSearch}
              disabled={!!chosen}
              onChange={(e) => {
                setVendorSearch(e.target.value);
                setVendorLimit(8);
              }}
              placeholder="Type a vendor name"
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 disabled:bg-slate-100"
            />
          </label>
        </div>
        {chosen && (
          <button onClick={() => setChosen("")} className="mb-3 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:border-primary hover:text-primary">
            Clear · show all vendors
          </button>
        )}
        {matching.length === 0 && <p className="text-sm text-muted">No vendor matches that name.</p>}
        {/* Phone: one card per vendor */}
        <ul className="divide-y divide-line sm:hidden">
          {shownVendors.map((g) => (
            <li key={g.supplier} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{g.supplier}</p>
                <p className="text-xs text-muted">
                  {fmt(g.rows.length)} SKUs · {fmt(g.units)} units{g.value > 0 && ` · ${rm(g.value)}`}
                </p>
              </div>
              <button
                onClick={() => exportPo(g.supplier, g.rows)}
                className="min-h-11 shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-white"
              >
                Draft PO
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="p-2">Vendor</th>
                <th className="p-2 text-right"># SKUs</th>
                <th className="p-2 text-right">Qty to order</th>
                <th className="p-2 text-right">Est. value</th>
                <th className="p-2 text-right">PO</th>
              </tr>
            </thead>
            <tbody>
              {shownVendors.map((g) => (
                <tr key={g.supplier} className="border-t border-line hover:bg-indigo-50/50">
                  <td className="p-2 font-medium">{g.supplier}</td>
                  <td className="p-2 text-right">{fmt(g.rows.length)}</td>
                  <td className="p-2 text-right">{fmt(g.units)}</td>
                  <td className="p-2 text-right">{g.value > 0 ? rm(g.value) : "–"}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => exportPo(g.supplier, g.rows)}
                      className="min-h-9 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark"
                    >
                      Draft PO
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matching.length > vendorLimit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setVendorLimit(vendorLimit + 13)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:border-primary hover:text-primary"
            >
              Show 13 more
            </button>
            <button
              onClick={() => setVendorLimit(matching.length)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:border-primary hover:text-primary"
            >
              Show all {matching.length}
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
};

function Kpi({ icon, tone, label, value, sub, format }: { icon: ReactNode; tone: string; label: string; value: number; sub: string; format?: (n: number) => string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-line sm:p-4">
      <div className={`hidden size-11 shrink-0 place-items-center rounded-lg sm:grid [&>svg]:size-6 ${TONES[tone]}`} aria-hidden>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight sm:text-2xl"><CountUp value={value} format={format} /></p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
    </div>
  );
}

function Panel({ title, icon, aside, children }: { title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-line">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RankingTable({ data }: { data: { name: string; code: string; stock: number; skus: number; oos: number }[] }) {
  const totals = data.reduce((t, d) => ({ skus: t.skus + d.skus, stock: t.stock + d.stock, oos: t.oos + d.oos }), { skus: 0, stock: 0, oos: 0 });
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pr-2 font-medium">Ranking</th>
            <th className="px-2 py-2 text-right font-medium">Total SKU</th>
            <th className="px-2 py-2 text-right font-medium">DC OHB</th>
            <th className="py-2 pl-2 text-right font-medium">OOS</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.code} className="border-b border-line">
              <td className="py-2 pr-2 font-medium">{d.name}</td>
              <td className="px-2 py-2 text-right tabular-nums"><CountUp value={d.skus} /></td>
              <td className="px-2 py-2 text-right tabular-nums"><CountUp value={d.stock} /></td>
              <td className="py-2 pl-2 text-right tabular-nums">
                <span className={d.oos > 0 ? "font-semibold text-red-700" : ""}><CountUp value={d.oos} /></span>{" "}
                <span className="text-xs text-muted">({pct(d.oos, d.skus)}%)</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="py-2 pr-2">Total</td>
            <td className="px-2 py-2 text-right tabular-nums"><CountUp value={totals.skus} /></td>
            <td className="px-2 py-2 text-right tabular-nums"><CountUp value={totals.stock} /></td>
            <td className="py-2 pl-2 text-right tabular-nums">
              <CountUp value={totals.oos} /> <span className="text-xs font-normal text-muted">({pct(totals.oos, totals.skus)}%)</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DonutWithLegend({ data, centerLabel }: { data: { name: string; value: number; color: string }[]; centerLabel: string }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={50} outerRadius={72} paddingAngle={2} stroke="none">
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => Number(v).toLocaleString()} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-base font-bold tabular-nums leading-tight"><CountUp value={total} /></p>
            <p className="text-xs text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span className="text-muted">{d.name}</span>
            <span className="font-semibold tabular-nums">{fmt(d.value)}</span>
            <span className="text-xs text-muted">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
