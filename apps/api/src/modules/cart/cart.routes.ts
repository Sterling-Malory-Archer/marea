import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { localeSchema } from "../../lib/i18n.js";
import { validated } from "../../middleware/http.js";
import { addItem, applyCoupon, findCart, getOrCreateCart, MAX_LINE_QTY, priceCart, setItemQuantity } from "./cart.service.js";

const q = z.object({ locale: localeSchema });

export function cartRouter(ctx: AppContext) {
  const r = Router();
  const userId = (req: Express.Request) => req.customer?.user.id ?? null;

  const empty = { id: null, currency: "EUR", itemCount: 0, lines: [], subtotalMinor: 0, discountMinor: 0, shipping: null, totalMinor: 0, vatMinor: 0, vatRateBps: 0, coupon: null, canCheckout: false };

  // Reading never creates a cart (and never sets a cookie) for visitors who haven't added anything.
  r.get("/", validated({ query: q }, async (req, res, { query }) => {
    const cart = await findCart(ctx, req);
    res.json(cart ? await priceCart(ctx, cart.id, query.locale, { userId: userId(req) }) : empty);
  }));

  r.post("/items", validated({ query: q, body: z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(MAX_LINE_QTY).default(1) }) }, async (req, res, { query, body }) => {
    const cart = await getOrCreateCart(ctx, req, res);
    await addItem(ctx, cart.id, body.variantId, body.quantity);
    res.status(201).json(await priceCart(ctx, cart.id, query.locale, { userId: userId(req) }));
  }));

  r.patch("/items/:itemId", validated({ query: q, params: z.object({ itemId: z.coerce.number().int().positive() }), body: z.object({ quantity: z.number().int().min(0).max(MAX_LINE_QTY) }) }, async (req, res, { query, params, body }) => {
    const cart = await getOrCreateCart(ctx, req, res);
    await setItemQuantity(ctx, cart.id, params.itemId, body.quantity);
    res.json(await priceCart(ctx, cart.id, query.locale, { userId: userId(req) }));
  }));

  r.delete("/items/:itemId", validated({ query: q, params: z.object({ itemId: z.coerce.number().int().positive() }) }, async (req, res, { query, params }) => {
    const cart = await getOrCreateCart(ctx, req, res);
    await setItemQuantity(ctx, cart.id, params.itemId, 0);
    res.json(await priceCart(ctx, cart.id, query.locale, { userId: userId(req) }));
  }));

  r.post("/coupon", validated({ query: q, body: z.object({ code: z.string().trim().min(1).max(40) }) }, async (req, res, { query, body }) => {
    const cart = await getOrCreateCart(ctx, req, res);
    res.json(await applyCoupon(ctx, cart.id, body.code, query.locale, userId(req)));
  }));

  r.delete("/coupon", validated({ query: q }, async (req, res, { query }) => {
    const cart = await getOrCreateCart(ctx, req, res);
    await ctx.db.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    res.json(await priceCart(ctx, cart.id, query.locale, { userId: userId(req) }));
  }));

  return r;
}
