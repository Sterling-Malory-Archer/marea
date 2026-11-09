import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { conflict, notFound } from "../../lib/errors.js";
import { idParam, patchSchema, validated } from "../../middleware/http.js";
import { requirePermission } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";
import { getSettings, settingsUpdateSchema, updateSettings } from "../settings/settings.js";

const money = z.number().int().min(0).max(100_000_00);
const nullableDate = z.coerce.date().nullish();

const couponBase = z.object({
    code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only").transform((c) => c.toUpperCase()),
    description: z.string().trim().max(255).nullish(),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
    value: z.number().int().min(0).max(100_000_00).default(0),
    minSubtotalMinor: money.nullish(),
    maxDiscountMinor: money.nullish(),
    appliesToSaleItems: z.boolean().default(false),
    usageLimit: z.number().int().min(1).nullish(),
    usageLimitPerCustomer: z.number().int().min(1).nullish(),
    startsAt: nullableDate,
    endsAt: nullableDate,
    isActive: z.boolean().default(true),
});
const couponRules = (c: Partial<z.infer<typeof couponBase>>, ctx: z.RefinementCtx) => {
    if (c.type === "PERCENTAGE" && c.value !== undefined && (c.value < 1 || c.value > 10000)) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage must be between 0.01% and 100%" });
    if (c.type === "FIXED_AMOUNT" && c.value !== undefined && c.value < 1) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the amount off" });
    if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
};
const couponBody = couponBase.superRefine(couponRules);

const zoneBody = z.object({
  name: z.string().trim().min(1).max(80),
  countryCodes: z.array(z.string().trim().length(2).transform((c) => c.toUpperCase())).min(1).max(60),
  isActive: z.boolean().default(true),
});
const methodBody = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).nullish(),
  priceMinor: money,
  freeOverMinor: money.nullish(),
  minDays: z.number().int().min(0).max(60).nullish(),
  maxDays: z.number().int().min(0).max(60).nullish(),
  allowsCashOnDelivery: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export function commerceRouter(ctx: AppContext) {
  const r = Router();

  // ───────────── Coupons ─────────────
  r.get("/coupons", requirePermission("dashboard:read"), async (_req, res) => {
    const items = await ctx.db.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { redemptions: true } } } });
    res.json({ items });
  });

  r.post("/coupons", requirePermission("coupons:write"), validated({ body: couponBody }, async (req, res, { body }) => {
    const c = await ctx.db.coupon.create({ data: body });
    await audit(ctx.db, req, { action: "coupon.create", entityType: "coupon", entityId: c.id, after: c });
    res.status(201).json(c);
  }));

  r.patch("/coupons/:id", requirePermission("coupons:write"), validated({ params: idParam, body: patchSchema(couponBase) }, async (req, res, { params, body }) => {
    const before = await ctx.db.coupon.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Discount code");
    // Re-validate the merged result so a partial edit can't produce an invalid code.
    couponBody.parse({ ...before, ...body });
    const c = await ctx.db.coupon.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "coupon.update", entityType: "coupon", entityId: c.id, before, after: c });
    res.json(c);
  }));

  r.delete("/coupons/:id", requirePermission("coupons:write"), validated({ params: idParam }, async (req, res, { params }) => {
    const c = await ctx.db.coupon.findUnique({ where: { id: params.id }, include: { _count: { select: { redemptions: true } } } });
    if (!c) throw notFound("Discount code");
    if (c._count.redemptions > 0) throw conflict("This code has been used on orders. Deactivate it instead so order history stays intact.");
    await ctx.db.coupon.delete({ where: { id: c.id } });
    await audit(ctx.db, req, { action: "coupon.delete", entityType: "coupon", entityId: c.id, before: c });
    res.status(204).end();
  }));

  // ───────────── Shipping ─────────────
  const ship = requirePermission("settings:write");
  r.get("/shipping", requirePermission("dashboard:read"), async (_req, res) => {
    res.json({ items: await ctx.db.shippingZone.findMany({ orderBy: { id: "asc" }, include: { methods: { orderBy: { sortOrder: "asc" } } } }) });
  });

  r.post("/shipping/zones", ship, validated({ body: zoneBody }, async (req, res, { body }) => {
    const z1 = await ctx.db.shippingZone.create({ data: body });
    await audit(ctx.db, req, { action: "shipping.zone.create", entityType: "shippingZone", entityId: z1.id, after: z1 });
    res.status(201).json(z1);
  }));

  r.patch("/shipping/zones/:id", ship, validated({ params: idParam, body: patchSchema(zoneBody) }, async (req, res, { params, body }) => {
    const before = await ctx.db.shippingZone.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Zone");
    const z1 = await ctx.db.shippingZone.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "shipping.zone.update", entityType: "shippingZone", entityId: z1.id, before, after: z1 });
    res.json(z1);
  }));

  r.post("/shipping/zones/:id/methods", ship, validated({ params: idParam, body: methodBody }, async (req, res, { params, body }) => {
    const m = await ctx.db.shippingMethod.create({ data: { ...body, zoneId: params.id } });
    await audit(ctx.db, req, { action: "shipping.method.create", entityType: "shippingMethod", entityId: m.id, after: m });
    res.status(201).json(m);
  }));

  r.patch("/shipping/methods/:id", ship, validated({ params: idParam, body: patchSchema(methodBody) }, async (req, res, { params, body }) => {
    const before = await ctx.db.shippingMethod.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Delivery method");
    const m = await ctx.db.shippingMethod.update({ where: { id: params.id }, data: body });
    await audit(ctx.db, req, { action: "shipping.method.update", entityType: "shippingMethod", entityId: m.id, before, after: m });
    res.json(m);
  }));

  // ───────────── Settings ─────────────
  r.get("/settings", requirePermission("dashboard:read"), async (_req, res) => {
    res.json({ values: await getSettings(ctx.db), payments: { cardProviderConnected: false } });
  });

  r.patch("/settings", requirePermission("settings:write"), validated({ body: settingsUpdateSchema }, async (req, res, { body }) => {
    const before = await getSettings(ctx.db);
    await updateSettings(ctx.db, body);
    const after = await getSettings(ctx.db);
    const changed = Object.keys(body);
    await audit(ctx.db, req, { action: "settings.update", entityType: "settings", before: Object.fromEntries(changed.map((k) => [k, before[k as keyof typeof before]])), after: body });
    res.json({ values: after });
  }));

  return r;
}
