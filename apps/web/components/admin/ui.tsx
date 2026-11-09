"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/* Admin building blocks: denser than the storefront, same tokens. */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-small text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && <h2 className="text-small font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export const btn = {
  primary: "inline-flex h-9 items-center gap-2 bg-ink px-4 text-small text-paper hover:bg-ink/85 disabled:opacity-40",
  secondary: "inline-flex h-9 items-center gap-2 border border-line bg-white px-4 text-small hover:border-ink disabled:opacity-40",
  danger: "inline-flex h-9 items-center gap-2 border border-claret/40 bg-white px-4 text-small text-claret hover:bg-claret hover:text-white disabled:opacity-40",
  link: "text-small underline underline-offset-2 hover:text-claret",
};

const TONES: Record<string, string> = {
  neutral: "bg-sand text-ink",
  good: "bg-[#E3EFE5] text-[#1F5A2E]",
  warn: "bg-[#F6ECD6] text-[#6B4A00]",
  bad: "bg-[#F4E1E3] text-claret",
  info: "bg-[#E4EAF3] text-[#23406B]",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  ACTIVE: "good", DRAFT: "neutral", ARCHIVED: "neutral", DISABLED: "bad", DELETION_REQUESTED: "warn",
  PENDING_PAYMENT: "warn", PAID: "good", PROCESSING: "info", SHIPPED: "info", DELIVERED: "good", CANCELLED: "neutral", FAILED: "bad", REFUNDED: "neutral",
  COD_PENDING: "warn", PENDING: "warn", SUBSCRIBED: "good", UNSUBSCRIBED: "neutral",
};

/** Status chip: always text + tone, never colour alone. */
export function Badge({ value, tone }: { value: string; tone?: keyof typeof TONES }) {
  const t = tone ?? STATUS_TONE[value] ?? "neutral";
  return <span className={`inline-flex h-6 items-center whitespace-nowrap px-2 text-micro ${TONES[t]}`}>{humanize(value)}</span>;
}

/** "COD_PENDING" → "COD pending". Keeps known acronyms upper-case. */
export function humanize(value: string) {
  return value
    .split("_")
    .map((w, i) => (["COD", "VAT", "SKU", "EU"].includes(w) ? w : i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
/** ISO country code → English name (admin is English-only). */
export function countryName(code: string | null | undefined) {
  if (!code) return "";
  try { return COUNTRY_NAMES.of(code) ?? code; } catch { return code; }
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  return (
    <div className="overflow-x-auto border border-line bg-white">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="border-b border-line text-left text-micro text-mute">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle">{rows}</tbody>
      </table>
      {Array.isArray(rows) && rows.length === 0 && <div className="px-4 py-10 text-center text-small text-mute">{empty ?? "Nothing here yet."}</div>}
    </div>
  );
}

/** URL-bound list state (search, filters, page) so views are shareable and survive reloads. */
export function useListParams() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k) ?? "";
  const set = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? q.set(k, v) : q.delete(k));
    if (!("page" in patch)) q.delete("page");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };
  return { get, set, query: sp.toString() };
}

export function SearchBox({ value, onSearch, placeholder }: { value: string; onSearch: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()); }} className="flex">
      <input type="search" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-64 border border-line bg-white px-3 text-small focus:border-ink focus:outline-none" />
    </form>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <label className="flex items-center gap-2 text-small">
      <span className="text-mute">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 border border-line bg-white px-2 focus:border-ink focus:outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-micro text-mute">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-small">
      <span className="text-micro text-mute">{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span>
      <div className="flex gap-2">
        <button type="button" className={btn.secondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button type="button" className={btn.secondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Notice({ kind, children, onClose }: { kind: "error" | "success" | "info"; children: React.ReactNode; onClose?: () => void }) {
  if (!children) return null;
  const tone = kind === "error" ? "border-claret text-claret bg-[#FBF3F4]" : kind === "success" ? "border-[#1F5A2E] text-[#1F5A2E] bg-[#F1F7F2]" : "border-line bg-white";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-4 flex items-start justify-between gap-4 border-l-2 px-4 py-3 text-small ${tone}`}>
      <div>{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="text-mute hover:text-ink">×</button>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="border border-line bg-white px-5 py-4">
      <p className="text-micro text-mute">{label}</p>
      <p className="mt-2 text-2xl tabular-nums tracking-[-0.01em]">{value}</p>
      {sub && <p className="mt-1 text-micro text-mute">{sub}</p>}
    </div>
  );
}

export function TabLinks({ tabs }: { tabs: [string, string][] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="mb-6 flex gap-1 border-b border-line">
      {tabs.map(([href, label]) => {
        const on = pathname === href;
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-small ${on ? "border-ink" : "border-transparent text-mute hover:text-ink"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export const inputCls = "h-9 w-full border border-line bg-white px-3 text-small focus:border-ink focus:outline-none";

/** Human message for an API error, including field-level validation details. */
export function errorText(e: unknown) {
  const err = e as { message?: string; fields?: { path: string; message: string }[]; details?: { problems?: string[] } };
  if (err?.details?.problems?.length) return `${err.message}: ${err.details.problems.join(" ")}`;
  if (err?.fields?.length) return err.fields.map((f) => `${f.path || "value"}: ${f.message}`).join("; ");
  return err?.message ?? "Something went wrong";
}
