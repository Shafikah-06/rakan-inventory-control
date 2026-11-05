import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Server-only helpers: team password check + talking to the Supabase table.
const COOKIE = "inv_auth";

export const authToken = () =>
  createHash("sha256").update(`inventory-tool:${process.env.APP_PASSWORD ?? ""}`).digest("hex");

export function passwordOk(input: string) {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.APP_PASSWORD ?? "").digest();
  return Boolean(process.env.APP_PASSWORD) && timingSafeEqual(a, b);
}

export async function isLoggedIn() {
  const c = (await cookies()).get(COOKIE)?.value ?? "";
  return Boolean(process.env.APP_PASSWORD) && c === authToken();
}
export const COOKIE_NAME = COOKIE;

function db(path: string, init?: RequestInit) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase is not set up (missing keys).");
  return fetch(`${base}/rest/v1/inventory_datasets${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
  });
}

export async function loadDataset() {
  const res = await db("?id=eq.main&select=data,source_name,updated_at");
  if (!res.ok) throw new Error(`Database read failed (${res.status}).`);
  const rows = await res.json();
  return rows[0] ?? null;
}

export async function saveDataset(data: unknown, sourceName: string) {
  const res = await db("?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "main", data, source_name: sourceName, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Database save failed (${res.status}).`);
}
