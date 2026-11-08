import "server-only";
import type { Locale } from "./i18n";
import type { CategoryInfo, CollectionInfo, Home, Layout, Listing, ProductDetail } from "./types";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

export class ApiUnavailableError extends Error {}

/** Server-side fetch against the Express API with short-lived data caching. Returns null on 404. */
async function get<T>(path: string, params: Record<string, string | undefined> = {}, revalidate = 60): Promise<T | null> {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  let res: Response;
  try {
    res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, { next: { revalidate }, headers: { accept: "application/json" } });
  } catch (err) {
    throw new ApiUnavailableError(`API unreachable at ${API}: ${(err as Error).message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

const must = <T,>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`${what} unexpectedly missing`);
  return v;
};

export const getLayout = async (locale: Locale) => must(await get<Layout>("/api/store/layout", { locale }), "layout");
export const getHome = async (locale: Locale) => must(await get<Home>("/api/store/home", { locale }), "home");
export const getCategory = (path: string, locale: Locale) => get<CategoryInfo>(`/api/store/categories/${path}`, { locale });
export const getCollection = (slug: string, locale: Locale) => get<CollectionInfo>(`/api/store/collections/${encodeURIComponent(slug)}`, { locale });
export const getProduct = (slug: string, locale: Locale) => get<ProductDetail>(`/api/store/products/${encodeURIComponent(slug)}`, { locale });

export const LISTING_PARAMS = ["q", "brand", "size", "color", "minPrice", "maxPrice", "inStock", "sale", "sort", "page"] as const;

export async function getListing(base: Record<string, string | undefined>, searchParams: Record<string, string | string[] | undefined>, locale: Locale) {
  const params: Record<string, string | undefined> = { ...base, locale, pageSize: "24" };
  for (const k of LISTING_PARAMS) {
    const v = searchParams[k];
    params[k] = Array.isArray(v) ? v.join(",") : v;
  }
  // Prices appear in whole euros in URLs (readable, shareable); the API works in cents.
  for (const k of ["minPrice", "maxPrice"] as const) {
    const n = Number(params[k]);
    params[k] = params[k] && Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : undefined;
  }
  return must(await get<Listing>("/api/store/products", params, 30), "listing");
}
