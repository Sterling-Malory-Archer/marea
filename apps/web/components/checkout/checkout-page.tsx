"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import { api, ApiError, useStore } from "@/lib/store";
import type { Address, Cart } from "@/lib/types";
import { Totals } from "../bag/bag-lines";
import { CheckField, Field, FormMessage, isEmail, SelectField } from "../forms";

interface Quote {
  countries: string[];
  country: string;
  cart: Cart | null;
  shippingMethods: { code: string; name: string; priceMinor: number; basePriceMinor: number; freeOverMinor: number | null; minDays: number | null; maxDays: number | null; allowsCashOnDelivery: boolean }[];
  selectedMethod: string | null;
  paymentMethods: { method: "CASH_ON_DELIVERY" | "CARD" }[];
}

type Step = 1 | 2 | 3 | 4 | 5;
type Addr = { firstName: string; lastName: string; company: string; line1: string; line2: string; city: string; postalCode: string; countryCode: string };
const emptyAddr: Addr = { firstName: "", lastName: "", company: "", line1: "", line2: "", city: "", postalCode: "", countryCode: "ME" };

function Section({ n, title, step, done, summary, onEdit, children }: { n: Step; title: string; step: Step; done: boolean; summary?: React.ReactNode; onEdit: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  const active = step === n;
  return (
    <section aria-labelledby={`step-${n}`} className="border-t border-line py-7 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`step-${n}`} className={`flex items-baseline gap-3 text-lead ${!active && !done ? "text-mute" : ""}`}>
          <span className="font-display text-small tabular-nums text-mute" aria-hidden>{n}</span>
          {title}
          <span className="sr-only">— {t.checkout.step(n, 5)}</span>
        </h2>
        {done && !active && <button type="button" onClick={onEdit} className="link-underline text-small">{t.checkout.edit}</button>}
      </div>
      {active ? <div className="mt-6">{children}</div> : done && summary ? <div className="mt-3 pl-7 text-small leading-6 text-ink/75">{summary}</div> : null}
    </section>
  );
}

export function CheckoutPage() {
  const { t, href, intl, locale } = useI18n();
  const C = t.checkout;
  const A = t.account;
  const E = t.auth.errors;
  const router = useRouter();
  const { ready, user, cart, refreshCart } = useStore();
  const money = (m: number) => formatMoney(m, cart?.currency ?? "EUR", intl);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const [step, setStep] = useState<Step>(1);
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [addr, setAddr] = useState<Addr>(emptyAddr);
  const [saved, setSaved] = useState<Address[]>([]);
  const [savedChoice, setSavedChoice] = useState<number | "new">("new");
  const [saveAddress, setSaveAddress] = useState(true);
  const [method, setMethod] = useState<string | null>(null);
  const [payment, setPayment] = useState<"CASH_ON_DELIVERY" | "CARD" | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [note, setNote] = useState("");

  // Prefill from the account.
  useEffect(() => {
    if (!user) return;
    setContact((c) => ({ email: user.email, phone: c.phone || user.phone || "" }));
    // Pre-fill the recipient's name for a first delivery address.
    setAddr((a) => ({ ...a, firstName: a.firstName || user.firstName || "", lastName: a.lastName || user.lastName || "" }));
    api<{ items: Address[] }>("/api/account/addresses").then(({ items }) => {
      setSaved(items);
      const def = items.find((a) => a.isDefaultShipping) ?? items[0];
      if (def) {
        setSavedChoice(def.id);
        setAddr({ firstName: def.firstName, lastName: def.lastName, company: def.company ?? "", line1: def.line1, line2: def.line2 ?? "", city: def.city, postalCode: def.postalCode, countryCode: def.countryCode });
        if (def.phone) setContact((c) => ({ ...c, phone: c.phone || def.phone! }));
      }
    }).catch(() => undefined);
  }, [user]);

  const loadQuote = useCallback(async (country: string, m: string | null, email: string) => {
    const qs = new URLSearchParams({ country, locale, ...(m ? { method: m } : {}), ...(isEmail(email) ? { email } : {}) });
    const q = await api<Quote>(`/api/checkout/quote?${qs}`);
    setQuote(q);
    setMethod(q.selectedMethod);
    setPayment((p) => (p && q.paymentMethods.some((x) => x.method === p) ? p : q.paymentMethods[0]?.method ?? null));
    return q;
  }, [locale]);

  useEffect(() => {
    if (ready) void loadQuote(addr.countryCode, method, contact.email).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, addr.countryCode]);

  const live = quote?.cart ?? cart;

  // ── Step handlers ──
  function submitContact(e: React.FormEvent) {
    e.preventDefault();
    const errs = { email: !contact.email ? E.required : !isEmail(contact.email) ? E.email : null, phone: contact.phone.replace(/\D/g, "").length < 6 ? E.required : null };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    void loadQuote(addr.countryCode, method, contact.email);
    setStep(2);
  }

  function submitAddress(e: React.FormEvent) {
    e.preventDefault();
    const req: (keyof Addr)[] = ["firstName", "lastName", "line1", "city", "postalCode"];
    const errs = Object.fromEntries(req.map((k) => [k, addr[k].trim() ? null : E.required]));
    if (addr.postalCode && !/^[A-Za-z0-9 -]{3,20}$/.test(addr.postalCode.trim())) errs.postalCode = E.required;
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setStep(3);
  }

  async function chooseMethod(code: string) {
    setMethod(code);
    await loadQuote(addr.countryCode, code, contact.email).catch(() => undefined);
  }

  async function place() {
    if (!terms) return setErrors({ terms: C.termsError });
    if (!quote?.cart || !method || !payment) return;
    setPlacing(true);
    setFormError(null);
    try {
      const res = await api<{ orderNumber: string; accessToken: string | null }>("/api/checkout/orders", {
        method: "POST",
        json: {
          idempotencyKey: idempotencyKey.current,
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          shippingAddress: { ...addr, company: addr.company || null, line2: addr.line2 || null, phone: contact.phone.trim() },
          shippingMethodCode: method,
          paymentMethod: payment,
          customerNote: note || null,
          saveAddress: !!user && savedChoice === "new" && saveAddress,
          acceptTerms: true,
          expectedTotalMinor: quote.cart.totalMinor,
          locale,
        },
      });
      await refreshCart().catch(() => undefined);
      router.push(`${href(`/checkout/confirmation/${res.orderNumber}`)}${res.accessToken ? `?token=${encodeURIComponent(res.accessToken)}` : ""}`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code ?? "" : "";
      setFormError((code.startsWith("COUPON") ? C.errors.COUPON : C.errors[code]) ?? C.errors.generic ?? null);
      // Refresh totals so the buyer sees exactly what would be charged now.
      await loadQuote(addr.countryCode, method, contact.email).catch(() => undefined);
      if (code === "OUT_OF_STOCK" || code === "CART_ISSUES") await refreshCart().catch(() => undefined);
      idempotencyKey.current = crypto.randomUUID();
      setPlacing(false);
    }
  }

  const methodLabel = (code: string, fallback: string) => t.product.methods[code] ?? fallback;
  const selected = quote?.shippingMethods.find((m) => m.code === method);
  const days = (m: { minDays: number | null; maxDays: number | null }) => (m.minDays != null && m.maxDays != null ? t.product.days(m.minDays, m.maxDays) : "");

  const summaryLines = useMemo(() => live?.lines ?? [], [live]);

  if (!ready) return <div className="shell min-h-[60svh] py-24" aria-busy="true" />;
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="shell py-24">
        <h1 className="display text-4xl">{C.empty}</h1>
        <Link href={href("/new")} className="btn btn-solid mt-8">{t.bag.continue}</Link>
      </div>
    );
  }

  return (
    <div className="shell pb-24 pt-10 lg:pt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="display text-[clamp(2.25rem,5vw,4rem)]">{C.title}</h1>
        <Link href={href("/bag")} className="link-underline text-small">{C.backToBag}</Link>
      </div>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {/* 1. Contact */}
          <Section n={1} title={C.contact} step={step} done={step > 1} onEdit={() => setStep(1)} summary={<>{contact.email}<br />{contact.phone}</>}>
            <form onSubmit={submitContact} noValidate className="space-y-5">
              {!user && (
                <p className="text-small text-ink/70">
                  {C.signInPrompt} <Link href={`${href("/account/login")}?next=/checkout`} className="link-underline">{C.signInLink}</Link>
                </p>
              )}
              <Field label={t.auth.email} type="email" autoComplete="email" value={contact.email} readOnly={!!user} onChange={(e) => setContact({ ...contact, email: e.target.value })} hint={C.contactNote} error={errors.email} />
              <Field label={A.phone} type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} error={errors.phone} />
              <button type="submit" className="btn btn-solid">{C.continue}</button>
            </form>
          </Section>

          {/* 2. Address */}
          <Section
            n={2}
            title={C.address}
            step={step}
            done={step > 2}
            onEdit={() => setStep(2)}
            summary={<>{addr.firstName} {addr.lastName}<br />{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />{addr.postalCode} {addr.city}, {A.countries[addr.countryCode] ?? addr.countryCode}</>}
          >
            <form onSubmit={submitAddress} noValidate className="space-y-5">
              {saved.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-small">{C.useSaved}</legend>
                  {saved.map((a) => (
                    <label key={a.id} className={`flex cursor-pointer gap-3 border p-4 text-small ${savedChoice === a.id ? "border-ink" : "border-line"}`}>
                      <input
                        type="radio"
                        name="saved"
                        checked={savedChoice === a.id}
                        onChange={() => {
                          setSavedChoice(a.id);
                          setAddr({ firstName: a.firstName, lastName: a.lastName, company: a.company ?? "", line1: a.line1, line2: a.line2 ?? "", city: a.city, postalCode: a.postalCode, countryCode: a.countryCode });
                        }}
                        className="mt-1 accent-ink"
                      />
                      <span>{a.firstName} {a.lastName}, {a.line1}, {a.postalCode} {a.city}, {A.countries[a.countryCode] ?? a.countryCode}</span>
                    </label>
                  ))}
                  <label className={`flex cursor-pointer gap-3 border p-4 text-small ${savedChoice === "new" ? "border-ink" : "border-line"}`}>
                    <input type="radio" name="saved" checked={savedChoice === "new"} onChange={() => { setSavedChoice("new"); setAddr({ ...emptyAddr, firstName: user?.firstName ?? "", lastName: user?.lastName ?? "" }); }} className="mt-1 accent-ink" />
                    <span>{C.newAddress}</span>
                  </label>
                </fieldset>
              )}
              {savedChoice === "new" && (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.auth.firstName} autoComplete="given-name" value={addr.firstName} onChange={(e) => setAddr({ ...addr, firstName: e.target.value })} error={errors.firstName} />
                    <Field label={t.auth.lastName} autoComplete="family-name" value={addr.lastName} onChange={(e) => setAddr({ ...addr, lastName: e.target.value })} error={errors.lastName} />
                  </div>
                  <Field label={A.company} autoComplete="organization" value={addr.company} onChange={(e) => setAddr({ ...addr, company: e.target.value })} />
                  <Field label={A.line1} autoComplete="address-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} error={errors.line1} />
                  <Field label={A.line2} autoComplete="address-line2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
                  <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
                    <Field label={A.city} autoComplete="address-level2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} error={errors.city} />
                    <Field label={A.postalCode} autoComplete="postal-code" inputMode="numeric" value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} error={errors.postalCode} />
                  </div>
                  <SelectField label={A.country} autoComplete="country" value={addr.countryCode} onChange={(e) => setAddr({ ...addr, countryCode: e.target.value })}>
                    {(quote?.countries ?? ["ME"]).map((c) => <option key={c} value={c}>{A.countries[c] ?? c}</option>)}
                  </SelectField>
                  {user && <CheckField label={C.saveAddress} checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />}
                </>
              )}
              <button type="submit" className="btn btn-solid">{C.continue}</button>
            </form>
          </Section>

          {/* 3. Delivery */}
          <Section n={3} title={C.delivery} step={step} done={step > 3} onEdit={() => setStep(3)} summary={selected && <>{methodLabel(selected.code, selected.name)} — {selected.priceMinor === 0 ? t.bag.free : money(selected.priceMinor)}</>}>
            {quote && quote.shippingMethods.length === 0 ? (
              <FormMessage kind="error">{C.noDelivery}</FormMessage>
            ) : (
              <div className="space-y-5">
                <fieldset className="space-y-2">
                  <legend className="sr-only">{C.delivery}</legend>
                  {quote?.shippingMethods.map((m) => (
                    <label key={m.code} className={`flex cursor-pointer items-start gap-3 border p-4 text-small ${method === m.code ? "border-ink" : "border-line"}`}>
                      <input type="radio" name="method" checked={method === m.code} onChange={() => chooseMethod(m.code)} className="mt-1 accent-ink" />
                      <span className="flex-1">
                        <span className="block">{methodLabel(m.code, m.name)}</span>
                        <span className="block text-ink/65">{days(m)}{m.freeOverMinor != null && m.priceMinor > 0 ? ` — ${t.product.freeOver(money(m.freeOverMinor))}` : ""}</span>
                      </span>
                      <span className="tabular-nums">{m.priceMinor === 0 ? t.bag.free : money(m.priceMinor)}</span>
                    </label>
                  ))}
                </fieldset>
                <button type="button" disabled={!method} onClick={() => setStep(4)} className="btn btn-solid">{C.continue}</button>
              </div>
            )}
          </Section>

          {/* 4. Payment */}
          <Section n={4} title={C.payment} step={step} done={step > 4} onEdit={() => setStep(4)} summary={payment === "CASH_ON_DELIVERY" ? C.cod : payment}>
            {quote && quote.paymentMethods.length === 0 ? (
              <FormMessage kind="error">{C.noPayment}</FormMessage>
            ) : (
              <div className="space-y-5">
                <fieldset className="space-y-2">
                  <legend className="sr-only">{C.payment}</legend>
                  {quote?.paymentMethods.map((p) => (
                    <label key={p.method} className={`flex cursor-pointer items-start gap-3 border p-4 text-small ${payment === p.method ? "border-ink" : "border-line"}`}>
                      <input type="radio" name="payment" checked={payment === p.method} onChange={() => setPayment(p.method)} className="mt-1 accent-ink" />
                      <span>
                        <span className="block">{p.method === "CASH_ON_DELIVERY" ? C.cod : p.method}</span>
                        {p.method === "CASH_ON_DELIVERY" && <span className="block text-ink/65">{C.codNote}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <button type="button" disabled={!payment} onClick={() => setStep(5)} className="btn btn-solid">{C.continue}</button>
              </div>
            )}
          </Section>

          {/* 5. Review */}
          <Section n={5} title={C.review} step={step} done={false} onEdit={() => setStep(5)}>
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-small">{C.note}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} className="block w-full border border-line bg-paper p-3 text-body focus:border-ink focus:outline-none" />
              </label>
              <CheckField
                checked={terms}
                onChange={(e) => { setTerms(e.target.checked); setErrors({}); }}
                error={errors.terms}
                label={<>{C.terms} <Link href={href("/help/terms")} className="underline underline-offset-2">{C.termsLink}</Link>.</>}
              />
              <FormMessage kind="error">{formError}</FormMessage>
              <button type="button" onClick={place} disabled={placing || !quote?.cart?.canCheckout || !payment} aria-busy={placing} className="btn btn-solid h-13 w-full sm:w-auto sm:min-w-72">
                {placing ? C.placing : C.payNow(money(quote?.cart?.totalMinor ?? 0))}
              </button>
              {quote?.cart && !quote.cart.canCheckout && <FormMessage kind="error">{C.errors.CART_ISSUES} <Link href={href("/bag")} className="underline">{C.backToBag}</Link></FormMessage>}
            </div>
          </Section>
        </div>

        <aside className="lg:col-span-5" aria-label={C.summary}>
          <div className="bg-sand p-6 lg:sticky lg:top-24">
            <h2 className="text-lead">{C.summary}</h2>
            <details className="mt-4 lg:open:block" open>
              <summary className="cursor-pointer text-small text-ink/70 lg:hidden">{C.showItems(live?.itemCount ?? 0)}</summary>
              <ul className="mt-3 divide-y divide-line">
                {summaryLines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-4 py-3 text-small">
                    <span>
                      {l.title}
                      <span className="block text-ink/65">{l.color.name}, {l.size === "ONE SIZE" ? t.product.oneSize : l.size} × {l.quantity}</span>
                    </span>
                    <span className="tabular-nums">{money(l.lineTotalMinor)}</span>
                  </li>
                ))}
              </ul>
            </details>
            {live && <div className="mt-4 border-t border-line pt-4"><Totals cart={live} exactDelivery={step >= 3} /></div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
