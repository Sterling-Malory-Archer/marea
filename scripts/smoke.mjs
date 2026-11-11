#!/usr/bin/env node
/**
 * Post-deploy smoke test — read-only, safe against production.
 *
 *   node scripts/smoke.mjs https://www.example.me
 *   node scripts/smoke.mjs https://staging.example.me --staging   (expects search engines blocked)
 *
 * Exits 1 if any check fails. Run it after every release, and point an uptime
 * monitor at /healthz.
 */
const base = (process.argv[2] ?? "").replace(/\/$/, "");
const staging = process.argv.includes("--staging");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.mjs <base-url> [--staging]");
  process.exit(2);
}
const https = base.startsWith("https://");
const results = [];
const check = async (name, fn) => {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ ok: true, name, note: note ?? "", ms: Date.now() - t });
  } catch (e) {
    results.push({ ok: false, name, note: e.message, ms: Date.now() - t });
  }
};
const get = (path, init = {}) => fetch(base + path, { redirect: "manual", ...init, headers: { "user-agent": "marea-smoke/1.0", ...(init.headers ?? {}) } });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

await check("health: storefront up, API reachable", async () => {
  const r = await get("/healthz");
  assert(r.status === 200, `status ${r.status}`);
  const j = await r.json();
  assert(j.api === true, "API not reachable from the storefront");
});

let html = "";
await check("homepage renders with security headers", async () => {
  const r = await get("/");
  assert(r.status === 200 || r.status === 307, `status ${r.status}`);
  const h = r.headers;
  html = await r.text();
  assert(/script-src 'self' 'nonce-/.test(h.get("content-security-policy") ?? ""), "no nonce-based Content-Security-Policy");
  assert(h.get("x-frame-options") === "DENY", "X-Frame-Options missing");
  assert(h.get("x-content-type-options") === "nosniff", "nosniff missing");
  if (https) assert((h.get("strict-transport-security") ?? "").includes("max-age"), "HSTS missing");
  assert(!h.get("x-powered-by"), "X-Powered-By exposed");
  return `${Math.round(html.length / 1024)} KB`;
});

if (https) {
  await check("http:// redirects to https://", async () => {
    const r = await fetch(base.replace("https://", "http://") + "/", { redirect: "manual" });
    assert([301, 302, 307, 308].includes(r.status) && (r.headers.get("location") ?? "").startsWith("https://"), `status ${r.status}`);
  });
}

await check("Montenegrin site", async () => {
  const r = await get("/me");
  assert(r.status === 200, `status ${r.status}`);
  assert((await r.text()).includes('lang="sr-Latn-ME"'), "html lang is not sr-Latn-ME");
});

await check("/en/… redirects to the canonical address", async () => {
  const r = await get("/en/help/returns");
  assert(r.status === 308, `status ${r.status}`);
});

await check(`robots.txt (${staging ? "staging: blocks everything" : "production: allows indexing"})`, async () => {
  const t = await (await get("/robots.txt")).text();
  if (staging) assert(/Disallow: \/\s*$/m.test(t), "staging robots.txt does not block crawling");
  else {
    assert(/Allow: \//.test(t) && /Disallow: \/admin/.test(t), "unexpected robots.txt");
    assert(t.includes(`Sitemap: ${base}/sitemap.xml`), "sitemap URL doesn't use this domain (check NEXT_PUBLIC_SITE_URL)");
  }
});

let productUrl = "";
await check("sitemap lists products on this domain", async () => {
  const t = await (await get("/sitemap.xml")).text();
  const urls = [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert(urls.length > 0, "empty sitemap");
  assert(urls.every((u) => u.startsWith(base)), "sitemap contains URLs on another domain");
  productUrl = urls.find((u) => u.includes("/p/")) ?? "";
  return `${urls.length} URLs`;
});

await check("a product page renders with structured data", async () => {
  assert(productUrl, "no product in sitemap (is the catalogue published?)");
  const r = await get(productUrl.slice(base.length));
  assert(r.status === 200, `status ${r.status}`);
  const t = await r.text();
  assert(t.includes('"@type":"Product"'), "Product JSON-LD missing");
  assert(/<meta property="og:image" content="https?:\/\//.test(t), "og:image missing");
});

await check("information pages", async () => {
  for (const p of ["/help/shipping", "/help/returns", "/help/privacy", "/help/terms", "/me/help/contact"]) {
    const r = await get(p);
    assert(r.status === 200, `${p} → ${r.status}`);
  }
});

await check("unknown pages return 404", async () => {
  const r = await get(`/smoke-${Date.now()}`);
  assert(r.status === 404, `status ${r.status}`);
});

await check("storefront API through the site", async () => {
  const r = await get("/api/store/layout?locale=en");
  assert(r.status === 200, `status ${r.status}`);
  const j = await r.json();
  assert(j.settings?.currency === "EUR", "unexpected layout payload");
});

await check("admin sign-in page is private", async () => {
  const r = await get("/admin/login");
  assert(r.status === 200, `status ${r.status}`);
  assert(/noindex/.test(await r.text()), "admin page is indexable");
  const api = await get("/api/admin/settings");
  assert(api.status === 401, `admin API without session → ${api.status}`);
});

await check("static assets are cached long-term", async () => {
  const asset = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/)?.[0];
  assert(asset, "no static asset found on the homepage");
  const r = await get(asset);
  assert(r.status === 200 && /immutable/.test(r.headers.get("cache-control") ?? ""), `cache-control: ${r.headers.get("cache-control")}`);
});

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ${r.note}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
