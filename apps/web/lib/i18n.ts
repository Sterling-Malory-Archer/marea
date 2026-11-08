/**
 * Storefront languages. English lives at the root (/…), Montenegrin under /me/….
 * `htmlLang` uses sr-Latn-ME so screen readers pick a Latin-script South Slavic
 * voice (no engine ships a "cnr" voice yet); `hreflang` uses sr-ME, which search
 * engines understand. Both are one-line changes here if a different tag is preferred.
 */
export const LOCALES = ["en", "me"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "marea_locale";

export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export const LOCALE_META: Record<Locale, { label: string; short: string; htmlLang: string; hreflang: string; intl: string; og: string }> = {
  en: { label: "English", short: "EN", htmlLang: "en", hreflang: "en", intl: "en-IE", og: "en_GB" },
  me: { label: "Crnogorski", short: "ME", htmlLang: "sr-Latn-ME", hreflang: "sr-ME", intl: "sr-Latn-ME", og: "sr_ME" },
};

/** Build a URL for a locale: English paths are unprefixed. */
export function localePath(locale: Locale, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Strip any locale prefix from a browser path. */
export function stripLocale(pathname: string) {
  for (const l of LOCALES) {
    if (l === DEFAULT_LOCALE) continue;
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}
