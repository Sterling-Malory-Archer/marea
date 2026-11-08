import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import { Prisma, type Tx } from "@marea/db";
import type { AppContext } from "../../../context.js";
import { badRequest, conflict, notFound, unprocessable } from "../../../lib/errors.js";
import { discountPercent, pageParams, slugify } from "../../../lib/util.js";
import { idParam, validated } from "../../../middleware/http.js";
import { requirePermission } from "../../../middleware/auth.js";
import { audit } from "../../audit/audit.js";
import { adjustOnHand, setOnHand } from "../../inventory/inventory.service.js";

const MAX_PRICE_MINOR = 100_000_00; // €100,000 sanity ceiling
const money = z.number().int().min(0).max(MAX_PRICE_MINOR);
const optText = (max: number) => z.string().trim().max(max).nullish();

const productBase = z.object({
  reference: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only").transform((s) => s.toUpperCase()),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  subtitle: optText(200),
  description: optText(20000),
  composition: optText(2000),
  care: optText(2000),
  brandId: z.number().int().positive().nullish(),
  primaryCategoryId: z.number().int().positive().nullish(),
  categoryIds: z.array(z.number().int().positive()).max(30).optional(),
  collectionIds: z.array(z.number().int().positive()).max(30).optional(),
  sizeScaleId: z.number().int().positive(),
  priceMinor: money.refine((v) => v > 0, "Price must be greater than zero"),
  compareAtPriceMinor: money.nullish(),
  isNewArrival: z.boolean().optional(),
  seoTitle: optText(160),
  seoDescription: optText(320),
});

const productCreate = productBase.superRefine((p, c) => {
  if (p.compareAtPriceMinor != null && p.compareAtPriceMinor <= p.priceMinor)
    c.addIssue({ code: "custom", path: ["compareAtPriceMinor"], message: "Original price must be higher than the selling price" });
});
const productUpdate = productBase.partial();

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  brandId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const variantCreate = z.object({
  colorId: z.number().int().positive(),
  sizeId: z.number().int().positive(),
  sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),
  barcode: z.string().trim().max(64).nullish(),
  priceMinor: money.nullish(),
  initialQuantity: z.number().int().min(0).max(100000).default(0),
});

const variantUpdate = z.object({
  sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),
  barcode: z.string().trim().max(64).nullish(),
  priceMinor: money.nullish(),
  weightGrams: z.number().int().min(0).max(100000).nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  lowStockThreshold: z.number().int().min(0).max(10000).optional(),
  allowBackorder: z.boolean().optional(),
});

const generateBody = z.object({
  colorIds: z.array(z.number().int().positive()).min(1).max(40),
  sizeIds: z.array(z.number().int().positive()).min(1).max(60),
  initialQuantity: z.number().int().min(0).max(100000).default(0),
});

const inventoryBody = z.union([
  z.object({ set: z.number().int().min(0).max(1_000_000), note: z.string().max(255).optional() }),
  z.object({
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((d) => d !== 0, "Delta cannot be zero"),
    reason: z.enum(["ADJUSTMENT", "RESTOCK", "DAMAGE", "RETURN"]),
    note: z.string().max(255).optional(),
  }),
]);

const imageUpdate = z.object({
  altText: optText(255),
  kind: z.enum(["PRODUCT", "ALTERNATE", "DETAIL", "LIFESTYLE"]).optional(),
  colorId: z.number().int().positive().nullish(),
});

const ACCEPTED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);
const MIN_IMAGE_EDGE = 600;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 12 },
});

const variantInclude = {
  color: true,
  size: true,
  inventory: true,
} satisfies Prisma.ProductVariantInclude;

function skuPart(s: string) {
  return s.toUpperCase().replace(/ONE ?SIZE/, "OS").replace(/[^A-Z0-9.]/g, "").slice(0, 8);
}

async function uniqueSlug(tx: Tx, base: string, excludeId?: number) {
  const root = slugify(base) || "product";
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const hit = await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!hit || hit.id === excludeId) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueSku(tx: Tx, base: string) {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await tx.productVariant.findUnique({ where: { sku: candidate }, select: { id: true } }))) return candidate;
  }
  throw conflict(`Could not allocate a unique SKU for ${base}`);
}

