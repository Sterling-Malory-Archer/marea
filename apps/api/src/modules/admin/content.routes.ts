import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { badRequest, notFound, unprocessable } from "../../lib/errors.js";
import { slugify } from "../../lib/util.js";
import { idParam, patchSchema, validated } from "../../middleware/http.js";
import { requirePermission } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";

const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const link = z.string().trim().max(500).regex(/^(\/|https:\/\/)/, "Use a path starting with / or an https:// link");
const window = { startsAt: z.coerce.date().nullish(), endsAt: z.coerce.date().nullish() };
const imageKey = z.string().max(512).regex(/^content\/[a-z0-9/_.-]+$/).nullish();

const heroBody = z.object({
  layout: z.enum(["SPLIT_RIGHT", "SPLIT_LEFT", "FULL_BLEED"]).default("SPLIT_RIGHT"),
  eyebrow: opt(80),
  headline: z.string().trim().min(1).max(120),
  body: opt(400),
  primaryCtaLabel: z.string().trim().min(1).max(40),
  primaryCtaUrl: link,
  secondaryCtaLabel: opt(40),
  secondaryCtaUrl: link.nullish(),
  imageKey,
  imageAlt: opt(255),
  imageIsPlaceholder: z.boolean().default(false),
  panelColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#EEECE7"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  ...window,
});
const announcementBody = z.object({ message: z.string().trim().min(1).max(200), linkLabel: opt(60), linkUrl: link.nullish(), isActive: z.boolean().default(true), sortOrder: z.number().int().default(0), ...window });
const blockBody = z.object({
  placement: z.enum(["HOME_EDITORIAL", "HOME_SERVICE_STRIP"]),
  eyebrow: opt(80),
  title: z.string().trim().min(1).max(160),
  body: opt(20000),
  ctaLabel: opt(40),
  ctaUrl: link.nullish(),
  imageKey,
  imageAlt: opt(255),
  imageIsPlaceholder: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
const collectionBody = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  eyebrow: opt(80),
  description: opt(5000),
  imageKey,
  isActive: z.boolean().default(true),
  featuredOnHome: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  seoTitle: opt(160),
  seoDescription: opt(320),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

/** Generic CRUD for a simple content table: list, create, update, delete — audited. */
function crud<T extends z.ZodObject>(
  r: Router,
  ctx: AppContext,
  path: string,
  delegate: "heroSlide" | "announcementMessage" | "contentBlock",
  schema: T,
  orderBy: object,
) {
  const write = requirePermission("content:write");
  const d = () => ctx.db[delegate] as unknown as {
    findMany: (a: unknown) => Promise<unknown[]>;
    findUnique: (a: unknown) => Promise<unknown>;
    create: (a: unknown) => Promise<{ id: number }>;
    update: (a: unknown) => Promise<{ id: number }>;
    delete: (a: unknown) => Promise<unknown>;
  };
  r.get(`/${path}`, requirePermission("dashboard:read"), async (_req, res) => {
    const rows = (await d().findMany({ orderBy, include: { translations: true } })) as { imageKey?: string | null }[];
    res.json({ items: rows.map((row) => ({ ...row, imageUrl: row.imageKey ? ctx.storage.publicUrl(row.imageKey) : null })) });
  });
  r.post(`/${path}`, write, validated({ body: schema }, async (req, res, { body }) => {
    const row = await d().create({ data: body });
    await audit(ctx.db, req, { action: `${path}.create`, entityType: delegate, entityId: row.id, after: row });
    res.status(201).json(row);
  }));
  r.patch(`/${path}/:id`, write, validated({ params: idParam, body: patchSchema(schema) }, async (req, res, { params, body }) => {
    const before = await d().findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Item");
    const row = await d().update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: `${path}.update`, entityType: delegate, entityId: row.id, before, after: row });
    res.json(row);
  }));
  r.delete(`/${path}/:id`, write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await d().findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Item");
    await d().delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: `${path}.delete`, entityType: delegate, entityId: params.id, before });
    res.status(204).end();
  }));
}

