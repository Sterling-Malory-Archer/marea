"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n-client";
import { api, ApiError, useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";
import { CheckField, Field, FormMessage, isEmail, passwordProblem } from "../forms";

type Errors = Record<string, string | null>;

function useAuthErrors() {
  const { t } = useI18n();
  const E = t.auth.errors;
  return (e: unknown): string => {
    if (!(e instanceof ApiError)) return E.generic;
    if (e.status === 429) return E.rate;
    if (e.status === 423) return E.locked;
    if (e.status === 409) return E.exists;
    if (e.status === 401) return E.invalid;
    if (e.status === 422 && e.message.includes("link")) return E.linkInvalid;
    return E.generic;
  };
}

/** Only allow same-site relative paths as post-login destinations. */
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : null);

function AuthFrame({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="shell grid gap-14 pb-24 pt-12 lg:grid-cols-12 lg:pt-20">
      <div className="lg:col-span-5">
        <h1 className="display text-[clamp(2.25rem,5vw,3.75rem)]">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
      {aside && <aside className="lg:col-span-5 lg:col-start-8 lg:border-l lg:border-line lg:pl-14">{aside}</aside>}
    </div>
  );
}

export function LoginForm() {
  const { t, href } = useI18n();
  const A = t.auth;
  const { setUser, user, ready } = useStore();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const toMessage = useAuthErrors();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dest = href(next ?? "/account");

  useEffect(() => {
    if (ready && user) router.replace(dest);
  }, [ready, user, router, dest]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? ""), password = String(f.get("password") ?? "");
    const errs: Errors = { email: !email ? A.errors.required : !isEmail(email) ? A.errors.email : null, password: password ? null : A.errors.required };
    setErrors(errs);
    setFormError(null);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const { user: u } = await api<{ user: Customer }>("/api/auth/login", { method: "POST", json: { email, password } });
      setUser(u);
      router.push(dest);
    } catch (err) {
      setFormError(toMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={A.signInTitle}
      aside={
        <div>
          <h2 className="display text-3xl">{A.newHere}</h2>
          <p className="mt-4 max-w-[28rem] text-body text-ink/70">{A.newHereText}</p>
          <Link href={`${href("/account/register")}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn btn-outline mt-8">{A.create}</Link>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormMessage kind="error">{formError}</FormMessage>
        <Field label={A.email} name="email" type="email" autoComplete="email" required error={errors.email} />
        <Field label={A.password} name="password" type="password" autoComplete="current-password" required error={errors.password} />
        <div className="flex items-center justify-between gap-4 pt-2">
          <button type="submit" disabled={busy} className="btn btn-solid min-w-40">{busy ? A.signingIn : A.signIn}</button>
          <Link href={href("/account/forgot-password")} className="link-underline text-small">{A.forgot}</Link>
        </div>
      </form>
    </AuthFrame>
  );
}

export function RegisterForm() {
  const { t, href, locale } = useI18n();
  const A = t.auth;
  const { setUser } = useStore();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const toMessage = useAuthErrors();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const password = String(f.get("password") ?? "");
    const errs: Errors = {
      firstName: v("firstName") ? null : A.errors.required,
      lastName: v("lastName") ? null : A.errors.required,
      email: !v("email") ? A.errors.required : !isEmail(v("email")) ? A.errors.email : null,
      password: passwordProblem(password, A.errors),
      acceptTerms: f.get("acceptTerms") === "on" ? null : A.errors.terms,
    };
    setErrors(errs);
    setFormError(null);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      const { user } = await api<{ user: Customer }>("/api/auth/register", {
        method: "POST",
        json: { firstName: v("firstName"), lastName: v("lastName"), email: v("email"), password, marketingOptIn: f.get("marketing") === "on", acceptTerms: true, locale },
      });
      setUser(user);
      router.push(href(next ?? "/account"));
    } catch (err) {
      setFormError(toMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title={A.registerTitle}
      aside={
        <div>
          <h2 className="display text-3xl">{A.haveAccount}</h2>
          <Link href={href("/account/login")} className="btn btn-outline mt-8">{A.signIn}</Link>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <FormMessage kind="error">{formError}</FormMessage>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={A.firstName} name="firstName" autoComplete="given-name" required error={errors.firstName} />
          <Field label={A.lastName} name="lastName" autoComplete="family-name" required error={errors.lastName} />
        </div>
        <Field label={A.email} name="email" type="email" autoComplete="email" required error={errors.email} />
        <Field label={A.password} name="password" type="password" autoComplete="new-password" required hint={A.passwordHint} error={errors.password} />
        <CheckField name="marketing" label={A.marketing} />
        <CheckField
          name="acceptTerms"
          error={errors.acceptTerms}
          label={
            <>
              {A.terms} <Link href={href("/help/terms")} className="underline underline-offset-2">{A.termsLink}</Link> {A.and}{" "}
              <Link href={href("/help/privacy")} className="underline underline-offset-2">{A.privacyLink}</Link>.
            </>
          }
        />
        <button type="submit" disabled={busy} className="btn btn-solid min-w-48">{busy ? A.creating : A.create}</button>
      </form>
    </AuthFrame>
  );
}

export function ForgotPasswordForm() {
  const { t, href, locale } = useI18n();
  const A = t.auth;
  const toMessage = useAuthErrors();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!isEmail(email)) return setError(A.errors.email);
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password/forgot", { method: "POST", json: { email, locale } });
      setDone(true);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={A.forgotTitle}>
      {done ? (
        <div className="space-y-8">
          <FormMessage kind="success">{A.forgotDone}</FormMessage>
          <Link href={href("/account/login")} className="link-underline text-small">{A.backToSignIn}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <p className="text-body text-ink/70">{A.forgotText}</p>
          <Field label={A.email} name="email" type="email" autoComplete="email" required error={error} />
          <div className="flex items-center justify-between gap-4 pt-2">
            <button type="submit" disabled={busy} className="btn btn-solid">{busy ? A.sending : A.sendLink}</button>
            <Link href={href("/account/login")} className="link-underline text-small">{A.backToSignIn}</Link>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t, href } = useI18n();
  const A = t.auth;
  const toMessage = useAuthErrors();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(token ? null : A.errors.linkInvalid);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
    const errs: Errors = { password: passwordProblem(password, A.errors), confirm: password === confirm ? null : A.errors.mismatch };
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    try {
      await api("/api/auth/password/reset", { method: "POST", json: { token, password } });
      setDone(true);
    } catch (err) {
      setFormError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={A.resetTitle}>
      {done ? (
        <div className="space-y-8">
          <FormMessage kind="success">{A.resetDone}</FormMessage>
          <Link href={href("/account/login")} className="btn btn-solid">{A.signIn}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          <FormMessage kind="error">{formError}</FormMessage>
          <Field label={A.newPassword} name="password" type="password" autoComplete="new-password" hint={A.passwordHint} error={errors.password} />
          <Field label={A.confirmPassword} name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
          <button type="submit" disabled={busy || !token} className="btn btn-solid">{A.savePassword}</button>
        </form>
      )}
    </AuthFrame>
  );
}

export function VerifyEmail({ token }: { token: string }) {
  const { t, href } = useI18n();
  const A = t.auth;
  const { user, setUser } = useStore();
  const [state, setState] = useState<"working" | "ok" | "fail">(token ? "working" : "fail");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api("/api/auth/verify-email", { method: "POST", json: { token } })
      .then(() => setState("ok"))
      .catch(() => setState("fail"));
  }, [token]);

  useEffect(() => {
    if (state === "ok" && user && !user.emailVerified) setUser({ ...user, emailVerified: true });
  }, [state, user, setUser]);

  return (
    <AuthFrame title={A.verifyTitle}>
      <div aria-live="polite" className="space-y-8">
        {state === "working" && <p className="text-body text-mute">…</p>}
        {state === "ok" && <FormMessage kind="success">{A.verifyOk}</FormMessage>}
        {state === "fail" && <FormMessage kind="error">{A.verifyFail}</FormMessage>}
        {state !== "working" && <Link href={href(user ? "/account" : "/account/login")} className="btn btn-outline">{user ? t.account.title : A.signIn}</Link>}
      </div>
    </AuthFrame>
  );
}