export function productsAdminRouter(ctx: AppContext) {
  const r = Router();
  const read = requirePermission("catalog:read");
  const write = requirePermission("catalog:write");
  const stock = requirePermission("inventory:write");

  const imageDto = <T extends { storageKey: string; isPlaceholder: boolean }>(img: T) => ({
    ...img,
    url: img.isPlaceholder ? null : ctx.storage.publicUrl(img.storageKey),
  });

  async function loadProduct(id: number) {
    const product = await ctx.db.product.findUnique({
      where: { id },
      include: {
        brand: true,
        primaryCategory: true,
        sizeScale: { include: { sizes: { orderBy: { sortOrder: "asc" } } } },
        categories: { include: { category: true } },
        collections: { include: { collection: true } },
        variants: { include: variantInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    });
    if (!product) throw notFound("Product");
    return {
      ...product,
      discountPercent: discountPercent(product.priceMinor, product.compareAtPriceMinor),
      images: product.images.map(imageDto),
      variants: product.variants.map((v) => ({
        ...v,
        available: v.inventory ? v.inventory.quantityOnHand - v.inventory.quantityReserved : 0,
      })),
    };
  }

  async function syncLinks(tx: Tx, productId: number, categoryIds?: number[], collectionIds?: number[]) {
    if (categoryIds) {
      await tx.productCategory.deleteMany({ where: { productId } });
      if (categoryIds.length)
        await tx.productCategory.createMany({ data: [...new Set(categoryIds)].map((categoryId) => ({ productId, categoryId })) });
    }
    if (collectionIds) {
      await tx.collectionProduct.deleteMany({ where: { productId } });
      if (collectionIds.length)
        await tx.collectionProduct.createMany({ data: [...new Set(collectionIds)].map((collectionId) => ({ productId, collectionId })) });
    }
  }

  // ───────────── List / read ─────────────
  r.get("/products", read, validated({ query: listQuery }, async (_req, res, { query }) => {
    const where: Prisma.ProductWhereInput = {
      status: query.status,
      brandId: query.brandId,
      ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { reference: { contains: query.q } }, { variants: { some: { sku: { contains: query.q } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      ctx.db.product.count({ where }),
      ctx.db.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        ...pageParams(query.page, query.pageSize),
        include: {
          brand: { select: { id: true, name: true } },
          primaryCategory: { select: { id: true, name: true, path: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
          variants: { select: { id: true, isActive: true, inventory: { select: { quantityOnHand: true, quantityReserved: true, lowStockThreshold: true } } } },
        },
      }),
    ]);
    let items = rows.map(({ variants, images, ...p }) => {
      const available = variants.reduce((s, v) => s + (v.inventory ? v.inventory.quantityOnHand - v.inventory.quantityReserved : 0), 0);
      const lowStockVariants = variants.filter((v) => v.isActive && v.inventory && v.inventory.quantityOnHand - v.inventory.quantityReserved <= v.inventory.lowStockThreshold).length;
      return { ...p, thumbnail: images[0] ? imageDto(images[0]) : null, variantCount: variants.length, available, lowStockVariants };
    });
    if (query.lowStock === "true") items = items.filter((i) => i.lowStockVariants > 0);
    res.json({ items, page: query.page, pageSize: query.pageSize, total });
  }));

  r.get("/products/:id", read, validated({ params: idParam }, async (_req, res, { params }) => {
    res.json(await loadProduct(params.id));
  }));

  // ───────────── Create / update ─────────────
  r.post("/products", write, validated({ body: productCreate }, async (req, res, { body }) => {
    const { categoryIds, collectionIds, ...data } = body;
    const product = await ctx.db.$transaction(async (tx) => {
      const slug = data.slug ?? (await uniqueSlug(tx, data.title));
      const created = await tx.product.create({
        data: {
          ...data,
          slug,
          status: "DRAFT",
          isOnSale: data.compareAtPriceMinor != null && data.compareAtPriceMinor > data.priceMinor,
        },
      });
      const links = categoryIds ?? (data.primaryCategoryId ? [data.primaryCategoryId] : []);
      await syncLinks(tx, created.id, links, collectionIds);
      return created;
    });
    await audit(ctx.db, req, { action: "product.create", entityType: "product", entityId: product.id, after: product });
    res.status(201).json(await loadProduct(product.id));
  }));

  r.patch("/products/:id", write, validated({ params: idParam, body: productUpdate }, async (req, res, { params, body }) => {
    const { categoryIds, collectionIds, ...data } = body;
    const { before, after } = await ctx.db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id: params.id } });
      if (!before) throw notFound("Product");
      if (data.sizeScaleId && data.sizeScaleId !== before.sizeScaleId) {
        const n = await tx.productVariant.count({ where: { productId: params.id } });
        if (n > 0) throw conflict("Remove the existing variants before changing the size system");
      }
      const price = data.priceMinor ?? before.priceMinor;
      const compareAt = data.compareAtPriceMinor === undefined ? before.compareAtPriceMinor : data.compareAtPriceMinor;
      if (compareAt != null && compareAt <= price)
        throw unprocessable("Original price must be higher than the selling price", { field: "compareAtPriceMinor" });
      const after = await tx.product.update({
        where: { id: params.id },
        data: { ...data, isOnSale: compareAt != null && compareAt > price },
      });
      await syncLinks(tx, params.id, categoryIds, collectionIds);
      return { before, after };
    });
    await audit(ctx.db, req, { action: "product.update", entityType: "product", entityId: params.id, before, after });
    res.json(await loadProduct(params.id));
  }));

  // ───────────── Lifecycle ─────────────
  r.post("/products/:id/publish", write, validated({ params: idParam }, async (req, res, { params }) => {
    const p = await ctx.db.product.findUnique({
      where: { id: params.id },
      include: { _count: { select: { images: true } }, variants: { where: { isActive: true }, select: { id: true } } },
    });
    if (!p) throw notFound("Product");
    const problems: string[] = [];
    if (p.variants.length === 0) problems.push("Add at least one active size/colour variant.");
    if (p._count.images === 0) problems.push("Add at least one product image.");
    if (!p.primaryCategoryId) problems.push("Choose a primary category.");
    if (problems.length) throw unprocessable("Product is not ready to publish", { problems });
    const after = await ctx.db.product.update({
      where: { id: params.id },
      data: { status: "ACTIVE", publishedAt: p.publishedAt ?? new Date() },
    });
    await audit(ctx.db, req, { action: "product.publish", entityType: "product", entityId: params.id, before: { status: p.status }, after: { status: after.status } });
    res.json(await loadProduct(params.id));
  }));

  for (const [path, status, action] of [
    ["unpublish", "DRAFT", "product.unpublish"],
    ["archive", "ARCHIVED", "product.archive"],
  ] as const) {
    r.post(`/products/:id/${path}`, write, validated({ params: idParam }, async (req, res, { params }) => {
      const before = await ctx.db.product.findUnique({ where: { id: params.id }, select: { status: true } });
      if (!before) throw notFound("Product");
      await ctx.db.product.update({ where: { id: params.id }, data: { status } });
      await audit(ctx.db, req, { action, entityType: "product", entityId: params.id, before, after: { status } });
      res.json(await loadProduct(params.id));
    }));
  }

  r.delete("/products/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await ctx.db.product.findUnique({
      where: { id: params.id },
      include: { images: true, _count: { select: { orderItems: true } } },
    });
    if (!before) throw notFound("Product");
    if (before._count.orderItems > 0)
      throw conflict("This product appears in past orders. Archive it instead so reporting stays intact.");
    await ctx.db.product.delete({ where: { id: params.id } });
    await Promise.all(before.images.filter((i) => !i.isPlaceholder).map((i) => ctx.storage.delete(i.storageKey).catch(() => undefined)));
    await audit(ctx.db, req, { action: "product.delete", entityType: "product", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Variants ─────────────
  async function createVariant(tx: Tx, productId: number, reference: string, sizeScaleId: number, input: z.infer<typeof variantCreate>, actorUserId: number) {
    const [color, size] = await Promise.all([
      tx.color.findUnique({ where: { id: input.colorId } }),
      tx.size.findUnique({ where: { id: input.sizeId } }),
    ]);
    if (!color) throw notFound("Colour");
    if (!size) throw notFound("Size");
    if (size.sizeScaleId !== sizeScaleId) throw badRequest(`Size ${size.label} does not belong to this product's size system`);
    const sku = input.sku?.toUpperCase() ?? (await uniqueSku(tx, `${reference}-${skuPart(color.slug)}-${skuPart(size.label)}`));
    const variant = await tx.productVariant.create({
      data: {
        productId,
        colorId: color.id,
        sizeId: size.id,
        sku,
        barcode: input.barcode ?? null,
        priceMinor: input.priceMinor ?? null,
        sortOrder: color.sortOrder * 100 + size.sortOrder,
        inventory: { create: { quantityOnHand: 0 } },
      },
    });
    if (input.initialQuantity > 0) await adjustOnHand(tx, variant.id, input.initialQuantity, "INITIAL", { actorUserId });
    return variant;
  }

  r.post("/products/:id/variants", write, validated({ params: idParam, body: variantCreate }, async (req, res, { params, body }) => {
    const variant = await ctx.db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id: params.id } });
      if (!p) throw notFound("Product");
      return createVariant(tx, p.id, p.reference, p.sizeScaleId, body, req.admin!.user.id);
    });
    await audit(ctx.db, req, { action: "variant.create", entityType: "variant", entityId: variant.id, after: variant });
    res.status(201).json(await ctx.db.productVariant.findUnique({ where: { id: variant.id }, include: variantInclude }));
  }));

  /** Create every missing colour × size combination in one go. */
  r.post("/products/:id/variants/generate", write, validated({ params: idParam, body: generateBody }, async (req, res, { params, body }) => {
    const created = await ctx.db.$transaction(async (tx) => {
      const p = await tx.product.findUnique({ where: { id: params.id }, include: { variants: { select: { colorId: true, sizeId: true } } } });
      if (!p) throw notFound("Product");
      const existing = new Set(p.variants.map((v) => `${v.colorId}:${v.sizeId}`));
      const out = [];
      for (const colorId of body.colorIds)
        for (const sizeId of body.sizeIds) {
          if (existing.has(`${colorId}:${sizeId}`)) continue;
          out.push(await createVariant(tx, p.id, p.reference, p.sizeScaleId, { colorId, sizeId, initialQuantity: body.initialQuantity }, req.admin!.user.id));
        }
      return out;
    }, { timeout: 30_000 });
    await audit(ctx.db, req, { action: "variant.generate", entityType: "product", entityId: params.id, after: { created: created.map((v) => v.sku) } });
    res.status(201).json({ created: created.length, product: await loadProduct(params.id) });
  }));

  r.patch("/variants/:id", write, validated({ params: idParam, body: variantUpdate }, async (req, res, { params, body }) => {
    const { lowStockThreshold, allowBackorder, sku, ...data } = body;
    const before = await ctx.db.productVariant.findUnique({ where: { id: params.id }, include: { inventory: true } });
    if (!before) throw notFound("Variant");
    await ctx.db.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: params.id }, data: { ...data, sku: sku?.toUpperCase() } });
      if (lowStockThreshold !== undefined || allowBackorder !== undefined)
        await tx.inventory.update({ where: { variantId: params.id }, data: { lowStockThreshold, allowBackorder } });
    });
    const after = await ctx.db.productVariant.findUnique({ where: { id: params.id }, include: variantInclude });
    await audit(ctx.db, req, { action: "variant.update", entityType: "variant", entityId: params.id, before, after });
    res.json(after);
  }));

  r.delete("/variants/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await ctx.db.productVariant.findUnique({
      where: { id: params.id },
      include: { inventory: true, _count: { select: { orderItems: true } } },
    });
    if (!before) throw notFound("Variant");
    if (before._count.orderItems > 0 || (before.inventory?.quantityReserved ?? 0) > 0) {
      // Keep history intact: deactivate instead of deleting.
      await ctx.db.productVariant.update({ where: { id: params.id }, data: { isActive: false } });
      await audit(ctx.db, req, { action: "variant.deactivate", entityType: "variant", entityId: params.id, before });
      res.json({ deactivated: true });
      return;
    }
    await ctx.db.productVariant.delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: "variant.delete", entityType: "variant", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Inventory ─────────────
  r.post("/variants/:id/inventory", stock, validated({ params: idParam, body: inventoryBody }, async (req, res, { params, body }) => {
    const before = await ctx.db.inventory.findUnique({ where: { variantId: params.id } });
    if (!before) throw notFound("Variant inventory");
    await ctx.db.$transaction(async (tx) => {
      const meta = { actorUserId: req.admin!.user.id, note: body.note };
      if ("set" in body) await setOnHand(tx, params.id, body.set, meta);
      else await adjustOnHand(tx, params.id, body.delta, body.reason, meta);
    });
    const after = await ctx.db.inventory.findUniqueOrThrow({ where: { variantId: params.id } });
    await audit(ctx.db, req, { action: "inventory.adjust", entityType: "variant", entityId: params.id, before, after });
    res.json({ ...after, available: after.quantityOnHand - after.quantityReserved });
  }));

  r.get("/variants/:id/inventory/movements", read, validated({ params: idParam }, async (_req, res, { params }) => {
    const items = await ctx.db.inventoryMovement.findMany({
      where: { variantId: params.id },
      orderBy: { id: "desc" },
      take: 200,
      include: { actor: { select: { id: true, email: true } } },
    });
    res.json({ items });
  }));

  // ───────────── Images ─────────────
  r.post("/products/:id/images", write, upload.array("images", 12), validated({ params: idParam }, async (req, res, { params }) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest("Attach one or more images in the 'images' field");
    const product = await ctx.db.product.findUnique({ where: { id: params.id }, select: { id: true, title: true } });
    if (!product) throw notFound("Product");

    // Validate every file before storing any of them.
    const prepared = [];
    for (const file of files) {
      let meta: Metadata;
      try {
        meta = await sharp(file.buffer).metadata();
      } catch {
        throw unprocessable(`${file.originalname} is not a readable image`);
      }
      if (!meta.format || !ACCEPTED_IMAGE_FORMATS.has(meta.format))
        throw unprocessable(`${file.originalname}: use JPEG, PNG, WebP or AVIF`);
      // Apply EXIF orientation, then strip all metadata (GPS, camera serials …).
      const pipeline = sharp(file.buffer).rotate();
      const { data, info } = await (meta.format === "jpeg" ? pipeline.jpeg({ quality: 90, mozjpeg: true }) : pipeline).toBuffer({ resolveWithObject: true });
      if (Math.min(info.width, info.height) < MIN_IMAGE_EDGE)
        throw unprocessable(`${file.originalname} is ${info.width}×${info.height}px; the shortest edge must be at least ${MIN_IMAGE_EDGE}px`);
      const ext = meta.format === "jpeg" ? "jpg" : meta.format;
      prepared.push({ data, info, ext, mime: `image/${meta.format}` });
    }

    const max = await ctx.db.productImage.aggregate({ where: { productId: product.id }, _max: { sortOrder: true } });
    let sortOrder = (max._max.sortOrder ?? -1) + 1;
    const created = [];
    for (const f of prepared) {
      const key = `products/${product.id}/${crypto.randomUUID()}.${f.ext}`;
      await ctx.storage.put(key, f.data, f.mime);
      created.push(
        await ctx.db.productImage.create({
          data: {
            productId: product.id,
            storageKey: key,
            altText: product.title,
            width: f.info.width,
            height: f.info.height,
            mimeType: f.mime,
            bytes: f.data.length,
            sortOrder: sortOrder++,
          },
        }),
      );
    }
    await audit(ctx.db, req, { action: "image.upload", entityType: "product", entityId: product.id, after: created.map((c) => c.storageKey) });
    res.status(201).json({ items: created.map(imageDto) });
  }));

  r.patch("/images/:id", write, validated({ params: idParam, body: imageUpdate }, async (req, res, { params, body }) => {
    const img = await ctx.db.productImage.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "image.update", entityType: "productImage", entityId: params.id, after: img });
    res.json(imageDto(img));
  }));

  r.put("/products/:id/images/order", write, validated({ params: idParam, body: z.object({ imageIds: z.array(z.number().int().positive()).min(1).max(100) }) }, async (req, res, { params, body }) => {
    const owned = await ctx.db.productImage.findMany({ where: { productId: params.id }, select: { id: true } });
    const ownedIds = new Set(owned.map((o) => o.id));
    if (body.imageIds.length !== ownedIds.size || !body.imageIds.every((id) => ownedIds.has(id)))
      throw badRequest("imageIds must list every image of this product exactly once");
    await ctx.db.$transaction(body.imageIds.map((id, i) => ctx.db.productImage.update({ where: { id }, data: { sortOrder: i } })));
    await audit(ctx.db, req, { action: "image.reorder", entityType: "product", entityId: params.id, after: body.imageIds });
    res.json({ items: (await ctx.db.productImage.findMany({ where: { productId: params.id }, orderBy: { sortOrder: "asc" } })).map(imageDto) });
  }));

  r.delete("/images/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const img = await ctx.db.productImage.findUnique({ where: { id: params.id } });
    if (!img) throw notFound("Image");
    await ctx.db.productImage.delete({ where: { id: params.id } });
    if (!img.isPlaceholder) await ctx.storage.delete(img.storageKey).catch((err) => ctx.log.warn({ err, key: img.storageKey }, "Orphaned object"));
    await audit(ctx.db, req, { action: "image.delete", entityType: "productImage", entityId: params.id, before: img });
    res.status(204).end();
  }));

  return r;
}
