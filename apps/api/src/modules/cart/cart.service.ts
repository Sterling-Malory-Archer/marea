import type { Request, Response } from "express";
import type { Coupon, Db, Prisma, Tx } from "@marea/db";
import type { AppContext } from "../../context.js";
import { conflict, notFound, unprocessable } from "../../lib/errors.js";
import { localize, tr, type Locale } from "../../lib/i18n.js";
import { randomToken, sha256 } from "../../lib/util.js";
import { getSettings } from "../settings/settings.js";

export const GUEST_CART_COOKIE = "marea_cart";
export const MAX_LINE_QTY = 10;
const GUEST_TTL_DAYS = 30;

/*
 * Carts hold only variant ids and quantities. Every read re-prices from the
 * catalogue and re-checks stock, so the browser can never set a price, and a
 * stale cart can never be checked out with sold-out items.
 */

// ───────────── Resolution ─────────────

function guestToken(req: Request): string | null {
  const v: unknown = req.signedCookies?.[GUEST_CART_COOKIE];
  return typeof v === "string" && v.length >= 20 && v.length <= 100 ? v : null;
}

function setGuestCookie(ctx: AppContext, res: Response, token: string) {
  res.cookie(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    signed: true,
    secure: ctx.env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_TTL_DAYS * 864e5,
  });
}

/** The visitor's active cart: the customer's if signed in, otherwise the guest cookie's. */
export async function findCart(ctx: AppContext, req: Request) {
  if (req.customer) return ctx.db.cart.findFirst({ where: { userId: req.customer.user.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
  const token = guestToken(req);
  if (!token) return null;
  const cart = await ctx.db.cart.findUnique({ where: { guestTokenHash: sha256(token) } });
  return cart && cart.status === "ACTIVE" && (!cart.expiresAt || cart.expiresAt > new Date()) ? cart : null;
}

export async function getOrCreateCart(ctx: AppContext, req: Request, res: Response) {
  const existing = await findCart(ctx, req);
  if (existing) return existing;
  if (req.customer) return ctx.db.cart.create({ data: { userId: req.customer.user.id } });
  const token = randomToken(32);
  const cart = await ctx.db.cart.create({ data: { guestTokenHash: sha256(token), expiresAt: new Date(Date.now() + GUEST_TTL_DAYS * 864e5) } });
  setGuestCookie(ctx, res, token);
  return cart;
}

/** After sign-in: fold the guest cart into the customer's cart (quantities capped by stock). */
export async function mergeGuestCartInto(ctx: AppContext, req: Request, res: Response, userId: number) {
  const token = guestToken(req);
  if (!token) return;
  res.clearCookie(GUEST_CART_COOKIE, { path: "/" });
  const guest = await ctx.db.cart.findUnique({ where: { guestTokenHash: sha256(token) }, include: { items: true } });
  if (!guest || guest.status !== "ACTIVE" || guest.items.length === 0) return;
  await ctx.db.$transaction(async (tx) => {
    let target = await tx.cart.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" } });
    target ??= await tx.cart.create({ data: { userId, couponId: guest.couponId } });
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } } });
      const limit = await maxQuantity(tx, item.variantId);
      const qty = Math.min((existing?.quantity ?? 0) + item.quantity, limit);
      if (qty <= 0) continue;
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        update: { quantity: qty },
        create: { cartId: target.id, variantId: item.variantId, quantity: qty },
      });
    }
    if (!target.couponId && guest.couponId) await tx.cart.update({ where: { id: target.id }, data: { couponId: guest.couponId } });
    await tx.cart.update({ where: { id: guest.id }, data: { status: "MERGED" } });
  });
}

// ───────────── Stock helpers ─────────────

async function maxQuantity(db: Db | Tx, variantId: number): Promise<number> {
  const inv = await db.inventory.findUnique({ where: { variantId } });
  if (!inv) return 0;
  return inv.allowBackorder ? MAX_LINE_QTY : Math.max(0, Math.min(MAX_LINE_QTY, inv.quantityOnHand - inv.quantityReserved));
}

async function purchasableVariant(db: Db | Tx, variantId: number) {
  const v = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true, publishedAt: true } } } });
  if (!v || !v.isActive || v.product.status !== "ACTIVE" || !v.product.publishedAt || v.product.publishedAt > new Date()) throw notFound("Product variant");
  return v;
}

// ───────────── Mutations ─────────────

