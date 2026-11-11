import { zoneForCountry } from "../cart/cart.service.js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Prisma } from "@marea/db";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { localeSchema, localize, tr, type Locale } from "../../lib/i18n.js";
import { validated } from "../../middleware/http.js";
import { listProducts, loadCategory, loadCollection, SORTS } from "../catalog/catalog.service.js";
import { getProductDetail } from "../catalog/product-detail.service.js";
import { productCardInclude, toProductCard } from "../catalog/product-card.js";
import { getSettings } from "../settings/settings.js";
import { loadPage, pageSlug } from "../pages/pages.js";
import { limitFor } from "../../lib/rate-limit.js";

const activeWindow = (now: Date) => ({
  isActive: true,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
});

const localeOnly = z.object({ locale: localeSchema });
const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean).slice(0, 30));
const flag = z.enum(["1", "true", "0", "false"]).optional().transform((v) => v === "1" || v === "true");
const minor = z.coerce.number().int().min(0).max(100_000_00).optional();

const listingQuery = z.object({
  locale: localeSchema,
  category: z.string().max(500).regex(/^[a-z0-9/-]+$/).optional(),
  collection: z.string().max(140).regex(/^[a-z0-9-]+$/).optional(),
  scope: z.enum(["new", "sale"]).optional(),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  brand: csv,
  size: csv,
  color: csv,
  minPrice: minor,
  maxPrice: minor,
  inStock: flag,
  sale: flag,
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24).catch(24),
});

const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";

