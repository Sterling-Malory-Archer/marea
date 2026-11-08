import type { Order, OrderItem, Shipment } from "@marea/db";
import type { AppContext } from "../../context.js";
import type { Locale } from "../../lib/i18n.js";
import { storefrontUrl } from "../customers/auth.routes.js";

type Kind = "confirmation" | "shipped" | "delivered" | "cancelled";

const INTL: Record<Locale, string> = { en: "en-IE", me: "sr-Latn-ME" };

const copy = {
  en: {
    confirmation: { subject: (n: string) => `Order ${n} confirmed`, title: "Thank you for your order", intro: (name: string) => `Hello ${name}, we've received your order and are preparing it now.` },
    shipped: { subject: (n: string) => `Order ${n} is on its way`, title: "Your order is on its way", intro: (name: string) => `Hello ${name}, your order has left our studio.` },
    delivered: { subject: (n: string) => `Order ${n} delivered`, title: "Your order has been delivered", intro: (name: string) => `Hello ${name}, we hope you love your new pieces.` },
    cancelled: { subject: (n: string) => `Order ${n} cancelled`, title: "Your order has been cancelled", intro: (name: string) => `Hello ${name}, your order has been cancelled. If you paid online, the refund is returned to the original payment method.` },
    labels: { order: "Order", qty: "Qty", subtotal: "Subtotal", discount: "Discount", delivery: "Delivery", total: "Total", vat: "Including VAT", address: "Delivery address", payment: "Payment", cod: "Cash on delivery — please have the exact amount ready for the courier.", card: "Card", track: "Track your parcel", view: "View your order", footer: "Questions? Reply to this e-mail and we'll help.", free: "Free" },
  },
  me: {
    confirmation: { subject: (n: string) => `Porudžbina ${n} je potvrđena`, title: "Hvala na porudžbini", intro: (name: string) => `Zdravo ${name}, primili smo vašu porudžbinu i upravo je pripremamo.` },
    shipped: { subject: (n: string) => `Porudžbina ${n} je poslata`, title: "Vaša porudžbina je na putu", intro: (name: string) => `Zdravo ${name}, vaša porudžbina je napustila naš studio.` },
    delivered: { subject: (n: string) => `Porudžbina ${n} je isporučena`, title: "Porudžbina je isporučena", intro: (name: string) => `Zdravo ${name}, nadamo se da ćete uživati u novim komadima.` },
    cancelled: { subject: (n: string) => `Porudžbina ${n} je otkazana`, title: "Porudžbina je otkazana", intro: (name: string) => `Zdravo ${name}, vaša porudžbina je otkazana. Ako ste platili online, novac se vraća na isti način plaćanja.` },
    labels: { order: "Porudžbina", qty: "Kol.", subtotal: "Međuzbir", discount: "Popust", delivery: "Dostava", total: "Ukupno", vat: "Uključen PDV", address: "Adresa za dostavu", payment: "Plaćanje", cod: "Plaćanje pouzećem — pripremite tačan iznos za kurira.", card: "Kartica", track: "Pratite pošiljku", view: "Pogledajte porudžbinu", footer: "Imate pitanje? Odgovorite na ovaj e-mail i pomoći ćemo.", free: "Besplatno" },
  },
} as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderOrderEmail(
  ctx: AppContext,
  kind: Kind,
  order: Order & { items: OrderItem[]; shipments?: Shipment[] },
  opts: { accessToken?: string | null } = {},
) {
  const locale = (order.locale === "me" ? "me" : "en") as Locale;
  const c = copy[locale];
  const L = c.labels;
  const money = (m: number) => new Intl.NumberFormat(INTL[locale], { style: "currency", currency: order.currency }).format(m / 100);
  const k = c[kind];
  const addr = order.shippingAddress as Record<string, string | null>;
  const addressLines = [`${addr.firstName ?? ""} ${addr.lastName ?? ""}`.trim(), addr.line1, addr.line2, `${addr.postalCode ?? ""} ${addr.city ?? ""}`.trim(), addr.countryCode].filter(Boolean) as string[];
  const tracking = order.shipments?.find((s) => s.trackingUrl);
  const link = order.userId
    ? storefrontUrl(ctx, locale, `/account/orders/${order.orderNumber}`)
    : opts.accessToken
      ? storefrontUrl(ctx, locale, `/checkout/confirmation/${order.orderNumber}?token=${opts.accessToken}`)
      : null;
  const showItems = kind === "confirmation" || kind === "cancelled";

  const rows = order.items.map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #E5E2DC;font-size:14px">${esc(i.productTitle)}<br><span style="color:#777;font-size:12px">${esc(i.colorName)} / ${esc(i.sizeLabel)} — ${L.qty} ${i.quantity}</span></td><td align="right" style="padding:10px 0;border-bottom:1px solid #E5E2DC;font-size:14px;white-space:nowrap">${money(i.lineTotalMinor)}</td></tr>`).join("");
  const total = (label: string, value: string, bold = false) => `<tr><td style="padding:4px 0;font-size:14px${bold ? ";font-weight:bold" : ""}">${label}</td><td align="right" style="padding:4px 0;font-size:14px${bold ? ";font-weight:bold" : ""}">${value}</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#F8F7F4;color:#202020;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0">
<tr><td colspan="2" style="font-family:Georgia,serif;font-size:22px;letter-spacing:.3em;padding-bottom:32px">MAREA</td></tr>
<tr><td colspan="2" style="font-family:Georgia,serif;font-size:28px;line-height:1.2;padding-bottom:12px">${esc(k.title)}</td></tr>
<tr><td colspan="2" style="font-size:15px;line-height:1.6;padding-bottom:8px">${esc(k.intro(order.customerFirstName))}</td></tr>
<tr><td colspan="2" style="font-size:13px;color:#777;padding-bottom:24px">${L.order} ${esc(order.orderNumber)}</td></tr>
${showItems ? rows + `<tr><td colspan="2" style="height:12px"></td></tr>` + total(L.subtotal, money(order.subtotalMinor)) + (order.discountMinor ? total(`${L.discount}${order.couponCode ? ` (${esc(order.couponCode)})` : ""}`, `−${money(order.discountMinor)}`) : "") + total(`${L.delivery} — ${esc(order.shippingMethodName)}`, order.shippingMinor ? money(order.shippingMinor) : L.free) + total(L.total, money(order.totalMinor), true) + `<tr><td colspan="2" style="font-size:12px;color:#777;padding-bottom:24px">${L.vat} ${money(order.taxMinor)}</td></tr>` : ""}
${kind === "confirmation" ? `<tr><td colspan="2" style="font-size:14px;line-height:1.6;padding-bottom:20px"><strong>${L.address}</strong><br>${addressLines.map(esc).join("<br>")}</td></tr><tr><td colspan="2" style="font-size:14px;line-height:1.6;padding-bottom:24px"><strong>${L.payment}</strong><br>${order.paymentMethod === "CASH_ON_DELIVERY" ? L.cod : L.card}</td></tr>` : ""}
${kind === "shipped" && tracking ? `<tr><td colspan="2" style="padding:8px 0 24px"><a href="${esc(tracking.trackingUrl!)}" style="display:inline-block;background:#202020;color:#F8F7F4;text-decoration:none;padding:14px 24px;font-size:13px">${L.track}</a><br><span style="font-size:12px;color:#777">${esc(tracking.carrier)} ${esc(tracking.trackingNumber ?? "")}</span></td></tr>` : ""}
${link ? `<tr><td colspan="2" style="padding-bottom:24px"><a href="${esc(link)}" style="color:#202020;font-size:14px">${L.view}</a></td></tr>` : ""}
<tr><td colspan="2" style="font-size:12px;color:#777;border-top:1px solid #E5E2DC;padding-top:16px">${L.footer}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    k.title,
    "",
    k.intro(order.customerFirstName),
    `${L.order} ${order.orderNumber}`,
    "",
    ...(showItems
      ? [...order.items.map((i) => `${i.productTitle} (${i.colorName} / ${i.sizeLabel}) × ${i.quantity} — ${money(i.lineTotalMinor)}`), "", `${L.total}: ${money(order.totalMinor)} (${L.vat} ${money(order.taxMinor)})`]
      : []),
    ...(kind === "confirmation" ? ["", `${L.address}:`, ...addressLines, "", `${L.payment}: ${order.paymentMethod === "CASH_ON_DELIVERY" ? L.cod : L.card}`] : []),
    ...(kind === "shipped" && tracking ? ["", `${L.track}: ${tracking.trackingUrl}`] : []),
    ...(link ? ["", `${L.view}: ${link}`] : []),
    "",
    L.footer,
  ].join("\n");

  return { to: order.email, subject: k.subject(order.orderNumber), html, text };
}

/** E-mail failures never roll back an order; they are logged for follow-up. */
export async function sendOrderEmail(ctx: AppContext, kind: Kind, orderId: number, opts: { accessToken?: string | null } = {}) {
  try {
    const order = await ctx.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, shipments: { orderBy: { id: "desc" } } } });
    await ctx.mailer.send(renderOrderEmail(ctx, kind, order, opts));
  } catch (err) {
    ctx.log.error({ err, orderId, kind }, "Order e-mail failed");
  }
}
