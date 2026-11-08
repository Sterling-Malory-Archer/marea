"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { api, ApiError, useStore } from "@/lib/store";
import type { Cart, CouponError } from "@/lib/types";
import { CheckoutButton, LineItem, Totals } from "./bag-lines";

function CouponForm({ cart }: { cart: Cart }) {
  const { t, intl, locale } = useI18n();
  const B = t.bag;
  const { setCart } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const describe = (code: CouponError | null, min: number | null) =>
    code === "COUPON_MIN_SUBTOTAL" ? B.couponErrors.COUPON_MIN_SUBTOTAL(formatMoney(min ?? 0, cart.currency, intl)) : code ? B.couponErrors[code] : null;

  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      setCart(await api<Cart>(`/api/cart/coupon?locale=${locale}`, { method: "POST", json: { code } }));
    } catch (err) {
      setError(err instanceof ApiError ? describe(err.code as CouponError, null) ?? B.couponErrors.COUPON_INVALID : t.auth.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  if (cart.coupon) {
    const pending = describe(cart.coupon.valid ? null : cart.coupon.error, cart.coupon.minSubtotalMinor);
    return (
      <div className="text-small">
        <div className="flex items-center justify-between">
          <span>{B.code}: <span className="font-medium">{cart.coupon.code}</span></span>
          <button type="button" className="link-underline" onClick={async () => setCart(await api<Cart>(`/api/cart/coupon?locale=${locale}`, { method: "DELETE" }))}>{B.removeCode}</button>
        </div>
        {pending && <p className="mt-2 text-claret" role="status">{pending}</p>}
      </div>
    );
  }
  return (
    <form onSubmit={apply} noValidate>
      <label htmlFor="coupon" className="mb-1.5 block text-small">{B.code}</label>
      <div className="flex">
        <input id="coupon" name="code" autoComplete="off" autoCapitalize="characters" maxLength={40} aria-invalid={!!error} aria-describedby={error ? "coupon-err" : undefined} className="h-11 min-w-0 flex-1 border border-r-0 border-line bg-paper px-3 text-small uppercase focus:border-ink focus:outline-none" />
        <button type="submit" disabled={busy} className="btn btn-outline h-11 min-h-11">{busy ? B.applying : B.apply}</button>
      </div>
      {error && <p id="coupon-err" role="alert" className="mt-2 text-micro text-claret">{error}</p>}
    </form>
  );
}

export function BagPage() {
  const { t, href } = useI18n();
  const B = t.bag;
  const { cart, ready } = useStore();

  if (!ready || !cart) return <div className="shell min-h-[60svh] py-24" aria-busy="true" />;

  return (
    <div className="shell pb-24 pt-10 lg:pt-14">
      <h1 className="display text-[clamp(2.25rem,5vw,4.25rem)]">
        {B.title}
        {cart.itemCount > 0 && <span className="ml-3 align-middle font-sans text-small text-mute tabular-nums">({cart.itemCount})</span>}
      </h1>
      {cart.lines.length === 0 ? (
        <div className="py-20">
          <p className="display text-3xl">{B.empty}</p>
          <p className="mt-3 text-body text-ink/70">{B.emptyText}</p>
          <Link href={href("/new")} className="btn btn-solid mt-8">{B.continue}</Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-12">
          <ul className="divide-y divide-line border-y border-line lg:col-span-8">
            {cart.lines.map((l) => <LineItem key={l.id} line={l} />)}
          </ul>
          <aside className="lg:col-span-4">
            <div className="space-y-6 bg-sand p-6 lg:sticky lg:top-24">
              <CouponForm cart={cart} />
              <div className="border-t border-line pt-5"><Totals cart={cart} /></div>
              <CheckoutButton cart={cart} />
              <Link href={href("/new")} className="link-underline block text-center text-small">{B.continue}</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
