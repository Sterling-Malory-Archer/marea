import type { Request, Response } from "express";
import { Prisma, type PaymentMethod } from "@marea/db";
import type { AppContext } from "../../context.js";
import { conflict, HttpError, unprocessable } from "../../lib/errors.js";
import type { Locale } from "../../lib/i18n.js";
import { randomToken, sha256 } from "../../lib/util.js";
import { findCart, priceCart, zoneForCountry, GUEST_CART_COOKIE, type PricedCart } from "../cart/cart.service.js";
import { reserve } from "../inventory/inventory.service.js";
import { sendOrderEmail } from "../orders/order-emails.js";
import { commitOrderStock, uniqueOrderNumber } from "../orders/order.service.js";
import { getSettings } from "../settings/settings.js";

export interface AddressInput {
  firstName: string;
  lastName: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode: string;
  countryCode: string;
  phone?: string | null;
}

export interface PlaceOrderInput {
  idempotencyKey: string;
  email: string;
  phone: string;
  shippingAddress: AddressInput;
  billingAddress?: AddressInput | null;
  shippingMethodCode: string;
  paymentMethod: PaymentMethod;
  customerNote?: string | null;
  saveAddress?: boolean;
  expectedTotalMinor: number;
  locale: Locale;
}

/** Card payments go live in Phase 7 once a provider adapter is configured. */
export function cardPaymentsAvailable(_ctx: AppContext) {
  return false;
}

/** Everything the checkout page needs for a destination: priced bag, delivery options, payment options. */
export async function checkoutQuote(ctx: AppContext, req: Request, input: { country: string; methodCode?: string | null; email?: string | null; locale: Locale }) {
  const cart = await findCart(ctx, req);
  const settings = await getSettings(ctx.db);
  const zones = await ctx.db.shippingZone.findMany({ where: { isActive: true, methods: { some: { isActive: true } } }, select: { countryCodes: true } });
  const countries = [...new Set(zones.flatMap((z) => (z.countryCodes as string[]) ?? []))];
  const zone = await zoneForCountry(ctx.db, input.country);
  const methods = zone?.methods ?? [];
  const methodCode = input.methodCode && methods.some((m) => m.code === input.methodCode) ? input.methodCode : methods[0]?.code ?? null;

  const quote = cart ? await priceCart(ctx, cart.id, input.locale, { userId: req.customer?.user.id, email: input.email, shipping: { country: input.country, methodCode } }) : null;
  const afterDiscount = quote ? quote.subtotalMinor - quote.discountMinor : 0;
  const freeShip = quote?.coupon?.valid && quote.coupon.type === "FREE_SHIPPING";
  const selected = methods.find((m) => m.code === methodCode);

  return {
    countries,
    country: input.country,
    cart: quote,
    shippingMethods: methods.map((m) => ({
      code: m.code,
      name: m.name,
      description: m.description,
      priceMinor: freeShip || (m.freeOverMinor != null && afterDiscount >= m.freeOverMinor) ? 0 : m.priceMinor,
      basePriceMinor: m.priceMinor,
      freeOverMinor: m.freeOverMinor,
      minDays: m.minDays,
      maxDays: m.maxDays,
      allowsCashOnDelivery: m.allowsCashOnDelivery,
    })),
    selectedMethod: methodCode,
    paymentMethods: [
      { method: "CASH_ON_DELIVERY" as const, available: settings["checkout.codEnabled"] && !!selected?.allowsCashOnDelivery },
      { method: "CARD" as const, available: settings["checkout.cardEnabled"] && cardPaymentsAvailable(ctx) },
    ].filter((p) => p.available),
  };
}

const snapshotAddress = (a: AddressInput) => ({
  firstName: a.firstName,
  lastName: a.lastName,
  company: a.company ?? null,
  line1: a.line1,
  line2: a.line2 ?? null,
  city: a.city,
  postalCode: a.postalCode,
  countryCode: a.countryCode.toUpperCase(),
  phone: a.phone ?? null,
});

