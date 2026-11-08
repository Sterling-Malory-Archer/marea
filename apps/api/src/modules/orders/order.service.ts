import crypto from "node:crypto";
import type { OrderStatus, Tx } from "@marea/db";
import type { AppContext } from "../../context.js";
import { conflict, notFound } from "../../lib/errors.js";
import { adjustOnHand, commitSale, release } from "../inventory/inventory.service.js";
import { sendOrderEmail } from "./order-emails.js";

/**
 * Order lifecycle. Every status change goes through `transitionOrder`, which
 * locks the order row, validates the transition, and applies its inventory,
 * payment-status and coupon side effects in the same transaction.
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED", "FAILED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  FAILED: [],
  REFUNDED: [],
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Non-sequential, unambiguous order numbers, e.g. MR-26-7KQ4XD (doesn't reveal order volume). */
export async function uniqueOrderNumber(tx: Tx) {
  const yy = String(new Date().getUTCFullYear()).slice(2);
  for (let i = 0; i < 10; i++) {
    const bytes = crypto.randomBytes(6);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const candidate = `MR-${yy}-${code}`;
    if (!(await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } }))) return candidate;
  }
  throw new Error("Could not allocate an order number");
}

/** Per variant: units still reserved by this order, and units already deducted (sold) for it. */
async function stockState(tx: Tx, orderId: number) {
  const rows = await tx.inventoryMovement.groupBy({ by: ["variantId", "reason"], where: { orderId }, _sum: { deltaReserved: true, deltaOnHand: true } });
  const state = new Map<number, { reserved: number; sold: number }>();
  for (const r of rows) {
    const s = state.get(r.variantId) ?? { reserved: 0, sold: 0 };
    s.reserved += r._sum.deltaReserved ?? 0;
    if (r.reason === "SALE") s.sold += -(r._sum.deltaOnHand ?? 0);
    if (r.reason === "RETURN") s.sold -= r._sum.deltaOnHand ?? 0;
    state.set(r.variantId, s);
  }
  return state;
}

/** Deduct every unit this order still has reserved (payment confirmed, or COD shipped). */
export async function commitOrderStock(tx: Tx, orderId: number, actorUserId?: number | null) {
  for (const [variantId, s] of await stockState(tx, orderId)) if (s.reserved > 0) await commitSale(tx, variantId, s.reserved, { orderId, actorUserId });
}

/** Give back everything this order holds: release reservations, return sold units to stock. */
async function returnOrderStock(tx: Tx, orderId: number, actorUserId?: number | null) {
  for (const [variantId, s] of await stockState(tx, orderId)) {
    if (s.reserved > 0) await release(tx, variantId, s.reserved, { orderId, actorUserId });
    if (s.sold > 0) await adjustOnHand(tx, variantId, s.sold, "RETURN", { orderId, actorUserId, note: "Order cancelled" });
  }
}

export interface TransitionOptions {
  actorUserId?: number | null;
  message?: string | null;
  notify?: boolean;
}

export async function transitionOrder(ctx: AppContext, orderId: number, to: OrderStatus, opts: TransitionOptions = {}) {
  const result = await ctx.db.$transaction(async (tx) => {
    // Row lock: concurrent admin clicks, webhooks and the expiry job serialise here.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { couponRedemptions: true } });
    if (!order) throw notFound("Order");
    const from = order.status;
    if (from === to) return { order, from, changed: false };
    if (!TRANSITIONS[from].includes(to)) throw conflict(`An order that is ${from.toLowerCase().replace("_", " ")} can't be marked ${to.toLowerCase().replace("_", " ")}`, { code: "INVALID_TRANSITION", from, to, allowed: TRANSITIONS[from] });
    if (to === "REFUNDED" && order.paymentMethod === "CARD") throw conflict("Card refunds are issued through the payment provider", { code: "USE_PAYMENT_REFUND" });

    const now = new Date();
    const data: Parameters<Tx["order"]["update"]>[0]["data"] = { status: to };

    switch (to) {
      case "PAID":
        await commitOrderStock(tx, order.id, opts.actorUserId);
        Object.assign(data, { paymentStatus: "PAID", paidAt: now, reservationExpiresAt: null });
        break;
      case "PROCESSING":
        data.fulfillmentStatus = "PROCESSING";
        break;
      case "SHIPPED":
        // COD orders configured to deduct stock on shipment do it now.
        await commitOrderStock(tx, order.id, opts.actorUserId);
        data.fulfillmentStatus = "SHIPPED";
        await tx.shipment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "SHIPPED", shippedAt: now } });
        break;
      case "DELIVERED":
        data.fulfillmentStatus = "DELIVERED";
        await tx.shipment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "SHIPPED", "IN_TRANSIT"] } }, data: { status: "DELIVERED", deliveredAt: now } });
        // Cash collected by the courier.
        if (order.paymentStatus === "COD_PENDING") {
          Object.assign(data, { paymentStatus: "PAID", paidAt: now });
          await tx.payment.updateMany({ where: { orderId: order.id, provider: "CASH_ON_DELIVERY" }, data: { status: "PAID", capturedAt: now } });
        }
        break;
      case "CANCELLED":
      case "FAILED":
        await returnOrderStock(tx, order.id, opts.actorUserId);
        Object.assign(data, { cancelledAt: now, reservationExpiresAt: null, paymentStatus: order.paymentStatus === "PAID" ? "PAID" : to === "FAILED" ? "FAILED" : "CANCELLED" });
        await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "COD_PENDING", "AUTHORIZED"] } }, data: { status: to === "FAILED" ? "FAILED" : "CANCELLED" } });
        // Free the coupon use again.
        for (const r of order.couponRedemptions) {
          await tx.couponRedemption.delete({ where: { id: r.id } });
          await tx.$executeRaw`UPDATE coupons SET timesRedeemed = GREATEST(timesRedeemed - 1, 0) WHERE id = ${r.couponId}`;
        }
        break;
      case "REFUNDED":
        Object.assign(data, { paymentStatus: "REFUNDED", refundedMinor: order.totalMinor });
        break;
    }

    const updated = await tx.order.update({ where: { id: order.id }, data });
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: from, toStatus: to, message: opts.message?.slice(0, 500) ?? null, actorUserId: opts.actorUserId ?? null } });
    return { order: updated, from, changed: true };
  }, { timeout: 20_000 });

  if (result.changed && opts.notify !== false) {
    const kind = to === "SHIPPED" ? "shipped" : to === "DELIVERED" ? "delivered" : to === "CANCELLED" ? "cancelled" : null;
    if (kind) await sendOrderEmail(ctx, kind, orderId);
  }
  return result;
}

/**
 * Cancel unpaid online-payment orders whose reservation window has passed,
 * returning their stock. Safe to run from several instances: each order is
 * re-checked under its row lock inside transitionOrder.
 */
export async function releaseExpiredReservations(ctx: AppContext, now = new Date()) {
  const expired = await ctx.db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  let released = 0;
  for (const o of expired) {
    try {
      const r = await transitionOrder(ctx, o.id, "CANCELLED", { message: "Payment not completed in time — reservation released", notify: false });
      if (r.changed) released++;
    } catch (err) {
      ctx.log.warn({ err, orderId: o.id }, "Reservation release skipped");
    }
  }
  return released;
}
