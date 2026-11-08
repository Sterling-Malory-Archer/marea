import { Prisma } from "@marea/db";
import type { AppContext } from "../../context.js";
import { localize, tr, type Locale } from "../../lib/i18n.js";
import { productCardInclude, toProductCard } from "./product-card.js";

export const SORTS = ["relevance", "newest", "price_asc", "price_desc", "bestselling"] as const;
export type Sort = (typeof SORTS)[number];

export interface ListingQuery {
  locale: Locale;
  category?: string;
  collection?: string;
  scope?: "new" | "sale";
  q?: string;
  brands: string[];
  sizes: string[];
  colors: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  sale: boolean;
  sort?: Sort;
  page: number;
  pageSize: number;
}

/** Turn free text into a safe MySQL BOOLEAN MODE query: every word required, prefix-matched. */
export function fulltextQuery(q: string): string | null {
  const words = q
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .slice(0, 8);
  return words.length ? words.map((w) => `+${w}*`).join(" ") : null;
}

/** Product ids matching a search, best match first (title/description in any language, brand, reference, SKU). */
async function searchIds(ctx: AppContext, q: string): Promise<number[]> {
  const ft = fulltextQuery(q);
  const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await ctx.db.$queryRaw<{ id: number; score: number }[]>`
    SELECT id, MAX(score) AS score FROM (
      ${ft ? Prisma.sql`SELECT id, MATCH(title, description) AGAINST (${ft} IN BOOLEAN MODE) * 2 AS score
        FROM products WHERE MATCH(title, description) AGAINST (${ft} IN BOOLEAN MODE)
      UNION ALL
      SELECT productId AS id, MATCH(title, description) AGAINST (${ft} IN BOOLEAN MODE) * 2 AS score
        FROM product_translations WHERE MATCH(title, description) AGAINST (${ft} IN BOOLEAN MODE)
      UNION ALL` : Prisma.empty}
      SELECT p.id, 1 AS score FROM products p LEFT JOIN brands b ON b.id = p.brandId
        WHERE p.reference LIKE ${like} OR b.name LIKE ${like}
      UNION ALL
      SELECT productId AS id, 1 AS score FROM product_variants WHERE sku LIKE ${like}
    ) hits GROUP BY id ORDER BY score DESC LIMIT 500`;
  return rows.map((r) => Number(r.id));
}

async function salesRanking(ctx: AppContext): Promise<Map<number, number>> {
  const since = new Date(Date.now() - 90 * 864e5);
  const rows = await ctx.db.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, order: { paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, placedAt: { gte: since } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId!, r._sum.quantity ?? 0]));
}

/** Category + ancestors (for breadcrumbs) + children (for navigation), localized. */
export async function loadCategory(ctx: AppContext, path: string, locale: Locale) {
  const segments = path.split("/");
  const ancestorPaths = segments.map((_, i) => segments.slice(0, i + 1).join("/"));
  const rows = await ctx.db.category.findMany({
    where: { path: { in: ancestorPaths }, isActive: true },
    include: { translations: tr(locale) },
  });
  const current = rows.find((r) => r.path === path);
  if (!current) return null;
  const children = await ctx.db.category.findMany({
    where: { parentId: current.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { translations: tr(locale) },
  });
  const fields = ["name", "description", "seoTitle", "seoDescription"] as const;
  const c = localize(current, fields);
  return {
    id: c.id,
    name: c.name,
    path: c.path,
    description: c.description,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    breadcrumbs: ancestorPaths
      .map((p) => rows.find((r) => r.path === p))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => {
        const l = localize(r, ["name"] as const);
        return { name: l.name, path: l.path };
      }),
    children: children.map((k) => {
      const l = localize(k, ["name"] as const);
      return { id: l.id, name: l.name, path: l.path };
    }),
  };
}

export async function loadCollection(ctx: AppContext, slug: string, locale: Locale) {
  const row = await ctx.db.collection.findFirst({ where: { slug, isActive: true }, include: { translations: tr(locale) } });
  if (!row) return null;
  const c = localize(row, ["title", "eyebrow", "description", "seoTitle", "seoDescription"] as const);
  return { id: c.id, slug: c.slug, title: c.title, eyebrow: c.eyebrow, description: c.description, seoTitle: c.seoTitle, seoDescription: c.seoDescription, imageUrl: c.imageKey ? ctx.storage.publicUrl(c.imageKey) : null };
}

/**
 * Faceted product listing. Candidates are narrowed in MySQL (status, category,
 * collection, search — all indexed), then facets and filters are evaluated in one
 * pass. Each facet's counts apply every *other* active filter, so shoppers always
 * see how many results a click will give. Sized for boutique catalogues (thousands
 * of products); beyond ~20k, move facets to SQL aggregates or a search engine.
 */
