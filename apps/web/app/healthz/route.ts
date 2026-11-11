// Liveness for the load balancer / container. Reports whether the API is reachable too,
// but stays 200 so a brief API restart doesn't take the storefront out of rotation.
export const dynamic = "force-dynamic";

export async function GET() {
  let api = false;
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/health`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    api = res.ok;
  } catch {}
  return Response.json({ status: "ok", api }, { headers: { "Cache-Control": "no-store" } });
}
