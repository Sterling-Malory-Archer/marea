import type { Metadata } from "next";
import { LOCALE_META, LOCALES, localePath, type Locale } from "./i18n";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Absolute URL for links that leave the page (structured data, sitemaps, share cards). */
export const absolute = (pathOrUrl: string) => (/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : SITE_URL + (pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`));

/** Canonical URL for this language plus hreflang alternates for every language. */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [LOCALE_META[l].hreflang, localePath(l, path)])),
      "x-default": localePath("en", path),
    },
  };
}

export const DEFAULT_SHARE_IMAGE = { url: "/og-default.jpg", width: 1200, height: 630 };

/**
 * Open Graph + Twitter card. Next.js replaces (not merges) a parent's openGraph,
 * so every page that sets one goes through here to keep site name, locale and image.
 */
export function share(locale: Locale, siteName: string, o: { title?: string; description?: string; image?: string | null; path?: string }): Pick<Metadata, "openGraph" | "twitter"> {
  const images = o.image ? [{ url: absolute(o.image) }] : [{ ...DEFAULT_SHARE_IMAGE, url: absolute(DEFAULT_SHARE_IMAGE.url) }];
  return {
    openGraph: {
      type: "website",
      siteName,
      locale: LOCALE_META[locale].og,
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_META[l].og),
      ...(o.title ? { title: o.title } : {}),
      ...(o.description ? { description: o.description } : {}),
      ...(o.path ? { url: absolute(localePath(locale, o.path)) } : {}),
      images,
    },
    twitter: { card: "summary_large_image", ...(o.title ? { title: o.title } : {}), ...(o.description ? { description: o.description } : {}), images: images.map((i) => i.url) },
  };
}

export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
