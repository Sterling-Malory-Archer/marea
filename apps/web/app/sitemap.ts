import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/api";
import { categoryHref, productHref } from "@/lib/format";
import { LOCALE_META, LOCALES, localePath } from "@/lib/i18n";
import { absolute } from "@/lib/seo";

// Built from the live catalogue on request (cached for 10 minutes by the API fetch).
export const dynamic = "force-dynamic";

/** One entry per English URL, each listing its Montenegrin alternate (hreflang). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemapData();
  const entry = (path: string, lastModified?: string, priority?: number): MetadataRoute.Sitemap[number] => ({
    url: absolute(localePath("en", path)),
    ...(lastModified ? { lastModified } : {}),
    ...(priority ? { priority } : {}),
    alternates: { languages: Object.fromEntries([...LOCALES.map((l) => [LOCALE_META[l].hreflang, absolute(localePath(l, path))]), ["x-default", absolute(localePath("en", path))]]) },
  });
  return [
    entry("/", undefined, 1),
    entry("/new", undefined, 0.8),
    entry("/sale", undefined, 0.6),
    ...data.categories.map((c) => entry(categoryHref(c.path), c.updatedAt, 0.7)),
    ...data.collections.map((c) => entry(`/collections/${c.slug}`, c.updatedAt, 0.6)),
    ...data.products.map((p) => entry(productHref(p.slug), p.updatedAt, 0.8)),
    ...data.pages.map((p) => entry(`/${p.slug}`, p.updatedAt, 0.3)),
  ];
}
