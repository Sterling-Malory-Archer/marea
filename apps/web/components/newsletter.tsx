"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n-client";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

export function Newsletter({ storeName }: { storeName: string }) {
  const { t, href, locale } = useI18n();
  const m = t.newsletter;
  const [state, setState] = useState<State>({ kind: "idle" });
  const emailId = useId();
  const consentId = useId();
  const statusId = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setState({ kind: "error", message: m.invalid });
    if (form.get("consent") !== "on") return setState({ kind: "error", message: m.needConsent });

    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/store/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent: true, source: "footer", locale }),
      });
      if (res.ok) return setState({ kind: "done" });
      setState({ kind: "error", message: res.status === 429 ? m.rate : res.status === 422 ? m.invalid : m.failed });
    } catch {
      setState({ kind: "error", message: m.offline });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-6">
        <h2 className="display text-[clamp(2rem,3.4vw,3rem)]">{m.title(storeName)}</h2>
        <p className="mt-3 max-w-[30rem] text-body text-ink/70">{m.intro}</p>
      </div>

      {state.kind === "done" ? (
        <p role="status" className="text-body lg:col-span-6">{m.done}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="lg:col-span-6" aria-describedby={statusId}>
          <div className="flex border-b border-ink">
            <label htmlFor={emailId} className="sr-only">{m.email}</label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              placeholder={m.placeholder}
              className="min-h-12 flex-1 bg-transparent text-body placeholder:text-mute focus:outline-none"
              aria-invalid={state.kind === "error"}
            />
            <button type="submit" className="min-h-12 pl-4 text-small font-medium disabled:opacity-50" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? m.subscribing : m.subscribe}
            </button>
          </div>
          <div className="mt-4 flex items-start gap-3">
            <input id={consentId} name="consent" type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-ink" />
            <label htmlFor={consentId} className="text-micro leading-5 text-mute sm:text-small">
              {m.consent(storeName)}{" "}
              <Link href={href("/help/privacy")} className="underline underline-offset-2 hover:text-ink">{m.privacy}</Link>.
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
