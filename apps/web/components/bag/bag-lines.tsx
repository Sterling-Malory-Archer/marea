"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, productHref, tint } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { api, ApiError, useStore } from "@/lib/store";
import type { Cart, CartLine } from "@/lib/types";
import { Placeholder } from "../placeholder";

export function LineItem({ line, compact = false, onNavigate }: { line: CartLine; compact?: boolean; onNavigate?: () => void }) {
  const { t, href, intl, locale } = useI18n();
  const B = t.bag;
  const { setCart } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const money = (m: number) => formatMoney(m, "EUR", intl);

  async function mutate(method: "PATCH" | "DELETE", quantity?: number) {
    setBusy(true);
    setError(null);
    try {
      setCart(await api<Cart>(`/api/cart/items/${line.id}?locale=${locale}`, { method, json: method === "PATCH" ? { quantity } : undefined }));
    } catch (e) {
      setError(e instanceof ApiError && typeof e.details?.available === "number" ? B.stockError(e.details.available) : t.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const issue = line.issue === "INSUFFICIENT_STOCK" ? B.issue.INSUFFICIENT_STOCK(line.maxQuantity) : line.issue ? B.issue[line.issue] : null;
  const max = Math.max(line.quantity, line.maxQuantity, 1);

  return (
    <li className={`flex gap-4 py-5 ${busy ? "opacity-60" : ""}`} aria-busy={busy}>
      <Link href={href(productHref(line.slug))} onClick={onNavigate} className={`relative shrink-0 overflow-hidden bg-sand ${compact ? "h-28 w-21" : "h-36 w-27 sm:h-44 sm:w-33"}`} style={{ aspectRatio: "3 / 4" }} tabIndex={-1} aria-hidden>
        {line.image?.url ? (
          <Image src={line.image.url} alt="" fill sizes="132px" className="object-cover" />
        ) : (
          <Placeholder alt={line.title} label="" showLabel={false} tint={tint(line.color.hex, 0.74)} className="absolute inset-0" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {line.brand && <p className="text-micro text-mute">{line.brand}</p>}
            <Link href={href(productHref(line.slug))} onClick={onNavigate} className="block text-small leading-snug hover:underline sm:text-body">{line.title}</Link>
          </div>
          <p className="shrink-0 text-small tabular-nums">{money(line.lineTotalMinor)}</p>
        </div>
        <p className="mt-1 text-micro text-ink/70 sm:text-small">
          {B.colour}: {line.color.name} <span aria-hidden className="mx-1 text-line">|</span> {B.size}: {line.size === "ONE SIZE" ? t.product.oneSize : line.size}
        </p>
        {line.quantity > 1 && <p className="mt-0.5 text-micro text-mute tabular-nums">{money(line.unitPriceMinor)} {B.each}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <label className="flex items-center gap-2 text-micro text-mute">
            <span className="sr-only sm:not-sr-only">{B.qty}</span>
            <select
              value={line.quantity}
              disabled={busy || line.issue === "UNAVAILABLE" || line.issue === "OUT_OF_STOCK"}
              onChange={(e) => mutate("PATCH", Number(e.target.value))}
              className="h-9 border border-line bg-paper px-2 text-small text-ink focus:border-ink focus:outline-none"
              aria-label={`${B.qty}: ${line.title}`}
            >
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n} disabled={n > line.maxQuantity}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => mutate("DELETE")} disabled={busy} className="link-underline text-micro sm:text-small">
            {B.remove}
          </button>
        </div>
        {(issue || error) && <p role="alert" className="mt-2 text-micro text-claret sm:text-small">{error ?? issue}</p>}
      </div>
    </li>
  );
}

export function Totals({ cart }: { cart: Cart }) {
  const { t, intl } = useI18n();
  const B = t.bag;
  const money = (m: number) => formatMoney(m, cart.currency, intl);
  const remaining = cart.shipping?.freeShippingRemainingMinor;
  return (
    <div className="space-y-2.5 text-small">
      <div className="flex justify-between"><span>{B.subtotal}</span><span className="tabular-nums">{money(cart.subtotalMinor)}</span></div>
      {cart.discountMinor > 0 && (
        <div className="flex justify-between text-claret"><span>{B.discount}{cart.coupon ? ` (${cart.coupon.code})` : ""}</span><span className="tabular-nums">−{money(cart.discountMinor)}</span></div>
      )}
      {cart.shipping && (
        <div className="flex justify-between"><span>{B.delivery}</span><span className="tabular-nums">{cart.shipping.estimateMinor === 0 ? B.free : money(cart.shipping.estimateMinor)}</span></div>
      )}
      <div className="flex justify-between border-t border-line pt-3 text-body font-medium"><span>{B.total}</span><span className="tabular-nums">{money(cart.totalMinor)}</span></div>
      <p className="text-micro text-mute">{B.vat(money(cart.vatMinor))}</p>
      {remaining != null && (
        <p className="pt-1 text-micro text-ink/75 sm:text-small" aria-live="polite">{remaining > 0 ? B.freeRemaining(money(remaining)) : B.freeReached}</p>
      )}
    </div>
  );
}

/** Checkout opens in Phase 6; until then the button is honest about it. */
export function CheckoutButton({ cart }: { cart: Cart }) {
  const { t } = useI18n();
  return (
    <div>
      <button type="button" disabled className="btn btn-solid w-full disabled:cursor-not-allowed disabled:border-line disabled:bg-sand disabled:text-mute" aria-describedby="checkout-note">
        {t.bag.checkout}
      </button>
      <p id="checkout-note" className="mt-2 text-center text-micro text-mute">{cart.canCheckout ? t.bag.checkoutSoon : ""}</p>
    </div>
  );
}
