import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Prisma } from "@marea/db";
import type { AppContext } from "../../context.js";
import { validated } from "../../middleware/http.js";
import { productCardInclude, toProductCard } from "../catalog/product-card.js";
import { getSettings } from "../settings/settings.js";

const activeWindow = (now: Date) => ({
  isActive: true,
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ],
});

const PUBLISHED: Prisma.ProductWhereInput = { status: "ACTIVE" };

export function storefrontRouter(ctx: AppContext) {
  const r = Router();
  const media = (key: string | null | undefined) => (key ? ctx.storage.publicUrl(key) : null);

  /** Global chrome: settings, announcement bar, navigation, footer categories. */
  r.get("/layout", async (_req, res, next) => {
    try {
      const now = new Date();
      const [settings, announcements, categories] = await Promise.all([
        getSettings(ctx.db),
        ctx.db.announcementMessage.findMany({
          where: activeWindow(now),
          orderBy: { sortOrder: "asc" },
          select: { id: true, message: true, linkLabel: true, linkUrl: true },
        }),
        ctx.db.category.findMany({
          where: { isActive: true, showInNav: true, depth: { lte: 1 } },
          orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, parentId: true, name: true, slug: true, path: true, depth: true, imageKey: true },
        }),
      ]);
      const roots = categories
        .filter((c) => c.depth === 0)
        .map((c) => ({
          ...c,
          imageUrl: media(c.imageKey),
          children: categories.filter((k) => k.parentId === c.id).map(({ imageKey: _i, ...k }) => k),
        }));
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({
        settings: {
          storeName: settings["store.name"],
          tagline: settings["store.tagline"],
          currency: settings["store.currency"],
          locale: settings["store.locale"],
          freeShippingOverMinor: settings["shipping.freeOverMinor"],
          codEnabled: settings["checkout.codEnabled"],
          returnsDays: settings["returns.days"],
          supportEmail: settings["store.supportEmail"],
          supportPhone: settings["store.supportPhone"],
          instagramUrl: settings["store.instagramUrl"],
        },
        announcements,
        navigation: roots,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Homepage content, entirely database-driven. */
  r.get("/home", async (_req, res, next) => {
    try {
      const now = new Date();
      const published = { ...PUBLISHED, publishedAt: { lte: now } };
      const [hero, collections, newArrivalRows, editorial, services, bestsellerIds] = await Promise.all([
        ctx.db.heroSlide.findMany({ where: activeWindow(now), orderBy: { sortOrder: "asc" }, take: 5 }),
        ctx.db.collection.findMany({
          where: { isActive: true, featuredOnHome: true },
          orderBy: { sortOrder: "asc" },
          take: 4,
          include: { _count: { select: { products: { where: { product: published } } } } },
        }),
        ctx.db.product.findMany({
          where: published,
          orderBy: [{ isNewArrival: "desc" }, { publishedAt: "desc" }],
          take: 8,
          include: productCardInclude,
        }),
        ctx.db.contentBlock.findFirst({ where: { placement: "HOME_EDITORIAL", isActive: true }, orderBy: { sortOrder: "asc" } }),
        ctx.db.contentBlock.findMany({ where: { placement: "HOME_SERVICE_STRIP", isActive: true }, orderBy: { sortOrder: "asc" }, take: 4 }),
        // Best sellers: units sold over the last 90 days on paid orders.
        ctx.db.orderItem.groupBy({
          by: ["productId"],
          where: {
            productId: { not: null },
            order: { paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, placedAt: { gte: new Date(now.getTime() - 90 * 864e5) } },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 8,
        }),
      ]);

      let bestsellerRows = [] as typeof newArrivalRows;
      const ranked = bestsellerIds.map((b) => b.productId!).filter(Boolean);
      if (ranked.length >= 4) {
        const rows = await ctx.db.product.findMany({ where: { ...published, id: { in: ranked } }, include: productCardInclude });
        bestsellerRows = ranked.map((id) => rows.find((r) => r.id === id)).filter((r): r is (typeof rows)[number] => !!r);
      } else {
        // Not enough sales history yet: fall back to the curated "bestsellers" collection.
        const curated = await ctx.db.collectionProduct.findMany({
          where: { collection: { slug: "bestsellers", isActive: true }, product: published },
          orderBy: { sortOrder: "asc" },
          take: 8,
          include: { product: { include: productCardInclude } },
        });
        bestsellerRows = curated.map((c) => c.product);
      }

      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json({
        hero: hero.map((h) => ({ ...h, imageUrl: media(h.imageKey) })),
        featuredCollections: collections.map(({ _count, ...c }) => ({ ...c, imageUrl: media(c.imageKey), productCount: _count.products })),
        newArrivals: newArrivalRows.map((p) => toProductCard(p, ctx.storage)),
        bestsellers: bestsellerRows.map((p) => toProductCard(p, ctx.storage)),
        editorial: editorial ? { ...editorial, imageUrl: media(editorial.imageKey) } : null,
        services,
      });
    } catch (err) {
      next(err);
    }
  });

  // ───────────── Newsletter ─────────────
  const newsletterLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: ctx.env.NODE_ENV === "test" ? 1000 : 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
  });

  const CONSENT = "I agree to receive MAREA news and offers by e-mail. I can unsubscribe at any time.";

  r.post(
    "/newsletter",
    newsletterLimiter,
    validated(
      {
        body: z.object({
          email: z.email("Enter a valid e-mail address").max(254).transform((e) => e.toLowerCase().trim()),
          consent: z.literal(true, "Please confirm you agree to receive e-mails"),
          source: z.string().max(60).optional(),
        }),
      },
      async (_req, res, { body }) => {
        const now = new Date();
        await ctx.db.newsletterSubscriber.upsert({
          where: { email: body.email },
          // Re-subscribing an unsubscribed address is an explicit new consent.
          update: { status: "SUBSCRIBED", consentAt: now, consentText: CONSENT, unsubscribedAt: null },
          create: { email: body.email, status: "SUBSCRIBED", source: body.source ?? "footer", consentText: CONSENT, consentAt: now },
        });
        // Same response whether or not the address already existed (no enumeration).
        res.status(201).json({ ok: true });
      },
    ),
  );

  return r;
}
