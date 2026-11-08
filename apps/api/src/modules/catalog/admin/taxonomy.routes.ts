import { Router } from "express";
import { z } from "zod";
import type { Tx } from "@marea/db";
import type { AppContext } from "../../../context.js";
import { badRequest, conflict, notFound } from "../../../lib/errors.js";
import { slugify } from "../../../lib/util.js";
import { idParam, validated } from "../../../middleware/http.js";
import { requirePermission } from "../../../middleware/auth.js";
import { audit } from "../../audit/audit.js";

const optText = (max: number) => z.string().trim().max(max).nullish();
const slugField = z.string().trim().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes").optional();
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB colour");

const brandBody = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugField,
  description: optText(5000),
  logoKey: optText(512),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  seoTitle: optText(160),
  seoDescription: optText(320),
});

const categoryBody = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugField,
  parentId: z.number().int().positive().nullish(),
  description: optText(5000),
  imageKey: optText(512),
  isActive: z.boolean().optional(),
  showInNav: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  seoTitle: optText(160),
  seoDescription: optText(320),
});

const sizeScaleBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/),
  sizes: z.array(z.string().trim().min(1).max(20)).min(1).max(60).optional(),
});

const colorBody = z.object({
  name: z.string().trim().min(1).max(60),
  slug: slugField,
  hex,
  sortOrder: z.number().int().optional(),
});

/** Recompute `path` and `depth` for a category and its whole subtree. */
async function rebuildSubtree(tx: Tx, rootId: number) {
  const root = await tx.category.findUniqueOrThrow({ where: { id: rootId }, include: { parent: true } });
  const path = root.parent ? `${root.parent.path}/${root.slug}` : root.slug;
  const depth = root.parent ? root.parent.depth + 1 : 0;
  await tx.category.update({ where: { id: rootId }, data: { path, depth } });
  const children = await tx.category.findMany({ where: { parentId: rootId }, select: { id: true } });
  for (const c of children) await rebuildSubtree(tx, c.id);
}

async function assertNotDescendant(tx: Tx, categoryId: number, candidateParentId: number) {
  let cursor: number | null = candidateParentId;
  while (cursor != null) {
    if (cursor === categoryId) throw badRequest("A category cannot be moved inside itself or its own subcategory");
    const parent: { parentId: number | null } | null = await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = parent?.parentId ?? null;
  }
}