export function storefrontRouter(ctx: AppContext) {
  const r = Router();
  const media = (key: string | null | undefined) => (key ? ctx.storage.publicUrl(key) : null);
  const published = (now: Date): Prisma.ProductWhereInput => ({ status: "ACTIVE", publishedAt: { lte: now } });

  /** Global chrome: settings, announcement bar, navigation. */
  r.get("/layout", validated({ query: localeOnly }, async (_req, res, { query: { locale } }) => {
    const now = new Date();
    const [settings, homeZone, announcements, categories] = await Promise.all([
      getSettings(ctx.db),
      zoneForCountry(ctx.db, "ME"),
      ctx.db.announcementMessage.findMany({ where: activeWindow(now), orderBy: { sortOrder: "asc" }, include: { translations: tr(locale) } }),
      ctx.db.category.findMany({
        where: { isActive: true, showInNav: true, depth: { lte: 1 } },
        orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: { translations: tr(locale) },
      }),
    ]);
    const cats = categories.map((c) => localize(c, ["name"] as const));
    const tagline = locale === "me" && settings["store.tagline.me"] ? settings["store.tagline.me"] : settings["store.tagline"];
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json({
      locale,
      settings: {
        storeName: settings["store.name"],
        tagline,
        currency: settings["store.currency"],
        locale: settings["store.locale"],
        // Single source of truth: the cheapest home-market method's free-delivery threshold.
        freeShippingOverMinor: homeZone?.methods.map((m) => m.freeOverMinor).filter((v): v is number => v != null).sort((x, y) => x - y)[0] ?? null,
        codEnabled: settings["checkout.codEnabled"],
        returnsDays: settings["returns.days"],
        supportEmail: settings["store.supportEmail"],
        supportPhone: settings["store.supportPhone"],
        instagramUrl: settings["store.instagramUrl"],
      },
      announcements: announcements.map((a) => {
        const l = localize(a, ["message", "linkLabel"] as const);
        return { id: l.id, message: l.message, linkLabel: l.linkLabel, linkUrl: l.linkUrl };
      }),
      navigation: cats
        .filter((c) => c.depth === 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          path: c.path,
          imageUrl: media(c.imageKey),
          children: cats.filter((k) => k.parentId === c.id).map((k) => ({ id: k.id, name: k.name, slug: k.slug, path: k.path })),
        })),
    });
  }));

  /** Information pages (/help/…, /about) with live delivery prices, size guides or contact details. */
  r.get("/pages/*slug", validated({ query: localeOnly }, async (req, res, { query: { locale } }) => {
    const raw = (req.params as { slug?: string[] | string }).slug;
    const parsed = pageSlug.safeParse(Array.isArray(raw) ? raw.join("/") : raw);
    const page = parsed.success ? await loadPage(ctx.db, parsed.data, locale) : null;
    if (!page) throw notFound("Page");
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json(page);
  }));

  /** Everything indexable, for sitemap.xml. Locale-independent: slugs are shared by both languages. */
  r.get("/sitemap", async (_req, res) => {
    const now = new Date();
    const [products, categories, collections, pages] = await Promise.all([
      ctx.db.product.findMany({ where: published(now), select: { slug: true, updatedAt: true }, orderBy: { id: "asc" } }),
      ctx.db.category.findMany({ where: { isActive: true }, select: { path: true, updatedAt: true }, orderBy: { path: "asc" } }),
      ctx.db.collection.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { sortOrder: "asc" } }),
      ctx.db.page.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, orderBy: { slug: "asc" } }),
    ]);
    res.set("Cache-Control", "public, max-age=600");
    res.json({ products, categories, collections, pages });
  });

  /** Homepage content, entirely database-driven. */
  r.get("/home", validated({ query: localeOnly }, async (_req, res, { query: { locale } }) => {
    const now = new Date();
    const pub = published(now);
    const [hero, collections, newArrivalRows, editorial, services, bestsellerIds] = await Promise.all([
      ctx.db.heroSlide.findMany({ where: activeWindow(now), orderBy: { sortOrder: "asc" }, take: 5, include: { translations: tr(locale) } }),
      ctx.db.collection.findMany({
        where: { isActive: true, featuredOnHome: true },
        orderBy: { sortOrder: "asc" },
        take: 4,
        include: { translations: tr(locale), _count: { select: { products: { where: { product: pub } } } } },
      }),
      ctx.db.product.findMany({ where: pub, orderBy: [{ isNewArrival: "desc" }, { publishedAt: "desc" }], take: 8, include: productCardInclude(locale) }),
      ctx.db.contentBlock.findFirst({ where: { placement: "HOME_EDITORIAL", isActive: true }, orderBy: { sortOrder: "asc" }, include: { translations: tr(locale) } }),
      ctx.db.contentBlock.findMany({ where: { placement: "HOME_SERVICE_STRIP", isActive: true }, orderBy: { sortOrder: "asc" }, take: 4, include: { translations: tr(locale) } }),
      ctx.db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, order: { paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, placedAt: { gte: new Date(now.getTime() - 90 * 864e5) } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 8,
      }),
    ]);

    let bestsellerRows = [] as typeof newArrivalRows;
    const ranked = bestsellerIds.map((b) => b.productId!).filter(Boolean);
    if (ranked.length >= 4) {
      const rows = await ctx.db.product.findMany({ where: { ...pub, id: { in: ranked } }, include: productCardInclude(locale) });
      bestsellerRows = ranked.map((id) => rows.find((r) => r.id === id)).filter((r): r is (typeof rows)[number] => !!r);
    } else {
      // Not enough sales history yet: fall back to the curated "bestsellers" collection.
      const curated = await ctx.db.collectionProduct.findMany({
        where: { collection: { slug: "bestsellers", isActive: true }, product: pub },
        orderBy: { sortOrder: "asc" },
        take: 8,
        include: { product: { include: productCardInclude(locale) } },
      });
      bestsellerRows = curated.map((c) => c.product);
    }

    const blockFields = ["eyebrow", "title", "body", "ctaLabel", "imageAlt"] as const;
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json({
      hero: hero.map((h) => ({ ...localize(h, ["eyebrow", "headline", "body", "primaryCtaLabel", "secondaryCtaLabel", "imageAlt"] as const), imageUrl: media(h.imageKey) })),
      featuredCollections: collections.map(({ _count, ...c }) => ({ ...localize(c, ["title", "eyebrow", "description"] as const), imageUrl: media(c.imageKey), productCount: _count.products })),
      newArrivals: newArrivalRows.map((p) => toProductCard(p, ctx.storage)),
      bestsellers: bestsellerRows.map((p) => toProductCard(p, ctx.storage)),
      editorial: editorial ? { ...localize(editorial, blockFields), imageUrl: media(editorial.imageKey) } : null,
      services: services.map((s) => localize(s, blockFields)),
    });
  }));

  // ───────────── Catalogue ─────────────
  /** Faceted listing: category, collection, new, sale and search all use this endpoint. */
  r.get("/products", validated({ query: listingQuery }, async (_req, res, { query }) => {
    const result = await listProducts(ctx, {
      locale: query.locale,
      category: query.category,
      collection: query.collection,
      scope: query.scope,
      q: query.q,
      brands: query.brand,
      sizes: query.size,
      colors: query.color,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStock: query.inStock,
      sale: query.sale,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    });
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json(result);
  }));

  r.get("/categories/*path", validated({ query: localeOnly }, async (req, res, { query: { locale } }) => {
    const raw = (req.params as { path?: string[] | string }).path;
    const path = (Array.isArray(raw) ? raw.join("/") : raw ?? "").toLowerCase();
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(path)) throw notFound("Category");
    const category = await loadCategory(ctx, path, locale as Locale);
    if (!category) throw notFound("Category");
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json(category);
  }));

  r.get("/collections/:slug", validated({ query: localeOnly, params: z.object({ slug: z.string().max(140) }) }, async (_req, res, { query: { locale }, params }) => {
    const c = await loadCollection(ctx, params.slug, locale);
    if (!c) throw notFound("Collection");
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json(c);
  }));

  r.get("/products/:slug", validated({ query: localeOnly, params: z.object({ slug: z.string().max(200) }) }, async (_req, res, { query: { locale }, params }) => {
    const product = await getProductDetail(ctx, params.slug, locale);
    if (!product) throw notFound("Product");
    res.set("Cache-Control", PUBLIC_CACHE);
    res.json(product);
  }));

  /** Product cards by id (guest wishlist page). Unpublished ids are silently dropped. */
  r.get("/product-cards", validated({ query: z.object({ locale: localeSchema, ids: csv }) }, async (_req, res, { query }) => {
    const ids = query.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
    const rows = ids.length ? await ctx.db.product.findMany({ where: { id: { in: ids }, ...published(new Date()) }, include: productCardInclude(query.locale) }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json({ items: ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => toProductCard(r, ctx.storage)) });
  }));

  // ───────────── Newsletter ─────────────
  const newsletterLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: limitFor(ctx.env, 10),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
  });

  const CONSENT: Record<Locale, string> = {
    en: "I agree to receive MAREA news and offers by e-mail. I can unsubscribe at any time.",
    me: "Saglasan/na sam da primam MAREA novosti i ponude e-poštom. Mogu se odjaviti u bilo kom trenutku.",
  };

  r.post(
    "/newsletter",
    newsletterLimiter,
    validated(
      {
        body: z.object({
          email: z.email("Enter a valid e-mail address").max(254).transform((e) => e.toLowerCase().trim()),
          consent: z.literal(true, "Please confirm you agree to receive e-mails"),
          source: z.string().max(60).optional(),
          locale: localeSchema.optional(),
        }),
      },
      async (_req, res, { body }) => {
        const now = new Date();
        const consentText = CONSENT[body.locale ?? "en"];
        await ctx.db.newsletterSubscriber.upsert({
          where: { email: body.email },
          // Re-subscribing an unsubscribed address is an explicit new consent.
          update: { status: "SUBSCRIBED", consentAt: now, consentText, unsubscribedAt: null },
          create: { email: body.email, status: "SUBSCRIBED", source: body.source ?? "footer", consentText, consentAt: now },
        });
        // Same response whether or not the address already existed (no enumeration).
        res.status(201).json({ ok: true });
      },
    ),
  );

  return r;
}
