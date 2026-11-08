"use client";

import Link from "next/link";
import { useId, useState } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

export function Newsletter({ storeName }: { storeName: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const emailId = useId();
  const consentId = useId();
  const statusId = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const consent = form.get("consent") === "on";
    if (!/^\S+@\S+\.\S+$/.test(email)) return setState({ kind: "error", message: "Enter a valid e-mail address." });
    if (!consent) return setState({ kind: "error", message: "Tick the box to confirm you'd like our e-mails." });

    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/store/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent: true, source: "footer" }),
      });
      if (res.ok) return setState({ kind: "done" });
      const body = await res.json().catch(() => null);
      setState({
        kind: "error",
        message: res.status === 429 ? "Too many attempts. Try again in a little while." : body?.error?.fields?.[0]?.message ?? "We couldn't sign you up. Try again.",
      });
    } catch {
      setState({ kind: "error", message: "No connection. Check your internet and try again." });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-6">
        <h2 className="display text-[clamp(2rem,3.4vw,3rem)]">Letters from {storeName}</h2>
        <p className="mt-3 max-w-[30rem] text-body text-ink/70">
          New arrivals, private sales and the occasional story. One e-mail a fortnight, at most.
        </p>
      </div>

      {state.kind === "done" ? (
        <p role="status" className="text-body lg:col-span-6">
          You&rsquo;re subscribed. Look out for our next letter.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="lg:col-span-6" aria-describedby={statusId}>
          <div className="flex border-b border-ink">
            <label htmlFor={emailId} className="sr-only">E-mail address</label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Your e-mail address"
              className="min-h-12 flex-1 bg-transparent text-body placeholder:text-mute focus:outline-none"
              aria-invalid={state.kind === "error"}
            />
            <button type="submit" className="min-h-12 pl-4 text-small font-medium disabled:opacity-50" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? "Subscribing…" : "Subscribe"}
            </button>
          </div>
          <div className="mt-4 flex items-start gap-3">
            <input id={consentId} name="consent" type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-ink" />
            <label htmlFor={consentId} className="text-micro leading-5 text-mute sm:text-small">
              I agree to receive {storeName} news and offers by e-mail. You can unsubscribe at any time. Read our{" "}
              <Link href="/help/privacy" className="underline underline-offset-2 hover:text-ink">privacy policy</Link>.
            </label>
          </div>
          <p id={statusId} role="alert" className="mt-3 min-h-5 text-small text-claret">
            {state.kind === "error" ? state.message : ""}
          </p>
        </form>
      )}
    </div>
  );
}
