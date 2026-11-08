import type { AppContext } from "../../context.js";
import { localize, tr, type Locale } from "../../lib/i18n.js";
import { discountPercent } from "../../lib/util.js";
import { getSettings } from "../settings/settings.js";
import { loadCategory } from "./catalog.service.js";
import { productCardInclude, toProductCard } from "./product-card.js";

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";

export async function getProductDetail(ctx: AppContext, slug: string, locale: Locale) {
  const now = new Date();
  const row = await ctx.db.product.findFirst({
    where: { slug, status: "ACTIVE", publishedAt: { lte: now } },
    include: {
      brand: true,
      translations: tr(locale),
      primaryCategory: true,
      sizeScale: true,
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { inventory: true, size: true, color: { include: { translations: tr(locale) } } },
      },
    },
  });
  if (!row) return null;

  const p = localize(row, ["title", "subtitle", "description", "composition", "care", "seoTitle", "seoDescription"] as const);
  const category = row.primaryCategory ? await loadCategory(ctx, row.primaryCategory.path, locale) : null;

  // Colours in display order, each with its own images (falling back to shared images).
  const colors = new Map<number, { id: number; slug: string; name: string; hex: string; sortOrder: number }>();
  for (const v of row.variants) colors.set(v.color.id, { ...localize(v.color, ["name"] as const) });
  const colorList = [...colors.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  const image = (img: (typeof row.images)[number]) => ({
    id: img.id,
    url: img.isPlaceholder ? null : ctx.storage.publicUrl(img.storageKey),
    alt: img.altText && locale === "en" ? img.altText : p.title,
    width: img.width,
    height: img.height,
    kind: img.kind,
    colorId: img.colorId,
    isPlaceholder: img.isPlaceholder,
  });
  const shared = row.images.filter((i) => i.colorId == null).map(image);

  // Sizes that exist for this product, in the scale's order.
  const sizes = [...new Map(row.variants.map((v) => [v.size.id, v.size])).values()].sort((a, b) => a.sortOrder - b.sortOrder);

  const variants = row.variants.map((v) => {
    const inv = v.inventory;
    const available = inv ? inv.quantityOnHand - inv.quantityReserved : 0;
    const level: StockLevel = inv?.allowBackorder ? "in_stock" : available <= 0 ? "out_of_stock" : available <= inv!.lowStockThreshold ? "low_stock" : "in_stock";
    return {
      id: v.id,
      sku: v.sku,
      colorSlug: v.color.slug,
      size: v.size.label,
      priceMinor: v.priceMinor ?? row.priceMinor,
      stock: level,
      // Exact counts are only revealed when low, to prompt a decision ("Only 2 left").
      lowStockCount: level === "low_stock" ? available : null,
    };
  });

  // Related: same category first, then the wider department (e.g. other Women items).
  const relatedFor = async () => {
    if (!row.primaryCategory) return [];
    const base = { status: "ACTIVE" as const, publishedAt: { lte: now }, id: { not: row.id } };
    const same = await ctx.db.product.findMany({ where: { ...base, primaryCategoryId: row.primaryCategory.id }, orderBy: { publishedAt: "desc" }, take: 4, include: productCardInclude(locale) });
    if (same.length >= 4) return same;
    const root = row.primaryCategory.path.split("/")[0]!;
    const more = await ctx.db.product.findMany({
      where: { ...base, id: { notIn: [row.id, ...same.map((s) => s.id)] }, categories: { some: { category: { OR: [{ path: root }, { path: { startsWith: `${root}/` } }] } } } },
      orderBy: { publishedAt: "desc" },
      take: 4 - same.length,
      include: productCardInclude(locale),
    });
    return [...same, ...more];
  };

  const [settings, zone, related] = await Promise.all([
    getSettings(ctx.db),
    ctx.db.shippingZone.findFirst({
      where: { isActive: true, countryCodes: { array_contains: "ME" } },
      include: { methods: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    }),
    relatedFor(),
  ]);

  return {
    id: p.id,
    slug: p.slug,
    reference: p.reference,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    composition: p.composition,
    care: p.care,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    brand: row.brand ? { name: row.brand.name, slug: row.brand.slug } : null,
    currency: p.currency,
    priceMinor: p.priceMinor,
    compareAtPriceMinor: p.compareAtPriceMinor,
    discountPercent: discountPercent(p.priceMinor, p.compareAtPriceMinor),
    isNewArrival: p.isNewArrival,
    breadcrumbs: category?.breadcrumbs ?? [],
    colors: colorList.map(({ sortOrder: _s, ...c }) => ({
      ...c,
      images: [...row.images.filter((i) => i.colorId === c.id).map(image), ...shared],
    })),
    sizes: sizes.map((s) => s.label),
    sizeScale: { code: row.sizeScale.code, name: row.sizeScale.name, guide: row.sizeScale.guide },
    variants,
    delivery: {
      methods: (zone?.methods ?? []).map((m) => ({ code: m.code, priceMinor: m.priceMinor, freeOverMinor: m.freeOverMinor, minDays: m.minDays, maxDays: m.maxDays })),
      codEnabled: settings["checkout.codEnabled"],
      returnsDays: settings["returns.days"],
    },
    related: related.map((r) => toProductCard(r, ctx.storage)),
  };
}
