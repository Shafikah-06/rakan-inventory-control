import { isLoggedIn, loadDataset, saveDataset } from "@/lib/server";

export async function GET() {
  if (!(await isLoggedIn())) return Response.json({ error: "login" }, { status: 401 });
  try {
    return Response.json({ dataset: await loadDataset() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not load." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!(await isLoggedIn())) return Response.json({ error: "login" }, { status: 401 });
  try {
    const { data, sourceName } = await req.json();
    if (!data?.skus?.length) return Response.json({ error: "No SKUs in the data." }, { status: 400 });
    await saveDataset(data, String(sourceName ?? "upload"));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 500 });
  }
}
