import { z } from "zod";

/** Storefront languages. Base tables hold English; other locales live in *_translations. */
export const LOCALES = ["en", "me"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const TRANSLATED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export const localeSchema = z.enum(LOCALES).catch(DEFAULT_LOCALE);

/** Prisma include fragment: fetch only the requested locale's translation row. */
export const tr = (locale: Locale) => ({ where: { locale } });

/**
 * Overlay translated fields onto a base record. Empty/NULL translated values fall
 * back to the base (English) value, so partial translations never show blanks.
 */
export function localize<B extends object, K extends keyof B>(
  base: B & { translations?: unknown[] },
  fields: readonly K[],
): Omit<B, "translations"> {
  const { translations, ...rest } = base;
  const t = (translations?.[0] ?? null) as Partial<Record<K, unknown>> | null;
  if (!t) return rest as Omit<B, "translations">;
  const out = { ...rest } as Record<string, unknown>;
  for (const f of fields) {
    const v = t[f];
    if (v !== null && v !== undefined && v !== "") out[f as string] = v;
  }
  return out as Omit<B, "translations">;
}
