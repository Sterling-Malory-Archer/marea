import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma, UserRole } from "@marea/db";
import type { AppContext } from "../../context.js";
import { conflict, forbidden, notFound, unprocessable } from "../../lib/errors.js";
import { pageParams } from "../../lib/util.js";
import { idParam, validated } from "../../middleware/http.js";
import { requirePermission } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";
import { hashPassword } from "../auth/password.js";
import { permissionsFor } from "../auth/permissions.js";
import { storefrontUrl } from "../customers/auth.routes.js";
import { issueToken } from "../customers/email-tokens.js";

const STAFF_ROLES = ["CONTENT_EDITOR", "CATALOG_MANAGER", "ORDER_MANAGER", "ADMIN", "OWNER"] as const;
const page = { page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25) };

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function peopleRouter(ctx: AppContext) {
  const r = Router();

  // ───────────── Customers ─────────────
  r.get("/customers", requirePermission("customers:read"), validated({ query: z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["ACTIVE", "DISABLED", "DELETION_REQUESTED"]).optional(), ...page }) }, async (_req, res, { query }) => {
    const where: Prisma.UserWhereInput = {
      role: "CUSTOMER",
      status: query.status,
      ...(query.q ? { OR: [{ email: { contains: query.q } }, { firstName: { contains: query.q } }, { lastName: { contains: query.q } }, { phone: { contains: query.q } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      ctx.db.user.count({ where }),
      ctx.db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageParams(query.page, query.pageSize),
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, emailVerifiedAt: true, marketingOptIn: true, createdAt: true, lastLoginAt: true, deletionRequestedAt: true, _count: { select: { orders: true } } },
      }),
    ]);
    res.json({ items: rows.map(({ _count, ...u }) => ({ ...u, orderCount: _count.orders })), total, page: query.page, pageSize: query.pageSize });
  }));

  r.get("/customers/:id", requirePermission("customers:read"), validated({ params: idParam }, async (_req, res, { params }) => {
    const u = await ctx.db.user.findFirst({
      where: { id: params.id, role: "CUSTOMER" },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true, status: true, locale: true, emailVerifiedAt: true, marketingOptIn: true, createdAt: true, lastLoginAt: true, deletionRequestedAt: true,
        addresses: true,
        orders: { orderBy: { placedAt: "desc" }, take: 50, select: { orderNumber: true, placedAt: true, status: true, totalMinor: true, currency: true } },
      },
    });
    if (!u) throw notFound("Customer");
    const spent = await ctx.db.order.aggregate({ where: { userId: u.id, status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } }, _sum: { totalMinor: true } });
    res.json({ ...u, lifetimeValueMinor: spent._sum.totalMinor ?? 0 });
  }));

  r.patch("/customers/:id", requirePermission("customers:write"), validated({ params: idParam, body: z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }) }, async (req, res, { params, body }) => {
    const before = await ctx.db.user.findFirst({ where: { id: params.id, role: "CUSTOMER" } });
    if (!before) throw notFound("Customer");
    const u = await ctx.db.user.update({ where: { id: params.id }, data: { status: body.status } });
    if (body.status === "DISABLED") await ctx.db.session.deleteMany({ where: { userId: u.id } });
    await audit(ctx.db, req, { action: "customer.status", entityType: "customer", entityId: u.id, before: { status: before.status }, after: { status: u.status } });
    res.json({ id: u.id, status: u.status });
  }));

  /**
   * Erase personal data for a deletion request. Orders stay (legal retention)
   * with their snapshots; the account itself can no longer identify anyone.
   */
  r.post("/customers/:id/anonymise", requirePermission("customers:write"), validated({ params: idParam, body: z.object({ confirm: z.literal(true) }) }, async (req, res, { params }) => {
    const u = await ctx.db.user.findFirst({ where: { id: params.id, role: "CUSTOMER" } });
    if (!u) throw notFound("Customer");
    if (u.status !== "DELETION_REQUESTED") throw conflict("Only accounts with a deletion request can be anonymised");
    await ctx.db.$transaction(async (tx) => {
      await tx.address.deleteMany({ where: { userId: u.id } });
      await tx.wishlist.deleteMany({ where: { userId: u.id } });
      await tx.cart.deleteMany({ where: { userId: u.id } });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await tx.emailToken.deleteMany({ where: { userId: u.id } });
      await tx.productReview.updateMany({ where: { userId: u.id }, data: { userId: null } });
      await tx.newsletterSubscriber.deleteMany({ where: { email: u.email } });
      await tx.user.update({
        where: { id: u.id },
        data: { email: `deleted-${u.id}-${crypto.randomUUID().slice(0, 8)}@invalid.local`, firstName: null, lastName: null, phone: null, passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")), status: "DISABLED", marketingOptIn: false },
      });
    });
    await audit(ctx.db, req, { action: "customer.anonymise", entityType: "customer", entityId: u.id });
    res.json({ ok: true });
  }));

  // ───────────── Newsletter ─────────────
  r.get("/newsletter", requirePermission("customers:read"), validated({ query: z.object({ q: z.string().trim().max(100).optional(), status: z.enum(["PENDING", "SUBSCRIBED", "UNSUBSCRIBED"]).optional(), ...page }) }, async (_req, res, { query }) => {
    const where: Prisma.NewsletterSubscriberWhereInput = { status: query.status, ...(query.q ? { email: { contains: query.q } } : {}) };
    const [total, items, subscribed] = await Promise.all([
      ctx.db.newsletterSubscriber.count({ where }),
      ctx.db.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, ...pageParams(query.page, query.pageSize), select: { id: true, email: true, status: true, source: true, consentAt: true, createdAt: true, unsubscribedAt: true } }),
      ctx.db.newsletterSubscriber.count({ where: { status: "SUBSCRIBED" } }),
    ]);
    res.json({ items, total, subscribed, page: query.page, pageSize: query.pageSize });
  }));

  r.get("/newsletter/export.csv", requirePermission("customers:read"), async (req, res, next) => {
    try {
      const rows = await ctx.db.newsletterSubscriber.findMany({ where: { status: "SUBSCRIBED" }, orderBy: { createdAt: "asc" } });
      await audit(ctx.db, req, { action: "newsletter.export", entityType: "newsletter", after: { rows: rows.length } });
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="newsletter-${new Date().toISOString().slice(0, 10)}.csv"` });
      res.send("﻿" + [["email", "subscribed_at", "source", "consent_text"], ...rows.map((s) => [s.email, s.consentAt?.toISOString(), s.source, s.consentText])].map((r) => r.map(csvCell).join(",")).join("\r\n"));
    } catch (err) {
      next(err);
    }
  });

  r.post("/newsletter/:id/unsubscribe", requirePermission("customers:write"), validated({ params: idParam }, async (req, res, { params }) => {
    const s = await ctx.db.newsletterSubscriber.update({ where: { id: params.id }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
    await audit(ctx.db, req, { action: "newsletter.unsubscribe", entityType: "newsletter", entityId: s.id });
    res.json({ id: s.id, status: s.status });
  }));

  // ───────────── Staff (admins:manage) ─────────────
  const manage = requirePermission("admins:manage");
  const ownerCount = () => ctx.db.user.count({ where: { role: "OWNER", status: "ACTIVE" } });

  r.get("/staff", manage, async (_req, res) => {
    const staff = await ctx.db.user.findMany({
      where: { role: { not: "CUSTOMER" } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, lastLoginAt: true, createdAt: true },
    });
    res.json({ items: staff.map((s) => ({ ...s, permissions: permissionsFor(s.role) })), roles: STAFF_ROLES.map((role) => ({ role, permissions: permissionsFor(role) })) });
  });

  r.post(
    "/staff",
    manage,
    validated({ body: z.object({ email: z.email().max(254).transform((e) => e.toLowerCase().trim()), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), role: z.enum(STAFF_ROLES) }) }, async (req, res, { body }) => {
      if (body.role === "OWNER" && req.admin!.user.role !== "OWNER") throw forbidden("Only an owner can create another owner");
      if (await ctx.db.user.findUnique({ where: { email: body.email } })) throw conflict("A user with this e-mail already exists");
      // No password is ever chosen by the inviter: the new member sets one through an e-mailed link.
      const user = await ctx.db.user.create({ data: { ...body, passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")), emailVerifiedAt: null } });
      const token = await issueToken(ctx, user.id, "RESET_PASSWORD");
      const link = storefrontUrl(ctx, "en", `/account/reset-password?token=${token}`);
      await ctx.mailer.send({
        to: user.email,
        subject: "You've been invited to the MAREA admin",
        text: `Hello ${user.firstName},\n\nYou've been given ${body.role.replace("_", " ").toLowerCase()} access to the MAREA admin.\nChoose your password within 1 hour: ${link}\nThen sign in at ${ctx.env.PUBLIC_WEB_URL.replace(/\/$/, "")}/admin\n`,
        html: `<p>Hello ${user.firstName},</p><p>You've been given <strong>${body.role.replace("_", " ").toLowerCase()}</strong> access to the MAREA admin.</p><p><a href="${link}">Choose your password</a> (valid for 1 hour), then sign in at ${ctx.env.PUBLIC_WEB_URL.replace(/\/$/, "")}/admin.</p>`,
      });
      await audit(ctx.db, req, { action: "staff.invite", entityType: "user", entityId: user.id, after: { email: user.email, role: user.role } });
      res.status(201).json({ id: user.id, email: user.email, role: user.role, status: user.status });
    }),
  );

  r.patch("/staff/:id", manage, validated({ params: idParam, body: z.object({ role: z.enum(STAFF_ROLES).optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional() }) }, async (req, res, { params, body }) => {
    const target = await ctx.db.user.findFirst({ where: { id: params.id, role: { not: "CUSTOMER" } } });
    if (!target) throw notFound("Staff member");
    const me = req.admin!.user;
    if (target.id === me.id) throw unprocessable("You can't change your own role or status");
    if ((target.role === "OWNER" || body.role === "OWNER") && me.role !== "OWNER") throw forbidden("Only an owner can change owner access");
    const losingOwner = target.role === "OWNER" && ((body.role && body.role !== "OWNER") || body.status === "DISABLED");
    if (losingOwner && (await ownerCount()) <= 1) throw conflict("The store must keep at least one active owner");
    const updated = await ctx.db.user.update({ where: { id: target.id }, data: { role: body.role as UserRole | undefined, status: body.status } });
    if (body.status === "DISABLED" || body.role) await ctx.db.session.deleteMany({ where: { userId: target.id } });
    await audit(ctx.db, req, { action: "staff.update", entityType: "user", entityId: target.id, before: { role: target.role, status: target.status }, after: { role: updated.role, status: updated.status } });
    res.json({ id: updated.id, role: updated.role, status: updated.status });
  }));

  // ───────────── Audit log ─────────────
  r.get("/audit", requirePermission("audit:read"), validated({ query: z.object({ entityType: z.string().max(60).optional(), action: z.string().max(80).optional(), actorUserId: z.coerce.number().int().optional(), ...page }) }, async (_req, res, { query }) => {
    const where: Prisma.AdminAuditLogWhereInput = { entityType: query.entityType, actorUserId: query.actorUserId, ...(query.action ? { action: { startsWith: query.action } } : {}) };
    const [total, items] = await Promise.all([
      ctx.db.adminAuditLog.count({ where }),
      ctx.db.adminAuditLog.findMany({ where, orderBy: { id: "desc" }, ...pageParams(query.page, query.pageSize), include: { actor: { select: { id: true, email: true } } } }),
    ]);
    res.json({ items, total, page: query.page, pageSize: query.pageSize });
  }));

  return r;
}
