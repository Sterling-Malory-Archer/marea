/** Listing URL state helpers, shared by server and client components. */
export type SP = Record<string, string | string[] | undefined>;

export const MULTI = ["brand", "size", "color"] as const;
export type MultiKey = (typeof MULTI)[number];

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Return a query string with `key` set (or removed when value is null). Changing filters resets paging. */
export function withParam(sp: SP, key: string, value: string | null, keepPage = false) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === key || (!keepPage && k === "page")) continue;
    const s = Array.isArray(v) ? v.join(",") : v;
    if (s) q.set(k, s);
  }
  if (value !== null && value !== "") q.set(key, value);
  const s = q.toString();
  return s ? `?${s}` : "?";
}

/** Toggle one value inside a comma-separated multi-value parameter. */
export function toggleValue(sp: SP, key: MultiKey, value: string) {
  const cur = list(sp[key]);
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  return withParam(sp, key, next.length ? next.join(",") : null);
}

export const activeFilterCount = (sp: SP) =>
  MULTI.reduce((n, k) => n + list(sp[k]).length, 0) + (first(sp.minPrice) || first(sp.maxPrice) ? 1 : 0) + (first(sp.inStock) ? 1 : 0) + (first(sp.sale) ? 1 : 0);
