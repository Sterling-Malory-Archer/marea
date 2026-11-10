import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { TRANSLATED_LOCALES } from "../../lib/i18n.js";
import { validated } from "../../middleware/http.js";
import { assertCan } from "../../middleware/auth.js";
import type { Permission } from "../auth/permissions.js";
import { audit } from "../audit/audit.js";

const opt = (max: number) => z.string().trim().max(max).nullish();
const req = (max: number) => z.string().trim().min(1).max(max);

/**
 * One endpoint for every translatable entity. Each entry names the Prisma
 * delegate, its foreign key, the permission needed, and the editable fields.
 */
const ENTITIES = {
  product: { delegate: "productTranslation", fk: "productId", parent: "product", permission: "catalog:write", schema: z.object({ title: req(200), subtitle: opt(200), description: opt(20000), composition: opt(2000), care: opt(2000), seoTitle: opt(160), seoDescription: opt(320) }) },
  category: { delegate: "categoryTranslation", fk: "categoryId", parent: "category", permission: "catalog:write", schema: z.object({ name: req(120), description: opt(5000), seoTitle: opt(160), seoDescription: opt(320) }) },
  collection: { delegate: "collectionTranslation", fk: "collectionId", parent: "collection", permission: "content:write", schema: z.object({ title: req(120), eyebrow: opt(80), description: opt(5000), seoTitle: opt(160), seoDescription: opt(320) }) },
  color: { delegate: "colorTranslation", fk: "colorId", parent: "color", permission: "catalog:write", schema: z.object({ name: req(60) }) },
  heroSlide: { delegate: "heroSlideTranslation", fk: "heroSlideId", parent: "heroSlide", permission: "content:write", schema: z.object({ eyebrow: opt(80), headline: req(120), body: opt(400), primaryCtaLabel: opt(40), secondaryCtaLabel: opt(40), imageAlt: opt(255) }) },
  announcement: { delegate: "announcementTranslation", fk: "announcementId", parent: "announcementMessage", permission: "content:write", schema: z.object({ message: req(200), linkLabel: opt(60) }) },
  page: { delegate: "pageTranslation", fk: "pageId", parent: "page", permission: "content:write", schema: z.object({ title: req(160), intro: opt(500), body: opt(50000), seoTitle: opt(160), seoDescription: opt(320) }) },
  contentBlock: { delegate: "contentBlockTranslation", fk: "contentBlockId", parent: "contentBlock", permission: "content:write", schema: z.object({ eyebrow: opt(80), title: req(160), body: opt(20000), ctaLabel: opt(40), imageAlt: opt(255) }) },
} as const satisfies Record<string, { delegate: string; fk: string; parent: string; permission: Permission; schema: z.ZodType }>;

type EntityKey = keyof typeof ENTITIES;
const params = z.object({
  entity: z.enum(Object.keys(ENTITIES) as [EntityKey, ...EntityKey[]]),
  id: z.coerce.number().int().positive(),
  locale: z.enum(TRANSLATED_LOCALES as [string, ...string[]]),
});

// Prisma delegates share findUnique/upsert/delete signatures; index them dynamically.
type AnyDelegate = {
  findMany: (a: unknown) => Promise<unknown[]>;
  upsert: (a: unknown) => Promise<unknown>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
};
type AnyParent = { findUnique: (a: unknown) => Promise<unknown> };

export function translationsAdminRouter(ctx: AppContext) {
  const r = Router();
  const db = ctx.db as unknown as Record<string, AnyDelegate & AnyParent>;


  r.get("/translations/:entity/:id", validated({ params: params.omit({ locale: true }) }, async (req, res, { params: p }) => {
    assertCan(req, ENTITIES[p.entity].permission);
    const def = ENTITIES[p.entity];
    if (!(await db[def.parent]!.findUnique({ where: { id: p.id } }))) throw notFound(p.entity);
    res.json({ items: await db[def.delegate]!.findMany({ where: { [def.fk]: p.id } }) });
  }));

  r.put("/translations/:entity/:id/:locale", validated({ params }, async (req, res, { params: p }) => {
    assertCan(req, ENTITIES[p.entity].permission);
    const def = ENTITIES[p.entity];
    const body = def.schema.parse(req.body ?? {});
    if (!(await db[def.parent]!.findUnique({ where: { id: p.id } }))) throw notFound(p.entity);
    const key = { [`${def.fk}_locale`]: { [def.fk]: p.id, locale: p.locale } };
    const saved = await db[def.delegate]!.upsert({ where: key, update: body, create: { ...body, [def.fk]: p.id, locale: p.locale } });
    await audit(ctx.db, req, { action: "translation.upsert", entityType: p.entity, entityId: `${p.id}:${p.locale}`, after: saved });
    res.json(saved);
  }));

  r.delete("/translations/:entity/:id/:locale", validated({ params }, async (req, res, { params: p }) => {
    assertCan(req, ENTITIES[p.entity].permission);
    const def = ENTITIES[p.entity];
    await db[def.delegate]!.deleteMany({ where: { [def.fk]: p.id, locale: p.locale } });
    await audit(ctx.db, req, { action: "translation.delete", entityType: p.entity, entityId: `${p.id}:${p.locale}` });
    res.status(204).end();
  }));

  return r;
}
