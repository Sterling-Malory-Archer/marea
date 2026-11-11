import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { localeSchema } from "../../lib/i18n.js";
import { sha256 } from "../../lib/util.js";
import { validated } from "../../middleware/http.js";
import { checkoutQuote, placeOrder } from "./checkout.service.js";
import { limitFor } from "../../lib/rate-limit.js";

const country = z.string().trim().length(2).transform((c) => c.toUpperCase());
const txt = (min: number, max: number) => z.string().trim().min(min).max(max);
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const phone = z.string().trim().min(6).max(40).regex(/^[+0-9 ()/-]+$/, "Use digits, spaces and + only");

const address = z.object({
  firstName: txt(1, 100),
  lastName: txt(1, 100),
  company: opt(150),
  line1: txt(3, 200),
  line2: opt(200),
  city: txt(1, 100),
  postalCode: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9 -]+$/),
  countryCode: country,
  phone: phone.nullish(),
});

const placeBody = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
  email: z.email().max(254).transform((e) => e.toLowerCase().trim()),
  phone,
  shippingAddress: address,
  billingAddress: address.nullish(),
  shippingMethodCode: z.string().max(40),
  paymentMethod: z.enum(["CASH_ON_DELIVERY", "CARD"]),
  customerNote: opt(1000),
  saveAddress: z.boolean().optional(),
  acceptTerms: z.literal(true, "Please accept the terms of sale"),
  expectedTotalMinor: z.number().int().min(0),
  locale: localeSchema,
});

export function checkoutRouter(ctx: AppContext) {
  const r = Router();
  const placeLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: limitFor(ctx.env, 20),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." } },
  });

  r.get(
    "/quote",
    validated(
      { query: z.object({ country: country.default("ME"), method: z.string().max(40).optional(), email: z.email().max(254).optional().catch(undefined), locale: localeSchema }) },
      async (req, res, { query }) => {
        res.json(await checkoutQuote(ctx, req, { country: query.country, methodCode: query.method, email: query.email?.toLowerCase(), locale: query.locale }));
      },
    ),
  );

  r.post("/orders", placeLimiter, validated({ body: placeBody }, async (req, res, { body }) => {
    const { order, accessToken, replay } = await placeOrder(ctx, req, res, body);
    res.status(replay ? 200 : 201).json({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      // Only returned once, on creation; the confirmation link carries it for guests.
      accessToken,
      next: order.status === "PENDING_PAYMENT" ? "payment" : "confirmation",
    });
  }));

  /** Confirmation page data: the owner (signed in) or anyone holding the order's access token. */
  r.get(
    "/orders/:orderNumber",
    validated({ params: z.object({ orderNumber: z.string().max(32) }), query: z.object({ token: z.string().max(100).optional() }) }, async (req, res, { params, query }) => {
      const order = await ctx.db.order.findUnique({ where: { orderNumber: params.orderNumber }, include: { items: true, shippingMethod: { select: { code: true } } } });
      const owner = order && req.customer && order.userId === req.customer.user.id;
      const tokenOk = order && query.token && order.accessTokenHash === sha256(query.token);
      if (!order || !(owner || tokenOk)) throw notFound("Order");
      res.set("Cache-Control", "no-store");
      res.json({
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        email: order.email,
        placedAt: order.placedAt,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        couponCode: order.couponCode,
        shippingMethodName: order.shippingMethodName,
        shippingMethodCode: order.shippingMethod?.code ?? null,
        shippingAddress: order.shippingAddress,
        hasAccount: !!order.userId,
        items: order.items.map((i) => ({ id: i.id, productTitle: i.productTitle, brandName: i.brandName, colorName: i.colorName, sizeLabel: i.sizeLabel, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor, lineTotalMinor: i.lineTotalMinor })),
      });
    }),
  );

  return r;
}
