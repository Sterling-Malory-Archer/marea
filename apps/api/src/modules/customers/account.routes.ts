import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { notFound, unprocessable } from "../../lib/errors.js";
import { localeSchema, type Locale } from "../../lib/i18n.js";
import { idParam, validated } from "../../middleware/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { hashPassword, passwordPolicyIssues, verifyPassword } from "../auth/password.js";
import { destroySession } from "../auth/sessions.js";
import { productCardInclude, toProductCard } from "../catalog/product-card.js";
import { renderEmail } from "../mail/templates.js";
import { customerView } from "./auth.routes.js";

const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

const addressBody = z.object({
  label: optText(60),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  company: optText(150),
  line1: z.string().trim().min(3).max(200),
  line2: optText(200),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9 -]+$/),
  region: optText(100),
  countryCode: z.string().trim().length(2).transform((c) => c.toUpperCase()),
  phone: z.string().trim().min(6).max(40).regex(/^[+0-9 ()/-]+$/, "Use digits, spaces and + only").nullish().transform((v) => v || null),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
});

const productIdParam = z.object({ productId: z.coerce.number().int().positive() });

export function accountRouter(ctx: AppContext) {
  const r = Router();
  r.use(requireCustomer);
  const uid = (req: Express.Request) => req.customer!.user.id;

  // ───────────── Profile ─────────────
  r.patch(
    "/profile",
    validated(
      {
        body: z.object({
          firstName: z.string().trim().min(1).max(100).optional(),
          lastName: z.string().trim().min(1).max(100).optional(),
          phone: z.string().trim().max(40).regex(/^[+0-9 ()/-]*$/).nullish().transform((v) => v || null),
          marketingOptIn: z.boolean().optional(),
          locale: localeSchema.optional(),
        }),
      },
      async (req, res, { body }) => {
        const u = await ctx.db.user.update({ where: { id: uid(req) }, data: body });
        res.json({ user: customerView(u) });
      },
    ),
  );

  r.post(
    "/password",
    validated({ body: z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().max(128) }) }, async (req, res, { body }) => {
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: uid(req) } });
      if (!(await verifyPassword(user.passwordHash, body.currentPassword)))
        throw unprocessable("Your current password is incorrect", { field: "currentPassword" });
      const issues = passwordPolicyIssues(body.newPassword);
      if (issues.length) throw new z.ZodError(issues.map((message) => ({ code: "custom" as const, path: ["newPassword"], message, input: undefined })));
      await ctx.db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
      // Sign out every other device; keep this one.
      await ctx.db.session.deleteMany({ where: { userId: user.id, id: { not: req.customer!.sessionId } } });
      await ctx.mailer.send({ to: user.email, ...renderEmail("changed", user.locale as Locale) }).catch(() => undefined);
      res.json({ ok: true });
    }),
  );

  /** GDPR-style deletion request: account is disabled now and anonymised by staff within 30 days. */
  r.post("/delete-request", validated({ body: z.object({ password: z.string().min(1).max(256) }) }, async (req, res, { body }) => {
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: uid(req) } });
    if (!(await verifyPassword(user.passwordHash, body.password)))
      throw unprocessable("Your password is incorrect", { field: "password" });
    await ctx.db.user.update({ where: { id: user.id }, data: { status: "DELETION_REQUESTED", deletionRequestedAt: new Date(), marketingOptIn: false } });
    await ctx.db.newsletterSubscriber.updateMany({ where: { email: user.email }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
    await destroySession(ctx, req, res, { admin: false });
    await ctx.db.session.deleteMany({ where: { userId: user.id } });
    await ctx.mailer.send({ to: user.email, ...renderEmail("deletion", user.locale as Locale) }).catch(() => undefined);
    res.json({ ok: true });
  }));

  // ───────────── Addresses ─────────────
  r.get("/addresses", async (req, res) => {
    res.json({ items: await ctx.db.address.findMany({ where: { userId: uid(req) }, orderBy: [{ isDefaultShipping: "desc" }, { updatedAt: "desc" }] }) });
  });

  async function saveAddress(userId: number, data: z.infer<typeof addressBody>, id?: number) {
    return ctx.db.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (!id && count >= 20) throw unprocessable("You can save up to 20 addresses");
      // The first address becomes the default automatically; only one default of each kind.
      const first = count === 0 && !id;
      if (data.isDefaultShipping) await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
      if (data.isDefaultBilling) await tx.address.updateMany({ where: { userId }, data: { isDefaultBilling: false } });
      const fields = { ...data, isDefaultShipping: data.isDefaultShipping ?? (first || undefined), isDefaultBilling: data.isDefaultBilling ?? (first || undefined) };
      if (id) {
        const owned = await tx.address.findFirst({ where: { id, userId } });
        if (!owned) throw notFound("Address");
        return tx.address.update({ where: { id }, data: fields });
      }
      return tx.address.create({ data: { ...fields, userId } as never });
    });
  }

  r.post("/addresses", validated({ body: addressBody }, async (req, res, { body }) => {
    res.status(201).json(await saveAddress(uid(req), body));
  }));

  r.patch("/addresses/:id", validated({ params: idParam, body: addressBody.partial() }, async (req, res, { params, body }) => {
    const current = await ctx.db.address.findFirst({ where: { id: params.id, userId: uid(req) } });
    if (!current) throw notFound("Address");
    const { id: _i, userId: _u, createdAt: _c, updatedAt: _up, ...rest } = current;
    res.json(await saveAddress(uid(req), { ...rest, ...body } as z.infer<typeof addressBody>, params.id));
  }));

  r.delete("/addresses/:id", validated({ params: idParam }, async (req, res, { params }) => {
    const deleted = await ctx.db.address.deleteMany({ where: { id: params.id, userId: uid(req) } });
    if (deleted.count === 0) throw notFound("Address");
    res.status(204).end();
  }));

  // ───────────── Orders (read-only; created at checkout in Phase 6) ─────────────
  r.get("/orders", async (req, res) => {
    const orders = await ctx.db.order.findMany({
      where: { userId: uid(req) },
      orderBy: { placedAt: "desc" },
      take: 100,
      select: { orderNumber: true, placedAt: true, status: true, paymentStatus: true, fulfillmentStatus: true, totalMinor: true, currency: true, _count: { select: { items: true } }, items: { take: 3, select: { imageKey: true, productTitle: true } } },
    });
    res.json({ items: orders.map(({ _count, ...o }) => ({ ...o, itemCount: _count.items })) });
  });

  r.get("/orders/:orderNumber", validated({ params: z.object({ orderNumber: z.string().max(32) }) }, async (req, res, { params }) => {
    // Scoped by user id: a customer can never read someone else's order, even with its number.
    const order = await ctx.db.order.findFirst({
      where: { orderNumber: params.orderNumber, userId: uid(req) },
      include: {
        items: true,
        shipments: { select: { carrier: true, trackingNumber: true, trackingUrl: true, status: true, shippedAt: true, deliveredAt: true } },
        events: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, select: { toStatus: true, message: true, createdAt: true } },
      },
    });
    if (!order) throw notFound("Order");
    const { idempotencyKey: _k, userId: _u, ...safe } = order;
    res.json({ ...safe, items: order.items.map((i) => ({ ...i, imageUrl: i.imageKey && !i.imageKey.startsWith("placeholder/") ? ctx.storage.publicUrl(i.imageKey) : null })) });
  }));

  // ───────────── Wishlist ─────────────
  const wishlistId = async (userId: number) => (await ctx.db.wishlist.upsert({ where: { userId }, update: {}, create: { userId } })).id;

  r.get("/wishlist", validated({ query: z.object({ locale: localeSchema }) }, async (req, res, { query }) => {
    const items = await ctx.db.wishlistItem.findMany({
      where: { wishlist: { userId: uid(req) } },
      orderBy: { createdAt: "desc" },
      include: { product: { include: productCardInclude(query.locale) } },
    });
    res.json({
      productIds: items.map((i) => i.productId),
      items: items.filter((i) => i.product.status === "ACTIVE").map((i) => toProductCard(i.product, ctx.storage)),
    });
  }));

  r.put("/wishlist/:productId", validated({ params: productIdParam }, async (req, res, { params }) => {
    const product = await ctx.db.product.findFirst({ where: { id: params.productId, status: "ACTIVE" }, select: { id: true } });
    if (!product) throw notFound("Product");
    const wid = await wishlistId(uid(req));
    await ctx.db.wishlistItem.upsert({ where: { wishlistId_productId: { wishlistId: wid, productId: product.id } }, update: {}, create: { wishlistId: wid, productId: product.id } });
    res.status(204).end();
  }));

  r.delete("/wishlist/:productId", validated({ params: productIdParam }, async (req, res, { params }) => {
    await ctx.db.wishlistItem.deleteMany({ where: { productId: params.productId, wishlist: { userId: uid(req) } } });
    res.status(204).end();
  }));

  /** Merge a guest's browser wishlist into the account after sign-in. */
  r.post("/wishlist/merge", validated({ body: z.object({ productIds: z.array(z.number().int().positive()).max(200) }) }, async (req, res, { body }) => {
    const wid = await wishlistId(uid(req));
    const valid = await ctx.db.product.findMany({ where: { id: { in: body.productIds }, status: "ACTIVE" }, select: { id: true } });
    if (valid.length) await ctx.db.wishlistItem.createMany({ data: valid.map((p) => ({ wishlistId: wid, productId: p.id })), skipDuplicates: true });
    const all = await ctx.db.wishlistItem.findMany({ where: { wishlistId: wid }, select: { productId: true } });
    res.json({ productIds: all.map((a) => a.productId) });
  }));

  return r;
}
