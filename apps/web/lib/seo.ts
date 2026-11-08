import type { Metadata } from "next";
import { LOCALE_META, LOCALES, localePath, type Locale } from "./i18n";

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