export async function listProducts(ctx: AppContext, query: ListingQuery) {
  const now = new Date();
  const where: Prisma.ProductWhereInput = { status: "ACTIVE", publishedAt: { lte: now } };
  if (query.category) where.categories = { some: { category: { isActive: true, OR: [{ path: query.category }, { path: { startsWith: `${query.category}/` } }] } } };
  if (query.collection) where.collections = { some: { collection: { slug: query.collection, isActive: true } } };
  if (query.scope === "new") where.isNewArrival = true;
  if (query.scope === "sale") where.isOnSale = true;

  let relevance: number[] | null = null;
  if (query.q) {
    relevance = await searchIds(ctx, query.q);
    where.id = { in: relevance };
  }

  const candidates = await ctx.db.product.findMany({
    where,
    select: {
      id: true,
      priceMinor: true,
      isOnSale: true,
      publishedAt: true,
      brand: { select: { slug: true, name: true } },
      variants: {
        where: { isActive: true },
        select: {
          size: { select: { label: true, sortOrder: true, scale: { select: { code: true, name: true } } } },
          color: { select: { slug: true, name: true, hex: true, sortOrder: true, translations: tr(query.locale) } },
          inventory: { select: { quantityOnHand: true, quantityReserved: true, allowBackorder: true } },
        },
      },
    },
  });

  const sizeSet = new Set(query.sizes);
  const colorSet = new Set(query.colors);
  const brandSet = new Set(query.brands);

  const items = candidates.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      size: v.size.label,
      color: v.color.slug,
      available: !!v.inventory && (v.inventory.allowBackorder || v.inventory.quantityOnHand - v.inventory.quantityReserved > 0),
    })),
  }));

  type Item = (typeof items)[number];
  type Dim = "brand" | "size" | "color" | "price" | "sale";
  // Size and colour must be satisfied by the same purchasable variant.
  const variantOk = (it: Item, skip?: Dim) =>
    it.variants.some(
      (v) =>
        (skip === "size" || !sizeSet.size || sizeSet.has(v.size)) &&
        (skip === "color" || !colorSet.size || colorSet.has(v.color)) &&
        (!(query.inStock || (skip !== "size" && sizeSet.size)) || v.available),
    );
  const passes = (it: Item, skip?: Dim) =>
    (skip === "brand" || !brandSet.size || (it.brand && brandSet.has(it.brand.slug))) &&
    (skip === "price" || ((query.minPrice == null || it.priceMinor >= query.minPrice) && (query.maxPrice == null || it.priceMinor <= query.maxPrice))) &&
    (skip === "sale" || !query.sale || it.isOnSale) &&
    variantOk(it, skip);

  // ── Facets ──
  const brandCounts = new Map<string, { slug: string; name: string; count: number }>();
  const sizeCounts = new Map<string, { label: string; scale: string; scaleName: string; sortOrder: number; count: number }>();
  const colorCounts = new Map<string, { slug: string; name: string; hex: string; sortOrder: number; count: number }>();
  let priceMin = Infinity, priceMax = 0, saleCount = 0;

  const sizeMeta = new Map<string, { scale: string; scaleName: string; sortOrder: number }>();
  const colorMeta = new Map<string, { name: string; hex: string; sortOrder: number }>();
  for (const p of candidates)
    for (const v of p.variants) {
      sizeMeta.set(v.size.label, { scale: v.size.scale.code, scaleName: v.size.scale.name, sortOrder: v.size.sortOrder });
      const c = localize(v.color, ["name"] as const);
      colorMeta.set(c.slug, { name: c.name, hex: c.hex, sortOrder: c.sortOrder });
    }

  for (const it of items) {
    if (it.brand && passes(it, "brand")) {
      const b = brandCounts.get(it.brand.slug) ?? { ...it.brand, count: 0 };
      b.count++;
      brandCounts.set(it.brand.slug, b);
    }
    if (passes(it, "price")) {
      priceMin = Math.min(priceMin, it.priceMinor);
      priceMax = Math.max(priceMax, it.priceMinor);
    }
    if (it.isOnSale && passes(it, "sale")) saleCount++;
    if (passes(it, "size")) {
      const seen = new Set<string>();
      for (const v of it.variants)
        if (v.available && (!colorSet.size || colorSet.has(v.color)) && !seen.has(v.size)) {
          seen.add(v.size);
          const m = sizeMeta.get(v.size)!;
          const s = sizeCounts.get(v.size) ?? { label: v.size, ...m, count: 0 };
          s.count++;
          sizeCounts.set(v.size, s);
        }
    }
    if (passes(it, "color")) {
      const seen = new Set<string>();
      for (const v of it.variants)
        if ((!sizeSet.size || (sizeSet.has(v.size) && v.available)) && (!query.inStock || v.available) && !seen.has(v.color)) {
          seen.add(v.color);
          const m = colorMeta.get(v.color)!;
          const c = colorCounts.get(v.color) ?? { slug: v.color, ...m, count: 0 };
          c.count++;
          colorCounts.set(v.color, c);
        }
    }
  }

  // ── Filter, sort, paginate ──
  const matched = items.filter((it) => passes(it));
  const sort: Sort = query.sort ?? (relevance ? "relevance" : "newest");
  if (sort === "relevance" && relevance) {
    const rank = new Map(relevance.map((id, i) => [id, i]));
    matched.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  } else if (sort === "price_asc") matched.sort((a, b) => a.priceMinor - b.priceMinor || b.id - a.id);
  else if (sort === "price_desc") matched.sort((a, b) => b.priceMinor - a.priceMinor || b.id - a.id);
  else if (sort === "bestselling") {
    const sales = await salesRanking(ctx);
    matched.sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0) || +(b.publishedAt ?? 0) - +(a.publishedAt ?? 0));
  } else matched.sort((a, b) => +(b.publishedAt ?? 0) - +(a.publishedAt ?? 0) || b.id - a.id);

  const total = matched.length;
  const pageIds = matched.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((m) => m.id);
  const rows = pageIds.length
    ? await ctx.db.product.findMany({ where: { id: { in: pageIds } }, include: productCardInclude(query.locale) })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  return {
    items: pageIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => toProductCard(r, ctx.storage)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    sort,
    facets: {
      brands: [...brandCounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
      sizes: [...sizeCounts.values()].sort((a, b) => a.scaleName.localeCompare(b.scaleName) || a.sortOrder - b.sortOrder),
      colors: [...colorCounts.values()].sort((a, b) => a.sortOrder - b.sortOrder).map(({ sortOrder: _s, ...c }) => c),
      price: priceMax > 0 ? { min: priceMin, max: priceMax } : null,
      saleCount,
    },
  };
}