export async function placeOrder(ctx: AppContext, req: Request, res: Response, input: PlaceOrderInput) {
  // Idempotent retry (double click, flaky network): same key → same order.
  const existing = await ctx.db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.email !== input.email) throw conflict("This checkout was already submitted", { code: "IDEMPOTENCY_MISMATCH" });
    return { order: existing, accessToken: null, replay: true };
  }

  const cart = await findCart(ctx, req);
  if (!cart) throw unprocessable("Your bag is empty", { code: "EMPTY_CART" });
  const country = input.shippingAddress.countryCode.toUpperCase();
  const userId = req.customer?.user.id ?? null;
  const settings = await getSettings(ctx.db);

  const quote: PricedCart = await priceCart(ctx, cart.id, input.locale, { userId, email: input.email, shipping: { country, methodCode: input.shippingMethodCode } });
  if (quote.lines.length === 0) throw unprocessable("Your bag is empty", { code: "EMPTY_CART" });
  if (!quote.canCheckout) throw conflict("Some items in your bag are no longer available in the quantity you chose", { code: "CART_ISSUES", cart: quote });
  if (!quote.shipping || quote.shipping.code !== input.shippingMethodCode) throw unprocessable("This delivery method isn't available for the destination", { code: "SHIPPING_UNAVAILABLE" });
  if (quote.coupon && !quote.coupon.valid) throw conflict("The discount code can no longer be used", { code: quote.coupon.error ?? "COUPON_INVALID", cart: quote });

  if (input.paymentMethod === "CASH_ON_DELIVERY" && !(settings["checkout.codEnabled"] && quote.shipping.allowsCashOnDelivery))
    throw unprocessable("Cash on delivery isn't available for this delivery method", { code: "PAYMENT_UNAVAILABLE" });
  if (input.paymentMethod === "CARD" && !cardPaymentsAvailable(ctx)) throw unprocessable("Card payment isn't available yet", { code: "PAYMENT_UNAVAILABLE" });

  // Never charge a total the shopper didn't see.
  if (input.expectedTotalMinor !== quote.totalMinor) throw conflict("Prices changed while you were checking out. Please review the new total.", { code: "PRICE_CHANGED", cart: quote });

  const accessToken = randomToken(24);
  const isCod = input.paymentMethod === "CASH_ON_DELIVERY";
  const ship = snapshotAddress({ ...input.shippingAddress, phone: input.shippingAddress.phone ?? input.phone });

  let order;
  try {
    order = await ctx.db.$transaction(
      async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber: await uniqueOrderNumber(tx),
            userId,
            cartId: cart.id,
            email: input.email,
            phone: input.phone,
            customerFirstName: ship.firstName,
            customerLastName: ship.lastName,
            shippingAddress: ship,
            billingAddress: input.billingAddress ? snapshotAddress(input.billingAddress) : Prisma.DbNull,
            shippingCountry: country,
            status: isCod ? "PROCESSING" : "PENDING_PAYMENT",
            paymentStatus: isCod ? "COD_PENDING" : "PENDING",
            fulfillmentStatus: isCod ? "PROCESSING" : "UNFULFILLED",
            paymentMethod: input.paymentMethod,
            currency: quote.currency,
            subtotalMinor: quote.subtotalMinor,
            discountMinor: quote.discountMinor,
            shippingMinor: quote.shipping!.estimateMinor,
            taxMinor: quote.vatMinor,
            totalMinor: quote.totalMinor,
            shippingMethodId: quote.shipping!.methodId,
            shippingMethodName: quote.shipping!.name,
            couponCode: quote.coupon?.code ?? null,
            customerNote: input.customerNote?.slice(0, 1000) || null,
            idempotencyKey: input.idempotencyKey,
            accessTokenHash: sha256(accessToken),
            locale: input.locale,
            reservationExpiresAt: isCod ? null : new Date(Date.now() + settings["inventory.reservationMinutes"] * 60_000),
            items: {
              create: quote.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                sku: l.sku,
                productTitle: l.title,
                brandName: l.brand,
                colorName: l.color.name,
                sizeLabel: l.size,
                imageKey: null,
                unitPriceMinor: l.unitPriceMinor,
                compareAtPriceMinor: l.compareAtPriceMinor,
                quantity: l.quantity,
                lineTotalMinor: l.lineTotalMinor,
              })),
            },
            events: { create: { toStatus: isCod ? "PROCESSING" : "PENDING_PAYMENT", message: isCod ? "Order placed — cash on delivery" : "Order placed — awaiting payment" } },
            payments: {
              create: {
                provider: isCod ? "CASH_ON_DELIVERY" : "MANUAL",
                status: isCod ? "COD_PENDING" : "PENDING",
                amountMinor: quote.totalMinor,
                currency: quote.currency,
                idempotencyKey: `${input.idempotencyKey}:1`,
              },
            },
          },
        });

        // Reserve every line atomically; any shortfall rolls the whole order back.
        for (const l of quote.lines) {
          const ok = await reserve(tx, l.variantId, l.quantity, { orderId: created.id });
          if (!ok) throw conflict(`${l.title} (${l.size}) just sold out`, { code: "OUT_OF_STOCK", variantId: l.variantId, sku: l.sku });
        }

        if (quote.coupon?.valid) {
          const c = await tx.coupon.findUniqueOrThrow({ where: { code: quote.coupon.code } });
          // Guarded increment: two simultaneous checkouts can't both take the last use.
          const taken = await tx.$executeRaw`UPDATE coupons SET timesRedeemed = timesRedeemed + 1 WHERE id = ${c.id} AND (usageLimit IS NULL OR timesRedeemed < usageLimit)`;
          if (taken === 0) throw conflict("The discount code has just been used up", { code: "COUPON_USAGE_LIMIT" });
          await tx.couponRedemption.create({ data: { couponId: c.id, orderId: created.id, userId, email: input.email, amountMinor: quote.discountMinor } });
        }

        if (isCod && settings["inventory.codStockCommit"] === "order") await commitOrderStock(tx, created.id);
        await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });
        return created;
      },
      { timeout: 20_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Lost a race with our own duplicate submit: return the order that won.
      const won = await ctx.db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (won) return { order: won, accessToken: null, replay: true };
    }
    if (err instanceof HttpError) throw err;
    throw err;
  }

  if (!userId) res.clearCookie(GUEST_CART_COOKIE, { path: "/" });

  if (userId && input.saveAddress) {
    const exists = await ctx.db.address.findFirst({ where: { userId, line1: ship.line1, postalCode: ship.postalCode, countryCode: ship.countryCode } });
    if (!exists) {
      const count = await ctx.db.address.count({ where: { userId } });
      if (count < 20) await ctx.db.address.create({ data: { ...ship, phone: ship.phone, userId, isDefaultShipping: count === 0, isDefaultBilling: count === 0 } });
    }
  }

  // COD orders are confirmed now; card orders are confirmed when payment succeeds (Phase 7).
  if (isCod) await sendOrderEmail(ctx, "confirmation", order.id, { accessToken });
  return { order, accessToken, replay: false };
}

