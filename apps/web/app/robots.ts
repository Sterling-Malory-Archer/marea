import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/lib/i18n";
import { absolute } from "@/lib/seo";

// Read SITE_INDEXING at request time, so one build can serve staging and production.
export const dynamic = "force-dynamic";

/** Private and per-visitor pages stay out of search; staging sites block everything. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXING === "off") return { rules: { userAgent: "*", disallow: "/" } };
  const priv = ["/account", "/checkout", "/bag", "/wishlist", "/search"];
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", ...LOCALES.flatMap((l) => priv.map((p) => localePath(l, p)))],
    },
    sitemap: absolute("/sitemap.xml"),
  };
}
