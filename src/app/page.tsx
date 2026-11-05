"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Overview } from "@/components/overview";
import { analyse, groupBySupplier, type Data, type Item, type Speed } from "@/lib/inventory";
import { makeSample } from "@/lib/sample";
import { parseOrderingWorkbook } from "@/lib/workbook";
import {
  downloadSampleFiles,
  exportLowStock,
  exportPo,
  exportReplenishment,
  exportStock,
  readSales,
  readSkus,
  readStock,
} from "@/lib/excel";

const SPEED_BADGE: Record<Speed, string> = {
  Fast: "bg-green-100 text-green-800",
  Medium: "bg-blue-100 text-blue-800",
  Slow: "bg-amber-100 text-amber-800",
  Dead: "bg-red-100 text-red-800",
};

type Tab = "order" | "low" | "all";

export default function Home() {
  const [data, setData] = useState<Data>(() => makeSample());
  const [usingSample, setUsingSample] = useState(true);
  const [coverDays, setCoverDays] = useState(14);
  const [tab, setTab] = useState<Tab>("order");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [auth, setAuth] = useState<"checking" | "needed" | "ok">("checking");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [savedInfo, setSavedInfo] = useState("");

  // Load the shared data saved in Supabase (needs the team password once).
  async function loadShared() {
    try {
      const res = await fetch("/api/data");
      if (res.status === 401) return setAuth("needed");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAuth("ok");
      if (json.dataset) {
        setData(json.dataset.data);
        setUsingSample(false);
        setSavedInfo(`${json.dataset.source_name ?? "file"} · saved ${new Date(json.dataset.updated_at).toLocaleString()}`);
      }
    } catch (e) {
      setAuth("ok");
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not load the saved data." });
    }
  }
  useEffect(() => {
    queueMicrotask(loadShared);
  }, []);

  async function login() {
    setLoginError("");
    const res = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    if (!res.ok) return setLoginError("Wrong password.");
    setAuth("checking");
    loadShared();
  }

  const items = useMemo(() => analyse(data, { coverDays }), [data, coverDays]);
  const groups = useMemo(() => groupBySupplier(items), [items]);
  const lowItems = useMemo(() => items.filter((i) => i.lowStock).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)), [items]);

  async function update(next: Data, sourceName = "upload") {
    setData(next);
    setUsingSample(false);
    try {
      const res = await fetch("/api/data", { method: "PUT", body: JSON.stringify({ data: next, sourceName }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSavedInfo(`${sourceName} · saved ${new Date().toLocaleString()}`);
    } catch (e) {
      setMessage({ ok: false, text: `Shown here, but NOT saved for others: ${e instanceof Error ? e.message : "save failed"}` });
    }
  }

  async function upload(kind: "skus" | "stock" | "sales", file: File | undefined) {
    if (!file) return;
    try {
      if (kind === "skus") update({ ...data, skus: await readSkus(file) });
      if (kind === "stock") update({ ...data, stock: await readStock(file) });
      if (kind === "sales") update({ ...data, sales: await readSales(file) });
      setMessage({ ok: true, text: `Loaded ${file.name}. The numbers below are updated.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    }
  }

  async function loadSampleFolder() {
    setMessage({ ok: true, text: "Reading the file from the sample folder… this can take a few seconds." });
    try {
      const res = await fetch("/api/sample");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      update(json);
      setMessage({ ok: true, text: `Loaded Ordering File.xlsx: ${json.skus.length.toLocaleString()} SKUs.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not read the sample file." });
    }
  }

  async function uploadWorkbook(file: File | undefined) {
    if (!file) return;
    setMessage({ ok: true, text: "Reading the workbook… this can take a few seconds." });
    try {
      const next = parseOrderingWorkbook(new Uint8Array(await file.arrayBuffer()));
      update(next);
      setMessage({ ok: true, text: `Loaded ${file.name}: ${next.skus.length.toLocaleString()} SKUs.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    }
  }

  function backToSample() {
    setData(makeSample());
    setUsingSample(true);
    setMessage({ ok: true, text: "Showing demo data on this screen only. The saved data is not deleted." });
  }

  if (auth !== "ok") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 p-6">
        <Image src="/rakan-logo.png" alt="Rakan – Rakan Anda Yang Dipercayai" width={1712} height={653} priority className="h-16 w-auto self-start" />
        <h1 className="text-2xl font-bold">Inventory Control & Purchase Order</h1>
        {auth === "checking" ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
            className="space-y-3"
          >
            <label className="block text-sm">
              Team password
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            {loginError && <p className="text-sm text-red-700">{loginError}</p>}
            <button className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-dark">Open</button>
          </form>
        )}
      </main>
    );
  }

  const shown: Item[] = (tab === "low" ? lowItems : items).filter(
    (i) => !search || `${i.sku} ${i.name} ${i.supplier}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Image src="/rakan-logo.png" alt="Rakan – Rakan Anda Yang Dipercayai" width={1712} height={653} priority className="h-12 w-auto shrink-0" />
          <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Control & Purchase Order</h1>
          <p className="text-sm text-muted">
            {usingSample ? "Showing demo data – upload your own files below." : `Shared data: ${savedInfo || "your uploaded data"}`}
          </p>
          </div>
        </div>
        <label className="text-sm">
          Days of stock to cover after delivery{" "}
          <input
            type="number"
            min={0}
            value={coverDays}
            onChange={(e) => setCoverDays(Math.max(0, Number(e.target.value) || 0))}
            className="ml-1 w-16 rounded-lg border border-slate-300 bg-white px-2 py-1"
          />
        </label>
      </header>

      <Overview items={items} groups={groups} lowItems={lowItems} />

      {/* Upload + export (tucked away: the buyer mostly needs the numbers above) */}
      <details className="group rounded-xl bg-white shadow-sm ring-1 ring-line" open={usingSample || !!message}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 py-3 font-semibold">
          Load data &amp; export to Excel
          <span className="text-sm font-normal text-muted group-open:hidden">Show</span>
          <span className="hidden text-sm font-normal text-muted group-open:inline">Hide</span>
        </summary>
      <section className="grid gap-6 border-t border-line p-4 md:grid-cols-2 md:p-6">
        <div className="space-y-2">
          <h2 className="font-semibold">1. Load your ordering file</h2>
          {process.env.NODE_ENV !== "production" && (
            <Btn onClick={loadSampleFolder}>Load &quot;Ordering File.xlsx&quot; from the sample folder</Btn>
          )}
          <FileInput label="Or choose an ordering workbook (same layout)" onFile={uploadWorkbook} />
          <p className="pt-2 text-sm font-medium text-foreground">Or load 3 simple files:</p>
          <FileInput label="SKU list (supplier, reorder level, lead time, pack size)" onFile={(f) => upload("skus", f)} />
          <FileInput label="Current stock (SKU, Location, OnHand)" onFile={(f) => upload("stock", f)} />
          <FileInput label="Recent sales (SKU, Outlet, Date, Qty)" onFile={(f) => upload("sales", f)} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn onClick={() => downloadSampleFiles(makeSample())}>Download example files</Btn>
            {!usingSample && <Btn onClick={backToSample}>Back to demo data</Btn>}
          </div>
          {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.text}</p>}
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">2. Export to Excel</h2>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => exportReplenishment(items)}>Order list</Btn>
            <Btn onClick={() => exportLowStock(items)}>Low stock</Btn>
            <Btn onClick={() => exportStock(items)}>Full stock report</Btn>
          </div>
        </div>
      </section>
      </details>

      {/* Tabs */}
      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-line">
        {(
          [
            ["order", `Order today (${groups.length})`],
            ["low", `Low stock (${lowItems.length})`],
            ["all", `All items (${items.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setLimit(100);
            }}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-primary text-white" : "text-muted hover:bg-slate-100"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "order" ? (
        <section className="space-y-6">
          {groups.length === 0 && <p className="text-muted">Nothing needs ordering right now.</p>}
          {groups.map((g) => (
            <div key={g.supplier} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50 p-4">
                <div>
                  <h3 className="font-semibold">{g.supplier}</h3>
                  <p className="text-sm text-muted">
                    {g.rows.length} SKUs · {g.units.toLocaleString()} units
                  </p>
                </div>
                <div className="flex gap-2">
                  <Btn onClick={() => exportPo(g.supplier, g.rows)}>Draft PO (Excel)</Btn>
                  <Btn onClick={() => window.print()}>Print</Btn>
                </div>
              </div>
              <Table rows={g.rows} showSupplier={false} />
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-3">
          <input
            placeholder="Search SKU, name or supplier"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(100);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 md:w-96"
          />
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line">
            <Table rows={shown.slice(0, limit)} showSupplier />
          </div>
          {shown.length > limit && <Btn onClick={() => setLimit(limit + 100)}>Show more ({shown.length - limit} left)</Btn>}
          {shown.length === 0 && <p className="text-muted">No matches.</p>}
        </section>
      )}
    </main>
  );
}

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-primary hover:text-primary print:hidden">
      {children}
    </button>
  );
}

function FileInput({ label, onFile }: { label: string; onFile: (f: File | undefined) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-foreground">{label}</span>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="mt-1 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white hover:file:bg-primary-dark"
      />
    </label>
  );
}

function Table({ rows, showSupplier }: { rows: Item[]; showSupplier: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-sm uppercase tracking-wide text-muted">
          <tr>
            <th className="p-2">SKU</th>
            <th className="p-2">Name</th>
            {showSupplier && <th className="p-2">Supplier</th>}
            <th className="p-2 text-right">DC</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2 text-right">On order</th>
            <th className="p-2 text-right">Sold/day</th>
            <th className="p-2 text-right">Days left</th>
            <th className="p-2">Speed</th>
            <th className="p-2 text-right">Order qty</th>
            <th className="p-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.sku} className="border-t border-line hover:bg-slate-50">
              <td className="p-2 font-mono text-sm">{i.sku}</td>
              <td className="p-2">{i.name}</td>
              {showSupplier && <td className="p-2">{i.supplier}</td>}
              <td className="p-2 text-right">{i.dcStock}</td>
              <td className="p-2 text-right">{i.totalStock}</td>
              <td className="p-2 text-right">{i.onOrder}</td>
              <td className="p-2 text-right">{i.perDay.toFixed(1)}</td>
              <td
                className={`p-2 text-right ${
                  i.daysLeft !== null && i.daysLeft < 7 ? "font-semibold text-red-700" : i.daysLeft !== null && i.daysLeft < 14 ? "font-semibold text-amber-700" : ""
                }`}
              >
                {i.daysLeft === null ? "–" : Math.round(i.daysLeft)}
              </td>
              <td className="p-2">
                <span className={`rounded px-2 py-0.5 text-sm ${SPEED_BADGE[i.speed]}`}>{i.speed}</span>
              </td>
              <td className="p-2 text-right font-bold text-primary">{i.suggestedQty ? i.suggestedQty.toLocaleString() : "–"}</td>
              <td className="p-2 text-muted">{i.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
