import { z } from "zod";
import type { Db } from "@marea/db";
import { localize, tr, type Locale } from "../../lib/i18n.js";
import { getSettings, type StoreSettings as Settings } from "../settings/settings.js";

/** URL segments that belong to other routes — a page can't take them. */
const RESERVED = new Set(["c", "p", "collections", "account", "checkout", "bag", "search", "new", "sale", "wishlist", "admin", "api", "media", "me", "en", "sitemap.xml", "robots.txt"]);

export const pageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/, "Use lowercase words with hyphens, optionally one folder, e.g. help/returns")
  .refine((s) => !RESERVED.has(s.split("/")[0]!), "This address is used by another part of the store");

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
export const pageBody = z.object({
  slug: pageSlug,
  kind: z.enum(["STANDARD", "CONTACT", "SHIPPING", "SIZE_GUIDE", "LEGAL"]).default("STANDARD"),
  title: z.string().trim().min(1).max(160),
  intro: opt(500),
  body: opt(50000),
  seoTitle: opt(160),
  seoDescription: opt(320),
  isPublished: z.boolean().default(true),
  needsReview: z.boolean().default(false),
});

/** Fill {{tokens}} from settings. Unknown or empty values become an em dash so gaps are visible, never "undefined". */
export function fillTokens(text: string | null, s: Settings, locale: Locale): string | null {
  if (!text) return text;
  const values: Record<string, string | number | null | undefined> = {
    storeName: s["store.name"],
    supportEmail: s["store.supportEmail"],
    supportPhone: s["store.supportPhone"],
    returnDays: s["returns.days"],
    companyName: s["company.name"] || s["store.name"],
    companyAddress: s["company.address"],
    companyTaxId: s["company.taxId"],
    companyRegistrationNo: s["company.registrationNo"],
    tagline: locale === "me" && s["store.tagline.me"] ? s["store.tagline.me"] : s["store.tagline"],
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    if (!(k in values)) return m;
    const v = values[k];
    return v === null || v === undefined || v === "" ? "—" : String(v).replace(/\n+/g, ", ");
  });
}

/** A published page in the visitor's language, with live extras for its kind. */
export async function loadPage(db: Db, slug: string, locale: Locale) {
  const page = await db.page.findUnique({ where: { slug }, include: { translations: tr(locale) } });
  if (!page || !page.isPublished) return null;
  const settings = await getSettings(db);
  const l = localize(page, ["title", "intro", "body", "seoTitle", "seoDescription"] as const);
  const fill = (v: string | null) => fillTokens(v, settings, locale);

  let extras: Record<string, unknown> = {};
  if (page.kind === "SHIPPING") {
    const zones = await db.shippingZone.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      include: { methods: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    });
    extras = {
      zones: zones.filter((z) => z.methods.length).map((z) => ({
        name: z.name,
        countryCodes: z.countryCodes as string[],
        methods: z.methods.map((m) => ({ code: m.code, name: m.name, priceMinor: m.priceMinor, freeOverMinor: m.freeOverMinor, minDays: m.minDays, maxDays: m.maxDays, cashOnDelivery: m.allowsCashOnDelivery && settings["checkout.codEnabled"] })),
      })),
    };
  } else if (page.kind === "SIZE_GUIDE") {
    const scales = await db.sizeScale.findMany({ orderBy: { id: "asc" } });
    extras = { guides: scales.filter((s) => s.guide).map((s) => ({ code: s.code, name: s.name, guide: s.guide })) };
  } else if (page.kind === "CONTACT") {
    extras = { contact: { email: settings["store.supportEmail"] || null, phone: settings["store.supportPhone"] || null, instagramUrl: settings["store.instagramUrl"] || null } };
  }

  return {
    slug: page.slug,
    kind: page.kind,
    title: fill(l.title)!,
    intro: fill(l.intro),
    body: fill(l.body),
    seoTitle: fill(l.seoTitle),
    seoDescription: fill(l.seoDescription),
    needsReview: page.needsReview,
    updatedAt: page.updatedAt,
    ...extras,
  };
}
