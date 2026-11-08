import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@marea/db";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { pageParams } from "../../lib/util.js";
import { validated } from "../../middleware/http.js";
import { requirePermission } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";
import { sendOrderEmail } from "./order-emails.js";
import { transitionOrder, TRANSITIONS } from "./order.service.js";

const STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED", "REFUNDED"] as const;
const numberParam = z.object({ orderNumber: z.string().max(32) });

export function ordersAdminRouter(ctx: AppContext) {
  const r = Router();
  const read = requirePermission("orders:read");
  const write = requirePermission("orders:write");

  const load = async (orderNumber: string) => {
    const o = await ctx.db.order.findUnique({ where: { orderNumber } });
    if (!o) throw notFound("Order");
    return o;
  };

  r.get(
    "/orders",
    read,
    validated(
      {
        query: z.object({
          q: z.string().trim().max(100).optional(),
          status: z.enum(STATUSES).optional(),
          paymentStatus: z.enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED", "COD_PENDING"]).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
      async (_req, res, { query }) => {
        const where: Prisma.OrderWhereInput = {
          status: query.status,
          paymentStatus: query.paymentStatus,
          placedAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
          ...(query.q
            ? { OR: [{ orderNumber: { contains: query.q } }, { email: { contains: query.q } }, { customerLastName: { contains: query.q } }, { phone: { contains: query.q } }, { items: { some: { sku: { contains: query.q } } } }] }
            : {}),
        };
        const [total, items] = await Promise.all([
          ctx.db.order.count({ where }),
          ctx.db.order.findMany({
            where,
            orderBy: { placedAt: "desc" },
            ...pageParams(query.page, query.pageSize),
            select: { id: true, orderNumber: true, placedAt: true, email: true, customerFirstName: true, customerLastName: true, status: true, paymentStatus: true, fulfillmentStatus: true, paymentMethod: true, totalMinor: true, currency: true, shippingCountry: true, _count: { select: { items: true } } },
          }),
        ]);
        res.json({ items, total, page: query.page, pageSize: query.pageSize });
      },
    ),
  );

  r.get("/orders/:orderNumber", read, validated({ params: numberParam }, async (_req, res, { params }) => {
    const order = await ctx.db.order.findUnique({
      where: { orderNumber: params.orderNumber },
      include: {
        items: true,
        payments: { include: { refunds: true } },
        shipments: true,
        events: { orderBy: { createdAt: "asc" } },
        couponRedemptions: true,
        inventoryMovements: { orderBy: { id: "asc" }, select: { variantId: true, reason: true, deltaOnHand: true, deltaReserved: true, createdAt: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!order) throw notFound("Order");
    const { accessTokenHash: _t, ...safe } = order;
    res.json({ ...safe, allowedTransitions: TRANSITIONS[order.status] });
  }));

  r.post(
    "/orders/:orderNumber/status",
    write,
    validated({ params: numberParam, body: z.object({ status: z.enum(STATUSES), message: z.string().trim().max(500).optional(), notifyCustomer: z.boolean().default(true) }) }, async (req, res, { params, body }) => {
      const before = await load(params.orderNumber);
      const { order } = await transitionOrder(ctx, before.id, body.status, { actorUserId: req.admin!.user.id, message: body.message, notify: body.notifyCustomer });
      await audit(ctx.db, req, { action: "order.status", entityType: "order", entityId: order.orderNumber, before: { status: before.status }, after: { status: order.status, message: body.message } });
      res.json({ orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, allowedTransitions: TRANSITIONS[order.status] });
    }),
  );

  r.post(
    "/orders/:orderNumber/shipments",
    write,
    validated(
      {
        params: numberParam,
        body: z.object({
          carrier: z.string().trim().min(1).max(80),
          trackingNumber: z.string().trim().max(120).optional(),
          trackingUrl: z.url().max(500).refine((u) => u.startsWith("https://"), "Use an https:// link").optional(),
          markShipped: z.boolean().default(true),
          notifyCustomer: z.boolean().default(true),
        }),
      },
      async (req, res, { params, body }) => {
        const order = await load(params.orderNumber);
        const shipment = await ctx.db.shipment.create({ data: { orderId: order.id, carrier: body.carrier, trackingNumber: body.trackingNumber ?? null, trackingUrl: body.trackingUrl ?? null } });
        await audit(ctx.db, req, { action: "order.shipment", entityType: "order", entityId: order.orderNumber, after: shipment });
        let status = order.status;
        if (body.markShipped && order.status !== "SHIPPED") {
          status = (await transitionOrder(ctx, order.id, "SHIPPED", { actorUserId: req.admin!.user.id, message: `Shipped with ${body.carrier}`, notify: body.notifyCustomer })).order.status;
        } else if (body.notifyCustomer && order.status === "SHIPPED") {
          await sendOrderEmail(ctx, "shipped", order.id);
        }
        res.status(201).json({ shipment, status });
      },
    ),
  );

  r.post("/orders/:orderNumber/notes", write, validated({ params: numberParam, body: z.object({ message: z.string().trim().min(1).max(500) }) }, async (req, res, { params, body }) => {
    const order = await load(params.orderNumber);
    const event = await ctx.db.orderEvent.create({ data: { orderId: order.id, message: body.message, isInternal: true, actorUserId: req.admin!.user.id } });
    res.status(201).json(event);
  }));

  return r;
}