export function taxonomyAdminRouter(ctx: AppContext) {
  const r = Router();
  const read = requirePermission("catalog:read");
  const write = requirePermission("catalog:write");

  // ───────────── Brands ─────────────
  r.get("/brands", read, async (_req, res) => {
    const brands = await ctx.db.brand.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    res.json({ items: brands });
  });

  r.post("/brands", write, validated({ body: brandBody }, async (req, res, { body }) => {
    const brand = await ctx.db.brand.create({ data: { ...body, slug: body.slug ?? slugify(body.name) } });
    await audit(ctx.db, req, { action: "brand.create", entityType: "brand", entityId: brand.id, after: brand });
    res.status(201).json(brand);
  }));

  r.patch("/brands/:id", write, validated({ params: idParam, body: brandBody.partial() }, async (req, res, { params, body }) => {
    const before = await ctx.db.brand.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Brand");
    const brand = await ctx.db.brand.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "brand.update", entityType: "brand", entityId: brand.id, before, after: brand });
    res.json(brand);
  }));

  r.delete("/brands/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await ctx.db.brand.findUnique({ where: { id: params.id }, include: { _count: { select: { products: true } } } });
    if (!before) throw notFound("Brand");
    if (before._count.products > 0)
      throw conflict(`Brand has ${before._count.products} product(s). Reassign them or deactivate the brand instead.`);
    await ctx.db.brand.delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: "brand.delete", entityType: "brand", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Categories (tree) ─────────────
  r.get("/categories", read, async (_req, res) => {
    const rows = await ctx.db.category.findMany({
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true, children: true } } },
    });
    res.json({ items: rows });
  });

  r.post("/categories", write, validated({ body: categoryBody }, async (req, res, { body }) => {
    const slug = body.slug ?? slugify(body.name);
    const category = await ctx.db.$transaction(async (tx) => {
      const parent = body.parentId ? await tx.category.findUnique({ where: { id: body.parentId } }) : null;
      if (body.parentId && !parent) throw notFound("Parent category");
      return tx.category.create({
        data: {
          ...body,
          slug,
          path: parent ? `${parent.path}/${slug}` : slug,
          depth: parent ? parent.depth + 1 : 0,
        },
      });
    });
    await audit(ctx.db, req, { action: "category.create", entityType: "category", entityId: category.id, after: category });
    res.status(201).json(category);
  }));

  r.patch("/categories/:id", write, validated({ params: idParam, body: categoryBody.partial() }, async (req, res, { params, body }) => {
    const { before, after } = await ctx.db.$transaction(async (tx) => {
      const before = await tx.category.findUnique({ where: { id: params.id } });
      if (!before) throw notFound("Category");
      if (body.parentId) await assertNotDescendant(tx, params.id, body.parentId);
      await tx.category.update({ where: { id: params.id }, data: body });
      if (body.slug !== undefined || body.parentId !== undefined) await rebuildSubtree(tx, params.id);
      return { before, after: await tx.category.findUniqueOrThrow({ where: { id: params.id } }) };
    });
    await audit(ctx.db, req, { action: "category.update", entityType: "category", entityId: params.id, before, after });
    res.json(after);
  }));

  r.delete("/categories/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const before = await ctx.db.category.findUnique({
      where: { id: params.id },
      include: { _count: { select: { children: true, products: true } } },
    });
    if (!before) throw notFound("Category");
    if (before._count.children > 0) throw conflict("Move or delete the subcategories first");
    if (before._count.products > 0)
      throw conflict(`Category has ${before._count.products} product(s). Reassign them or hide the category instead.`);
    await ctx.db.category.delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: "category.delete", entityType: "category", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Size scales & sizes ─────────────
  r.get("/size-scales", read, async (_req, res) => {
    const scales = await ctx.db.sizeScale.findMany({
      orderBy: { name: "asc" },
      include: { sizes: { orderBy: { sortOrder: "asc" } } },
    });
    res.json({ items: scales });
  });

  r.post("/size-scales", write, validated({ body: sizeScaleBody }, async (req, res, { body }) => {
    const labels = body.sizes ?? [];
    if (new Set(labels.map((l) => l.toUpperCase())).size !== labels.length) throw badRequest("Duplicate size labels");
    const scale = await ctx.db.sizeScale.create({
      data: { name: body.name, code: body.code, sizes: { create: labels.map((label, i) => ({ label, sortOrder: i })) } },
      include: { sizes: { orderBy: { sortOrder: "asc" } } },
    });
    await audit(ctx.db, req, { action: "sizeScale.create", entityType: "sizeScale", entityId: scale.id, after: scale });
    res.status(201).json(scale);
  }));

  r.post(
    "/size-scales/:id/sizes",
    write,
    validated({ params: idParam, body: z.object({ label: z.string().trim().min(1).max(20), sortOrder: z.number().int().optional() }) },
      async (req, res, { params, body }) => {
        const max = await ctx.db.size.aggregate({ where: { sizeScaleId: params.id }, _max: { sortOrder: true } });
        const size = await ctx.db.size.create({
          data: { sizeScaleId: params.id, label: body.label, sortOrder: body.sortOrder ?? (max._max.sortOrder ?? -1) + 1 },
        });
        await audit(ctx.db, req, { action: "size.create", entityType: "size", entityId: size.id, after: size });
        res.status(201).json(size);
      }),
  );

  r.delete("/sizes/:id", write, validated({ params: idParam }, async (req, res, { params }) => {
    const used = await ctx.db.productVariant.count({ where: { sizeId: params.id } });
    if (used > 0) throw conflict(`Size is used by ${used} variant(s)`);
    const before = await ctx.db.size.delete({ where: { id: params.id } });
    await audit(ctx.db, req, { action: "size.delete", entityType: "size", entityId: params.id, before });
    res.status(204).end();
  }));

  // ───────────── Colours ─────────────
  r.get("/colors", read, async (_req, res) => {
    res.json({ items: await ctx.db.color.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) });
  });

  r.post("/colors", write, validated({ body: colorBody }, async (req, res, { body }) => {
    const color = await ctx.db.color.create({ data: { ...body, hex: body.hex.toUpperCase(), slug: body.slug ?? slugify(body.name) } });
    await audit(ctx.db, req, { action: "color.create", entityType: "color", entityId: color.id, after: color });
    res.status(201).json(color);
  }));

  r.patch("/colors/:id", write, validated({ params: idParam, body: colorBody.partial() }, async (req, res, { params, body }) => {
    const before = await ctx.db.color.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Colour");
    const color = await ctx.db.color.update({ where: { id: params.id }, data: { ...body, hex: body.hex?.toUpperCase() } });
    await audit(ctx.db, req, { action: "color.update", entityType: "color", entityId: color.id, before, after: color });
    res.json(color);
  }));

  return r;
}
