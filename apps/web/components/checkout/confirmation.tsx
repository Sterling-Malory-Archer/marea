"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { api, useStore } from "@/lib/store";
import { FormMessage } from "../forms";

interface Confirmation {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  email: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  shippingMethodName: string;
  shippingMethodCode: string | null;
  shippingAddress: Record<string, string | null>;
  hasAccount: boolean;
  items: { id: number; productTitle: string; brandName: string | null; colorName: string; sizeLabel: string; quantity: number; lineTotalMinor: number }[];
}

export function OrderConfirmation({ orderNumber, token }: { orderNumber: string; token: string }) {
  const { t, href, intl } = useI18n();
  const C = t.checkout;
  const A = t.account;
  const { ready, user } = useStore();
  const [order, setOrder] = useState<Confirmation | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api<Confirmation>(`/api/checkout/orders/${encodeURIComponent(orderNumber)}${token ? `?token=${encodeURIComponent(token)}` : ""}`)
      .then(setOrder)
      .catch(() => setMissing(true));
  }, [ready, orderNumber, token]);

  if (missing) return <div className="shell py-24"><FormMessage kind="error">{C.notFound}</FormMessage></div>;
  if (!order) return <div className="shell min-h-[60svh] py-24" aria-busy="true" />;

  const money = (m: number) => formatMoney(m, order.currency, intl);
  const a = order.shippingAddress;

  return (
    <div className="shell pb-24 pt-12 lg:pt-20">
      <div className="max-w-[44rem]">
        <p className="text-small text-mute">{C.confirmNumber(order.orderNumber)}</p>
        <h1 className="display mt-3 text-[clamp(2.5rem,6vw,5rem)]">{C.confirmTitle(a.firstName ?? "")}</h1>
        <p className="mt-5 text-lead text-ink/75">{C.confirmEmail(order.email)}</p>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-12">
        <div className="space-y-10 lg:col-span-7">
          <section>
            <h2 className="text-lead">{C.nextTitle}</h2>
            <p className="mt-3 max-w-[36rem] text-body leading-7 text-ink/80">{C.nextCod}</p>
          </section>
          <section className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-small font-medium">{A.shippingAddress}</h2>
              <address className="mt-2 text-small not-italic leading-6 text-ink/75">
                {a.firstName} {a.lastName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.postalCode} {a.city}<br />{A.countries[a.countryCode ?? ""] ?? a.countryCode}
              </address>
            </div>
            <div>
              <h2 className="text-small font-medium">{A.payment}</h2>
              <p className="mt-2 text-small text-ink/75">{A.payments[order.paymentMethod] ?? order.paymentMethod}</p>
              <h2 className="mt-5 text-small font-medium">{t.checkout.delivery}</h2>
              <p className="mt-2 text-small text-ink/75">{(order.shippingMethodCode && t.product.methods[order.shippingMethodCode]) || order.shippingMethodName}</p>
            </div>
          </section>
          {!order.hasAccount && !user ? (
            <section className="bg-sand p-6">
              <p className="text-body">{C.createAccount}</p>
              <Link href={href("/account/register")} className="btn btn-outline mt-5">{C.createAccountLink}</Link>
            </section>
          ) : (
            <Link href={href("/account/orders")} className="link-underline inline-block text-small">{C.viewOrders}</Link>
          )}
        </div>

        <aside className="lg:col-span-5">
          <div className="border border-line p-6">
            <ul className="divide-y divide-line">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-3 text-small">
                  <span>
                    {i.productTitle}
                    <span className="block text-ink/65">{i.colorName}, {i.sizeLabel === "ONE SIZE" ? t.product.oneSize : i.sizeLabel} × {i.quantity}</span>
                  </span>
                  <span className="tabular-nums">{money(i.lineTotalMinor)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-small">
              <div className="flex justify-between"><span>{A.subtotal}</span><span className="tabular-nums">{money(order.subtotalMinor)}</span></div>
              {order.discountMinor > 0 && <div className="flex justify-between text-claret"><span>{A.discount}{order.couponCode ? ` (${order.couponCode})` : ""}</span><span className="tabular-nums">−{money(order.discountMinor)}</span></div>}
              <div className="flex justify-between"><span>{A.shipping}</span><span className="tabular-nums">{order.shippingMinor ? money(order.shippingMinor) : t.bag.free}</span></div>
              <div className="flex justify-between border-t border-line pt-2 text-body font-medium"><span>{A.total}</span><span className="tabular-nums">{money(order.totalMinor)}</span></div>
              <p className="text-micro text-mute">{A.vatIncluded(money(order.taxMinor))}</p>
            </div>
          </div>
          <Link href={href("/new")} className="btn btn-solid mt-6 w-full">{C.keepShopping}</Link>
        </aside>
      </div>
    </div>
  );
}
