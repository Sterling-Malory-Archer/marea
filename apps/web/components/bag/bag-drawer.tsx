"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n-client";
import { useStore } from "@/lib/store";
import { CloseIcon } from "../icons";
import { CheckoutButton, LineItem, Totals } from "./bag-lines";

export function BagDrawer() {
  const { t, href } = useI18n();
  const B = t.bag;
  const { cart, drawerOpen, setDrawerOpen } = useStore();
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = () => setDrawerOpen(false);

  useEffect(() => close(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!drawerOpen) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("a, button:not([disabled]), select");
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      returnTo?.focus?.();
    };
  }, [drawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drawerOpen) return null;
  const empty = !cart || cart.lines.length === 0;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-[fade_0.25s_ease] bg-ink/30" onClick={close} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-title"
        className="absolute inset-y-0 right-0 flex w-[min(100vw,28rem)] animate-[slide-in_0.3s_var(--ease-out-soft)] flex-col bg-paper focus:outline-none"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 id="bag-title" className="text-lead">
            {B.title}
            {cart && cart.itemCount > 0 && <span className="ml-2 text-small text-mute tabular-nums">({cart.itemCount})</span>}
          </h2>
          <button type="button" onClick={close} aria-label={B.close} className="-mr-2 p-2"><CloseIcon /></button>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-start justify-center px-6">
            <p className="display text-3xl">{B.empty}</p>
            <p className="mt-3 text-small text-ink/70">{B.emptyText}</p>
            <button type="button" onClick={close} className="btn btn-outline mt-8">{B.continue}</button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {cart.lines.map((l) => <LineItem key={l.id} line={l} compact onNavigate={close} />)}
            </ul>
            <div className="shrink-0 space-y-4 border-t border-line bg-paper px-5 py-5">
              <Totals cart={cart} />
              <div className="grid gap-2">
                <Link href={href("/bag")} onClick={close} className="btn btn-outline w-full">{B.viewBag}</Link>
                <CheckoutButton cart={cart} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
