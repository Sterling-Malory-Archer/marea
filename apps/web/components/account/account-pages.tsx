"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { LOCALE_META, LOCALES } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-client";
import { api, ApiError, useStore } from "@/lib/store";
import type { Address, Customer } from "@/lib/types";
import { CheckField, Field, FormMessage, passwordProblem, SelectField } from "../forms";
import { AccountShell } from "./account-shell";

interface OrderSummary { orderNumber: string; placedAt: string; status: string; totalMinor: number; currency: string; itemCount: number }

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => {
    if (!path) return;
    api<T>(path).then(setData).catch(() => setError(true));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

const dateFmt = (iso: string, intl: string) => new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

function OrdersTable({ orders }: { orders: OrderSummary[] }) {
  const { t, href, intl } = useI18n();
  const A = t.account;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {orders.map((o) => (
        <li key={o.orderNumber}>
          <Link href={href(`/account/orders/${o.orderNumber}`)} className="grid grid-cols-2 gap-x-4 gap-y-1 py-4 text-small hover:bg-sand/50 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center sm:px-2">
            <span className="font-medium">{o.orderNumber}</span>
            <span className="text-right text-ink/70 sm:text-left">{dateFmt(o.placedAt, intl)}</span>
            <span>{A.orderStatus[o.status] ?? o.status}</span>
            <span className="text-right tabular-nums">{formatMoney(o.totalMinor, o.currency, intl)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NoOrders() {
  const { t, href } = useI18n();
  return (
    <div className="border border-line px-6 py-10">
      <p className="text-body">{t.account.noOrders}</p>
      <Link href={href("/new")} className="btn btn-outline mt-6">{t.account.startShopping}</Link>
    </div>
  );
}

export function AccountOverview() {
  const { t, href } = useI18n();
  const A = t.account;
  const { user } = useStore();
  const { data } = useLoad<{ items: OrderSummary[] }>(user ? "/api/account/orders" : null);
  return (
    <AccountShell title={user?.firstName ? A.hello(user.firstName) : A.title}>
      <section aria-labelledby="recent">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 id="recent" className="text-lead">{A.recentOrders}</h2>
          {data && data.items.length > 3 && <Link href={href("/account/orders")} className="link-underline text-small">{A.viewAll}</Link>}
        </div>
        {data && (data.items.length ? <OrdersTable orders={data.items.slice(0, 3)} /> : <NoOrders />)}
      </section>
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          ["/account/details", A.details, user?.email],
          ["/account/addresses", A.addresses, null],
          ["/wishlist", A.wishlist, null],
        ].map(([path, label, sub]) => (
          <Link key={path} href={href(path!)} className="border border-line p-5 transition-colors hover:border-ink">
            <p className="text-body">{label}</p>
            {sub && <p className="mt-1 truncate text-small text-mute">{sub}</p>}
          </Link>
        ))}
      </section>
    </AccountShell>
  );
}

export function AccountOrders() {
  const { t } = useI18n();
  const { user } = useStore();
  const { data } = useLoad<{ items: OrderSummary[] }>(user ? "/api/account/orders" : null);
  return <AccountShell title={t.account.orders}>{data && (data.items.length ? <OrdersTable orders={data.items} /> : <NoOrders />)}</AccountShell>;
}

interface OrderDetail {
  orderNumber: string; placedAt: string; status: string; paymentMethod: string; currency: string;
  subtotalMinor: number; discountMinor: number; shippingMinor: number; taxMinor: number; totalMinor: number; couponCode: string | null; shippingMethodName: string;
  shippingAddress: Partial<Address>;
  items: { id: number; productTitle: string; brandName: string | null; colorName: string; sizeLabel: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; sku: string }[];
  shipments: { carrier: string; trackingNumber: string | null; trackingUrl: string | null; status: string }[];
  events: { toStatus: string | null; message: string | null; createdAt: string }[];
}

export function AccountOrderDetail({ orderNumber }: { orderNumber: string }) {
  const { t, href, intl } = useI18n();
  const A = t.account;
  const { user } = useStore();
  const { data, error } = useLoad<OrderDetail>(user ? `/api/account/orders/${encodeURIComponent(orderNumber)}` : null);
  const money = (m: number) => formatMoney(m, data?.currency ?? "EUR", intl);
  return (
    <AccountShell title={`${A.order} ${orderNumber}`}>
      {error && <FormMessage kind="error">{t.errors.notFound}</FormMessage>}
      {data && (
        <div className="grid gap-10 xl:grid-cols-[1fr_18rem]">
          <div>
            <p className="text-small text-ink/70">{dateFmt(data.placedAt, intl)} — {A.orderStatus[data.status] ?? data.status}</p>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {data.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-4 text-small">
                  <div>
                    {i.brandName && <p className="text-micro text-mute">{i.brandName}</p>}
                    <p>{i.productTitle}</p>
                    <p className="text-ink/70">{i.colorName}, {i.sizeLabel} — {A.qty} {i.quantity}</p>
                  </div>
                  <p className="tabular-nums">{money(i.lineTotalMinor)}</p>
                </li>
              ))}
            </ul>
            {data.shipments.filter((s) => s.trackingUrl).map((s) => (
              <a key={s.trackingNumber} href={s.trackingUrl!} target="_blank" rel="noopener noreferrer" className="btn btn-outline mt-6">{A.tracking} — {s.carrier}</a>
            ))}
          </div>
          <aside className="space-y-8 text-small">
            <div className="space-y-2">
              <div className="flex justify-between"><span>{A.subtotal}</span><span className="tabular-nums">{money(data.subtotalMinor)}</span></div>
              {data.discountMinor > 0 && <div className="flex justify-between text-claret"><span>{A.discount}{data.couponCode ? ` (${data.couponCode})` : ""}</span><span className="tabular-nums">−{money(data.discountMinor)}</span></div>}
              <div className="flex justify-between"><span>{A.shipping}</span><span className="tabular-nums">{money(data.shippingMinor)}</span></div>
              <div className="flex justify-between border-t border-line pt-2 font-medium"><span>{A.total}</span><span className="tabular-nums">{money(data.totalMinor)}</span></div>
              <p className="text-micro text-mute">{A.vatIncluded(money(data.taxMinor))}</p>
            </div>
            <div>
              <h2 className="font-medium">{A.shippingAddress}</h2>
              <p className="mt-2 leading-6 text-ink/75">
                {[`${data.shippingAddress.firstName ?? ""} ${data.shippingAddress.lastName ?? ""}`.trim(), data.shippingAddress.line1, data.shippingAddress.line2, `${data.shippingAddress.postalCode ?? ""} ${data.shippingAddress.city ?? ""}`.trim(), data.shippingAddress.countryCode && (A.countries[data.shippingAddress.countryCode] ?? data.shippingAddress.countryCode)].filter(Boolean).map((l) => <span key={l} className="block">{l}</span>)}
              </p>
            </div>
            <div>
              <h2 className="font-medium">{A.payment}</h2>
              <p className="mt-2 text-ink/75">{A.payments[data.paymentMethod] ?? data.paymentMethod}</p>
            </div>
          </aside>
        </div>
      )}
      <Link href={href("/account/orders")} className="link-underline mt-10 inline-block text-small">{A.orders}</Link>
    </AccountShell>
  );
}

export function AccountDetails() {
  const { t } = useI18n();
  const A = t.account;
  const { user, setUser } = useStore();
  const [profileMsg, setProfileMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pwErrors, setPwErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<"profile" | "pw" | null>(null);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("profile");
    setProfileMsg(null);
    try {
      const { user: u } = await api<{ user: Customer }>("/api/account/profile", {
        method: "PATCH",
        json: { firstName: String(f.get("firstName")).trim(), lastName: String(f.get("lastName")).trim(), phone: String(f.get("phone") ?? "").trim() || null, locale: f.get("locale"), marketingOptIn: f.get("marketing") === "on" },
      });
      setUser(u);
      setProfileMsg({ kind: "success", text: A.saved });
    } catch {
      setProfileMsg({ kind: "error", text: t.auth.errors.generic });
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const current = String(f.get("current") ?? ""), next = String(f.get("next") ?? "");
    const errs = { current: current ? null : t.auth.errors.required, next: passwordProblem(next, t.auth.errors) };
    setPwErrors(errs);
    setPwMsg(null);
    if (Object.values(errs).some(Boolean)) return;
    setBusy("pw");
    try {
      await api("/api/account/password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      form.reset();
      setPwMsg({ kind: "success", text: A.passwordChanged });
    } catch (err) {
      if (err instanceof ApiError && err.details?.field === "currentPassword") setPwErrors({ current: t.auth.errors.currentPassword });
      else setPwMsg({ kind: "error", text: t.auth.errors.generic });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AccountShell title={A.details}>
      {user && (
        <div className="grid gap-14 xl:grid-cols-2">
          <form onSubmit={saveProfile} noValidate className="space-y-5">
            <h2 className="text-lead">{A.profile}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.auth.firstName} name="firstName" defaultValue={user.firstName ?? ""} autoComplete="given-name" required />
              <Field label={t.auth.lastName} name="lastName" defaultValue={user.lastName ?? ""} autoComplete="family-name" required />
            </div>
            <Field label={t.auth.email} value={user.email} readOnly disabled />
            <Field label={A.phone} name="phone" type="tel" defaultValue={user.phone ?? ""} autoComplete="tel" />
            <SelectField label={A.language} name="locale" defaultValue={user.locale}>
              {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_META[l].label}</option>)}
            </SelectField>
            <CheckField name="marketing" defaultChecked={user.marketingOptIn} label={t.auth.marketing} />
            <FormMessage kind={profileMsg?.kind ?? "success"}>{profileMsg?.text}</FormMessage>
            <button type="submit" disabled={busy === "profile"} className="btn btn-solid">{busy === "profile" ? A.saving : A.save}</button>
          </form>

          <form onSubmit={changePassword} noValidate className="space-y-5">
            <h2 className="text-lead">{A.changePassword}</h2>
            <Field label={A.currentPassword} name="current" type="password" autoComplete="current-password" error={pwErrors.current} />
            <Field label={t.auth.newPassword} name="next" type="password" autoComplete="new-password" hint={t.auth.passwordHint} error={pwErrors.next} />
            <FormMessage kind={pwMsg?.kind ?? "success"}>{pwMsg?.text}</FormMessage>
            <button type="submit" disabled={busy === "pw"} className="btn btn-outline">{A.changePassword}</button>
          </form>
        </div>
      )}
      <AccountDangerLink />
    </AccountShell>
  );
}

function AccountDangerLink() {
  const { t, href } = useI18n();
  return (
    <div className="mt-16 border-t border-line pt-6">
      <Link href={href("/account/delete")} className="text-small text-mute underline underline-offset-2 hover:text-claret">{t.account.delete}</Link>
    </div>
  );
}

const COUNTRIES = ["ME", "RS", "BA", "HR", "AL", "MK", "XK", "SI"];

function AddressForm({ initial, onSaved, onCancel }: { initial?: Address; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const A = t.account;
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const required = ["firstName", "lastName", "line1", "city", "postalCode", "phone"];
    const errs = Object.fromEntries(required.map((k) => [k, v(k) ? null : t.auth.errors.required]));
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setFormError(null);
    const body = { label: v("label") || null, firstName: v("firstName"), lastName: v("lastName"), company: v("company") || null, line1: v("line1"), line2: v("line2") || null, city: v("city"), postalCode: v("postalCode"), countryCode: v("countryCode"), phone: v("phone"), isDefaultShipping: f.get("isDefaultShipping") === "on" || undefined };
    try {
      await api(initial ? `/api/account/addresses/${initial.id}` : "/api/account/addresses", { method: initial ? "PATCH" : "POST", json: body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.length) setErrors(Object.fromEntries(err.fields.map((fl) => [fl.path, t.auth.errors.required])));
      else setFormError(t.auth.errors.generic);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 border border-line p-5 sm:p-6">
      <h2 className="text-lead">{initial ? A.editAddress : A.addAddress}</h2>
      <FormMessage kind="error">{formError}</FormMessage>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t.auth.firstName} name="firstName" defaultValue={initial?.firstName} autoComplete="given-name" error={errors.firstName} />
        <Field label={t.auth.lastName} name="lastName" defaultValue={initial?.lastName} autoComplete="family-name" error={errors.lastName} />
      </div>
      <Field label={A.company} name="company" defaultValue={initial?.company ?? ""} autoComplete="organization" />
      <Field label={A.line1} name="line1" defaultValue={initial?.line1} autoComplete="address-line1" error={errors.line1} />
      <Field label={A.line2} name="line2" defaultValue={initial?.line2 ?? ""} autoComplete="address-line2" />
      <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
        <Field label={A.city} name="city" defaultValue={initial?.city} autoComplete="address-level2" error={errors.city} />
        <Field label={A.postalCode} name="postalCode" defaultValue={initial?.postalCode} autoComplete="postal-code" inputMode="numeric" error={errors.postalCode} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label={A.country} name="countryCode" defaultValue={initial?.countryCode ?? "ME"} autoComplete="country">
          {COUNTRIES.map((c) => <option key={c} value={c}>{A.countries[c]}</option>)}
        </SelectField>
        <Field label={A.phone} name="phone" type="tel" defaultValue={initial?.phone ?? ""} autoComplete="tel" error={errors.phone} />
      </div>
      <Field label={A.label} name="label" defaultValue={initial?.label ?? ""} />
      {!initial?.isDefaultShipping && <CheckField name="isDefaultShipping" label={A.defaultShipping} />}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn btn-solid">{A.saveAddress}</button>
        <button type="button" onClick={onCancel} className="btn btn-outline">{A.cancel}</button>
      </div>
    </form>
  );
}

export function AccountAddresses() {
  const { t } = useI18n();
  const A = t.account;
  const { user } = useStore();
  const { data, reload } = useLoad<{ items: Address[] }>(user ? "/api/account/addresses" : null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  const remove = async (a: Address) => {
    if (!window.confirm(A.confirmRemove)) return;
    await api(`/api/account/addresses/${a.id}`, { method: "DELETE" }).catch(() => undefined);
    reload();
  };
  const makeDefault = async (a: Address) => {
    await api(`/api/account/addresses/${a.id}`, { method: "PATCH", json: { isDefaultShipping: true } }).catch(() => undefined);
    reload();
  };

  return (
    <AccountShell title={A.addresses}>
      {editing ? (
        <AddressForm initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      ) : (
        <>
          {data && data.items.length === 0 && <p className="mb-6 text-body text-ink/70">{A.noAddresses}</p>}
          <ul className="grid gap-4 md:grid-cols-2">
            {data?.items.map((a) => (
              <li key={a.id} className="flex flex-col border border-line p-5">
                {a.label && <p className="text-small font-medium">{a.label}</p>}
                <address className="mt-1 text-small not-italic leading-6 text-ink/80">
                  {a.firstName} {a.lastName}<br />
                  {a.company && <>{a.company}<br /></>}
                  {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                  {a.postalCode} {a.city}<br />
                  {A.countries[a.countryCode] ?? a.countryCode}<br />
                  {a.phone}
                </address>
                {a.isDefaultShipping && <p className="mt-3 text-micro text-mute">{A.defaultShipping}</p>}
                <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5 text-small">
                  <button type="button" className="link-underline" onClick={() => setEditing(a)}>{A.edit}</button>
                  {!a.isDefaultShipping && <button type="button" className="link-underline" onClick={() => makeDefault(a)}>{A.makeDefault}</button>}
                  <button type="button" className="link-underline text-mute" onClick={() => remove(a)}>{A.remove}</button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setEditing("new")} className="btn btn-outline mt-6">{A.addAddress}</button>
        </>
      )}
    </AccountShell>
  );
}

export function AccountDelete() {
  const { t, href } = useI18n();
  const A = t.account;
  const { setUser } = useStore();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!password) return setError(t.auth.errors.required);
    setBusy(true);
    try {
      await api("/api/account/delete-request", { method: "POST", json: { password } });
      setDone(true);
      setUser(null);
      setTimeout(() => router.push(href("/")), 4000);
    } catch (err) {
      setError(err instanceof ApiError && err.details?.field === "password" ? t.auth.errors.currentPassword : t.auth.errors.generic);
      setBusy(false);
    }
  }

  if (done) return <div className="shell py-24"><FormMessage kind="success">{A.deleteDone}</FormMessage></div>;
  return (
    <AccountShell title={A.deleteTitle}>
      <form onSubmit={submit} noValidate className="max-w-[34rem] space-y-6">
        <p className="text-body leading-7 text-ink/80">{A.deleteText}</p>
        <Field label={A.deleteConfirm} name="password" type="password" autoComplete="current-password" error={error} />
        <button type="submit" disabled={busy} className="btn border-claret bg-claret text-white hover:bg-ink hover:border-ink">{A.deleteButton}</button>
      </form>
    </AccountShell>
  );
}
