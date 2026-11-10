import { Router } from "express";
import { z } from "zod";
import type { OrderStatus } from "@marea/db";
import type { AppContext } from "../../context.js";
import { validated } from "../../middleware/http.js";
import { requirePermission } from "../../middleware/auth.js";
import { getSettings } from "../settings/settings.js";

/** Orders that count as sales: placed and not cancelled/failed (COD counts when placed). */
export const SALE_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const STORE_TZ = "Europe/Podgorica";

const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function dashboardRouter(ctx: AppContext) {
  const r = Router();

  /** What still stands between this installation and a real launch. Only facts the software can check. */
  r.get("/dashboard/launch-checklist", requirePermission("dashboard:read"), async (_req, res) => {
    const [settings, reviewPages, demoProducts, demoCoupons, placeholderImages, activeProducts] = await Promise.all([
      getSettings(ctx.db),
      ctx.db.page.findMany({ where: { needsReview: true, isPublished: true }, select: { title: true, slug: true } }),
      ctx.db.product.count({ where: { reference: { startsWith: "DEMO-" } } }),
      ctx.db.coupon.count({ where: { code: { startsWith: "DEMO" }, isActive: true } }),
      ctx.db.productImage.count({ where: { isPlaceholder: true, product: { status: "ACTIVE" } } }),
      ctx.db.product.count({ where: { status: "ACTIVE" } }),
    ]);
    const companyMissing = (["company.name", "company.address", "company.taxId", "company.registrationNo"] as const).filter((k) => !settings[k]);
    const items = [
      { key: "company", ok: companyMissing.length === 0, label: "Company details for documents and legal pages", detail: companyMissing.length ? `Missing: ${companyMissing.map((k) => k.split(".")[1]).join(", ")}` : null, href: "/admin/settings" },
      { key: "support", ok: !!settings["store.supportEmail"], label: "Customer service e-mail", detail: null, href: "/admin/settings" },
      { key: "alerts", ok: !!settings["notifications.orderEmail"], label: "New-order alert inbox", detail: null, href: "/admin/settings" },
      { key: "mail", ok: ctx.env.MAIL_DRIVER === "smtp", label: "E-mail sending (SMTP) connected", detail: ctx.env.MAIL_DRIVER === "smtp" ? null : "E-mails are only written to the server log", href: null },
      { key: "pages", ok: reviewPages.length === 0, label: "Information and legal pages approved", detail: reviewPages.length ? `Draft text: ${reviewPages.map((p) => p.title).join(", ")}` : null, href: "/admin/content?tab=pages" },
      { key: "catalogue", ok: activeProducts - demoProducts > 0, label: "Real products published", detail: null, href: "/admin/products" },
      { key: "photos", ok: placeholderImages === 0, label: "Placeholder photos replaced on live products", detail: placeholderImages ? `${placeholderImages} placeholder image(s)` : null, href: "/admin/products" },
      { key: "demo", ok: demoProducts === 0 && demoCoupons === 0, label: "Demo products and codes removed", detail: demoProducts || demoCoupons ? `${demoProducts} demo product(s), ${demoCoupons} demo code(s)` : null, href: "/admin/products?q=DEMO-" },
    ];
    res.json({ items, done: items.filter((i) => i.ok).length, total: items.length });
  });

  r.get("/dashboard", requirePermission("dashboard:read"), validated({ query: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }) }, async (_req, res, { query }) => {
    const now = new Date();
    const since = new Date(now.getTime() - query.days * 864e5);
    const prevSince = new Date(since.getTime() - query.days * 864e5);

    const [orders, prev, recent, best, lowStock, newCustomers, pending] = await Promise.all([
      ctx.db.order.findMany({ where: { placedAt: { gte: since }, status: { in: SALE_STATUSES } }, select: { placedAt: true, totalMinor: true, refundedMinor: true } }),
      ctx.db.order.aggregate({ where: { placedAt: { gte: prevSince, lt: since }, status: { in: SALE_STATUSES } }, _sum: { totalMinor: true }, _count: true }),
      ctx.db.order.findMany({ orderBy: { placedAt: "desc" }, take: 8, select: { orderNumber: true, placedAt: true, customerFirstName: true, customerLastName: true, status: true, totalMinor: true, currency: true } }),
      ctx.db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, order: { placedAt: { gte: since }, status: { in: SALE_STATUSES } } },
        _sum: { quantity: true, lineTotalMinor: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
      ctx.db.$queryRaw<{ variantId: number; sku: string; title: string; size: string; color: string; available: number; threshold: number; productId: number }[]>`
        SELECT v.id AS variantId, v.sku, p.title, s.label AS size, c.name AS color, p.id AS productId,
               (i.quantityOnHand - i.quantityReserved) AS available, i.lowStockThreshold AS threshold
          FROM inventory i
          JOIN product_variants v ON v.id = i.variantId
          JOIN products p ON p.id = v.productId
          JOIN sizes s ON s.id = v.sizeId
          JOIN colors c ON c.id = v.colorId
         WHERE p.status = 'ACTIVE' AND v.isActive = TRUE AND i.allowBackorder = FALSE
           AND (i.quantityOnHand - i.quantityReserved) <= i.lowStockThreshold
         ORDER BY available ASC, p.title ASC
         LIMIT 12`,
      ctx.db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: since } } }),
      ctx.db.order.count({ where: { status: { in: ["PROCESSING", "PAID"] } } }),
    ]);

    // Current (English) catalogue titles — order snapshots may be in the buyer's language.
    const titles = new Map((await ctx.db.product.findMany({ where: { id: { in: best.map((b) => b.productId!).filter(Boolean) } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));

    // Bucket by the store's local calendar day, filling empty days with zero.
    const buckets = new Map<string, { date: string; salesMinor: number; orders: number }>();
    for (let d = new Date(since); d <= now; d = new Date(d.getTime() + 864e5)) buckets.set(localDay(d), { date: localDay(d), salesMinor: 0, orders: 0 });
    let sales = 0;
    for (const o of orders) {
      const net = o.totalMinor - o.refundedMinor;
      sales += net;
      const b = buckets.get(localDay(o.placedAt));
      if (b) {
        b.salesMinor += net;
        b.orders++;
      }
    }
    const prevSales = prev._sum.totalMinor ?? 0;
    res.json({
      range: { days: query.days, since, until: now },
      totals: {
        salesMinor: sales,
        orders: orders.length,
        averageOrderMinor: orders.length ? Math.round(sales / orders.length) : 0,
        newCustomers,
        toFulfil: pending,
        previous: { salesMinor: prevSales, orders: prev._count },
      },
      revenueByDay: [...buckets.values()],
      recentOrders: recent,
      bestsellers: best.map((b) => ({ productId: b.productId, title: titles.get(b.productId!) ?? "Deleted product", units: b._sum.quantity ?? 0, revenueMinor: b._sum.lineTotalMinor ?? 0 })),
      lowStock: lowStock.map((l) => ({ ...l, available: Number(l.available), threshold: Number(l.threshold) })),
    });
  }));

  return r;
}