export async function addItem(ctx: AppContext, cartId: number, variantId: number, quantity: number) {
  await purchasableVariant(ctx.db, variantId);
  const limit = await maxQuantity(ctx.db, variantId);
  const existing = await ctx.db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const next = (existing?.quantity ?? 0) + quantity;
  if (limit === 0) throw conflict("This size is sold out", { code: "OUT_OF_STOCK", available: 0 });
  if (next > limit)
    throw conflict(limit >= MAX_LINE_QTY ? `You can add up to ${MAX_LINE_QTY} of each item` : `Only ${limit} available`, { code: "INSUFFICIENT_STOCK", available: limit, inCart: existing?.quantity ?? 0 });
  await ctx.db.cartItem.upsert({ where: { cartId_variantId: { cartId, variantId } }, update: { quantity: next }, create: { cartId, variantId, quantity } });
  await ctx.db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

export async function setItemQuantity(ctx: AppContext, cartId: number, itemId: number, quantity: number) {
  const item = await ctx.db.cartItem.findFirst({ where: { id: itemId, cartId } });
  if (!item) throw notFound("Bag item");
  if (quantity === 0) {
    await ctx.db.cartItem.delete({ where: { id: item.id } });
    return;
  }
  const limit = await maxQuantity(ctx.db, item.variantId);
  if (quantity > limit) throw conflict(limit === 0 ? "This size is sold out" : `Only ${limit} available`, { code: limit === 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK", available: limit });
  await ctx.db.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

// ───────────── Coupons ─────────────

export type CouponError = "COUPON_INVALID" | "COUPON_NOT_STARTED" | "COUPON_EXPIRED" | "COUPON_USAGE_LIMIT" | "COUPON_ALREADY_USED" | "COUPON_MIN_SUBTOTAL" | "COUPON_NOT_ELIGIBLE";

export interface CouponResult {
  ok: boolean;
  error?: CouponError;
  minSubtotalMinor?: number;
  discountMinor: number;
  freeShipping: boolean;
}

/** Pure eligibility + amount calculation, shared by cart and checkout. */
export async function evaluateCoupon(
  db: Db | Tx,
  coupon: Coupon | null,
  input: { subtotalMinor: number; eligibleSubtotalMinor: number; userId?: number | null; email?: string | null },
  now = new Date(),
): Promise<CouponResult> {
  const fail = (error: CouponError, extra: Partial<CouponResult> = {}): CouponResult => ({ ok: false, error, discountMinor: 0, freeShipping: false, ...extra });
  if (!coupon || !coupon.isActive) return fail("COUPON_INVALID");
  if (coupon.startsAt && coupon.startsAt > now) return fail("COUPON_NOT_STARTED");
  if (coupon.endsAt && coupon.endsAt <= now) return fail("COUPON_EXPIRED");
  if (coupon.usageLimit != null && coupon.timesRedeemed >= coupon.usageLimit) return fail("COUPON_USAGE_LIMIT");
  if (coupon.usageLimitPerCustomer != null && (input.userId || input.email)) {
    const used = await db.couponRedemption.count({
      where: { couponId: coupon.id, OR: [...(input.userId ? [{ userId: input.userId }] : []), ...(input.email ? [{ email: input.email }] : [])] },
    });
    if (used >= coupon.usageLimitPerCustomer) return fail("COUPON_ALREADY_USED");
  }
  if (coupon.minSubtotalMinor != null && input.subtotalMinor < coupon.minSubtotalMinor) return fail("COUPON_MIN_SUBTOTAL", { minSubtotalMinor: coupon.minSubtotalMinor });
  if (coupon.type === "FREE_SHIPPING") return { ok: true, discountMinor: 0, freeShipping: true };
  if (input.eligibleSubtotalMinor <= 0) return fail("COUPON_NOT_ELIGIBLE");
  let discount = coupon.type === "PERCENTAGE" ? Math.floor((input.eligibleSubtotalMinor * coupon.value) / 10000) : Math.min(coupon.value, input.eligibleSubtotalMinor);
  if (coupon.maxDiscountMinor != null) discount = Math.min(discount, coupon.maxDiscountMinor);
  return { ok: true, discountMinor: Math.max(0, discount), freeShipping: false };
}

// ───────────── Pricing ─────────────

const lineInclude = (locale: Locale) =>
  ({
    variant: {
      include: {
        inventory: true,
        size: { select: { label: true } },
        color: { select: { id: true, name: true, slug: true, hex: true, translations: tr(locale) } },
        product: {
          include: {
            brand: { select: { name: true } },
            translations: tr(locale),
            images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { storageKey: true, isPlaceholder: true, colorId: true, altText: true } },
          },
        },
      },
    },
  }) satisfies Prisma.CartItemInclude;

export type LineIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK";

export async function priceCart(ctx: AppContext, cartId: number, locale: Locale, opts: { userId?: number | null } = {}) {
  const cart = await ctx.db.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: { coupon: true, items: { orderBy: { createdAt: "asc" }, include: lineInclude(locale) } },
  });
  const settings = await getSettings(ctx.db);
  const now = new Date();

  const lines = cart.items.map((item) => {
    const v = item.variant;
    const p = localize(v.product, ["title"] as const);
    const color = localize(v.color, ["name"] as const);
    const live = v.isActive && v.product.status === "ACTIVE" && !!v.product.publishedAt && v.product.publishedAt <= now;
    const inv = v.inventory;
    const available = !inv ? 0 : inv.allowBackorder ? MAX_LINE_QTY : Math.max(0, inv.quantityOnHand - inv.quantityReserved);
    const unit = v.priceMinor ?? v.product.priceMinor;
    const issue: LineIssue | null = !live ? "UNAVAILABLE" : available === 0 ? "OUT_OF_STOCK" : item.quantity > available ? "INSUFFICIENT_STOCK" : null;
    const img = v.product.images.find((i) => i.colorId === color.id) ?? v.product.images[0];
    return {
      id: item.id,
      variantId: v.id,
      productId: v.product.id,
      slug: v.product.slug,
      title: p.title,
      brand: v.product.brand?.name ?? null,
      sku: v.sku,
      color: { name: color.name, slug: color.slug, hex: color.hex },
      size: v.size.label,
      image: img ? { url: img.isPlaceholder ? null : ctx.storage.publicUrl(img.storageKey), isPlaceholder: img.isPlaceholder, alt: p.title } : null,
      unitPriceMinor: unit,
      compareAtPriceMinor: v.product.compareAtPriceMinor,
      isOnSale: v.product.isOnSale,
      quantity: item.quantity,
      lineTotalMinor: unit * item.quantity,
      maxQuantity: Math.min(MAX_LINE_QTY, available),
      issue,
    };
  });

  const priced = lines.filter((l) => l.issue !== "UNAVAILABLE");
  const subtotal = priced.reduce((s, l) => s + l.lineTotalMinor, 0);
  const eligible = priced.filter((l) => !l.isOnSale || cart.coupon?.appliesToSaleItems).reduce((s, l) => s + l.lineTotalMinor, 0);

  let coupon: CouponResult | null = null;
  if (cart.coupon) coupon = await evaluateCoupon(ctx.db, cart.coupon, { subtotalMinor: subtotal, eligibleSubtotalMinor: eligible, userId: opts.userId });
  const discount = coupon?.ok ? Math.min(coupon.discountMinor, subtotal) : 0;
  const afterDiscount = subtotal - discount;

  // Delivery estimate: cheapest active Montenegro method; exact cost is chosen at checkout.
  const zone = await ctx.db.shippingZone.findFirst({
    where: { isActive: true, countryCodes: { array_contains: "ME" } },
    include: { methods: { where: { isActive: true }, orderBy: { priceMinor: "asc" }, take: 1 } },
  });
  const method = zone?.methods[0] ?? null;
  const freeOver = method?.freeOverMinor ?? null;
  const shipping = priced.length === 0 || !method || coupon?.freeShipping || (freeOver != null && afterDiscount >= freeOver) ? 0 : method.priceMinor;
  const total = afterDiscount + shipping;
  const rate = settings["tax.vatRateBps"];

  return {
    id: cart.id,
    currency: cart.currency,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    lines,
    subtotalMinor: subtotal,
    discountMinor: discount,
    shipping: method ? { code: method.code, estimateMinor: shipping, freeOverMinor: freeOver, freeShippingRemainingMinor: freeOver != null && priced.length ? Math.max(0, freeOver - afterDiscount) : null } : null,
    totalMinor: total,
    // Prices include VAT; this is the VAT portion of the total.
    vatMinor: Math.round((total * rate) / (10000 + rate)),
    vatRateBps: rate,
    coupon: cart.coupon ? { code: cart.coupon.code, type: cart.coupon.type, valid: !!coupon?.ok, error: coupon?.error ?? null, minSubtotalMinor: coupon?.minSubtotalMinor ?? null } : null,
    canCheckout: lines.length > 0 && lines.every((l) => !l.issue),
  };
}

export type PricedCart = Awaited<ReturnType<typeof priceCart>>;

export async function applyCoupon(ctx: AppContext, cartId: number, code: string, locale: Locale, userId?: number | null) {
  const coupon = await ctx.db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon) throw unprocessable("This code isn't valid", { code: "COUPON_INVALID" });
  await ctx.db.cart.update({ where: { id: cartId }, data: { couponId: coupon.id } });
  const priced = await priceCart(ctx, cartId, locale, { userId });
  if (priced.coupon && !priced.coupon.valid && priced.coupon.error !== "COUPON_MIN_SUBTOTAL") {
    // Hard failures are not kept on the cart; a minimum-spend shortfall is (it may become valid).
    await ctx.db.cart.update({ where: { id: cartId }, data: { couponId: null } });
    throw unprocessable("This code can't be used", { code: priced.coupon.error });
  }
  return priced;
}