export function contentRouter(ctx: AppContext) {
  const r = Router();
  const write = requirePermission("content:write");

  crud(r, ctx, "hero-slides", "heroSlide", heroBody, [{ sortOrder: "asc" }, { id: "asc" }]);
  crud(r, ctx, "announcements", "announcementMessage", announcementBody, [{ sortOrder: "asc" }, { id: "asc" }]);
  crud(r, ctx, "content-blocks", "contentBlock", blockBody, [{ placement: "asc" }, { sortOrder: "asc" }]);

  // ───────────── Collections (with ordered product lists) ─────────────
  r.get("/collections", requirePermission("catalog:read"), async (_req, res) => {
    const rows = await ctx.db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { translations: true, _count: { select: { products: true } } } });
    res.json({ items: rows.map((c) => ({ ...c, imageUrl: c.imageKey ? ctx.storage.publicUrl(c.imageKey) : null })) });
  });

  r.get("/collections/:id", requirePermission("catalog:read"), validated({ params: idParam }, async (_req, res, { params }) => {
    const c = await ctx.db.collection.findUnique({
      where: { id: params.id },
      include: { translations: true, products: { orderBy: { sortOrder: "asc" }, include: { product: { select: { id: true, title: true, reference: true, status: true } } } } },
    });
    if (!c) throw notFound("Collection");
    res.json({ ...c, imageUrl: c.imageKey ? ctx.storage.publicUrl(c.imageKey) : null });
  }));

  r.post("/collections", write, validated({ body: collectionBody }, async (req, res, { body }) => {
    const c = await ctx.db.collection.create({ data: { ...body, slug: body.slug ?? slugify(body.title) } });
    await audit(ctx.db, req, { action: "collection.create", entityType: "collection", entityId: c.id, after: c });
    res.status(201).json(c);
  }));

  r.patch("/collections/:id", write, validated({ params: idParam, body: patchSchema(collectionBody) }, async (req, res, { params, body }) => {
    const before = await ctx.db.collection.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Collection");
    const c = await ctx.db.collection.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "collection.update", entityType: "collection", entityId: c.id, before, after: c });
    res.json(c);
  }));

  r.put("/collections/:id/products", write, validated({ params: idParam, body: z.object({ productIds: z.array(z.number().int().positive()).max(500) }) }, async (req, res, { params, body }) => {
    const ids = [...new Set(body.productIds)];
    if ((await ctx.db.product.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest("Unknown product in list");
    await ctx.db.$transaction([
      ctx.db.collectionProduct.deleteMany({ where: { collectionId: params.id } }),
      ctx.db.collectionProduct.createMany({ data: ids.map((productId, i) => ({ collectionId: params.id, productId, sortOrder: i })) }),
    ]);
    await audit(ctx.db, req, { action: "collection.products", entityType: "collection", entityId: params.id, after: ids });
    res.json({ count: ids.length });
  }));

  r.delete("/collections/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await ctx.db.collection.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Collection");
    await ctx.db.collection.delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: "collection.delete", entityType: "collection", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Media for content (hero, editorial, collections) ─────────────
  r.post("/media", write, upload.single("image"), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw badRequest("Attach an image in the 'image' field");
      let meta;
      try {
        meta = await sharp(file.buffer).metadata();
      } catch {
        throw unprocessable("This file isn't a readable image");
      }
      if (!meta.format || !["jpeg", "png", "webp", "avif"].includes(meta.format)) throw unprocessable("Use JPEG, PNG, WebP or AVIF");
      const { data, info } = await (meta.format === "jpeg" ? sharp(file.buffer).rotate().jpeg({ quality: 88, mozjpeg: true }) : sharp(file.buffer).rotate()).toBuffer({ resolveWithObject: true });
      if (Math.max(info.width, info.height) < 1200) throw unprocessable(`Image is ${info.width}×${info.height}px; use at least 1200px on the long edge for campaign imagery`);
      const ext = meta.format === "jpeg" ? "jpg" : meta.format;
      const key = `content/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      await ctx.storage.put(key, data, `image/${meta.format}`);
      await audit(ctx.db, req, { action: "media.upload", entityType: "media", entityId: key });
      res.status(201).json({ key, url: ctx.storage.publicUrl(key), width: info.width, height: info.height });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
