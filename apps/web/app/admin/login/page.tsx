"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, inputCls, Notice } from "@/components/admin/ui";
import { useAdmin, type AdminUser, type Permission } from "@/lib/admin/session";
import { api, ApiError } from "@/lib/store";

export default function AdminLogin() {
  const { user, ready, setSession } = useAdmin();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const dest = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(dest);
  }, [ready, user, router, dest]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: AdminUser; permissions: Permission[] }>("/api/admin/auth/login", { method: "POST", json: { email: f.get("email"), password: f.get("password") } });
      setSession(r.user, r.permissions);
      router.replace(dest);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 423 ? err.message : err instanceof ApiError && err.status === 429 ? "Too many attempts. Wait a few minutes." : "Incorrect e-mail or password.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm border border-line bg-white p-8" aria-labelledby="t">
        <p className="wordmark text-xl">MAREA</p>
        <h1 id="t" className="mt-6 text-lg">Staff sign-in</h1>
        <div className="mt-6 space-y-4">
          <Notice kind="error">{error}</Notice>
          <label className="block text-small">E-mail<input name="email" type="email" autoComplete="username" required className={`${inputCls} mt-1 h-11`} /></label>
          <label className="block text-small">Password<input name="password" type="password" autoComplete="current-password" required className={`${inputCls} mt-1 h-11`} /></label>
          <button type="submit" disabled={busy} className={`${btn.primary} h-11 w-full justify-center`}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
        <p className="mt-6 text-micro text-mute">Forgot your password? Use the store’s password reset with your staff e-mail.</p>
      </form>
    </main>
  );
}
