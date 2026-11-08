"use client";

import { useId } from "react";

/** Accessible form primitives: labelled inputs with linked hints and errors. */
export function Field({
  label,
  error,
  hint,
  className = "",
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small">{label}</label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`block h-12 w-full border bg-paper px-3.5 text-body text-ink placeholder:text-mute focus:outline-none ${error ? "border-claret" : "border-line focus:border-ink"}`}
        {...input}
      />
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-micro text-mute">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1.5 text-micro text-claret">{error}</p>}
    </div>
  );
}

export function SelectField({ label, error, children, className = "", ...select }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string | null }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-small">{label}</label>
      <select id={id} aria-invalid={!!error} className="block h-12 w-full border border-line bg-paper px-3 text-body focus:border-ink focus:outline-none" {...select}>
        {children}
      </select>
      {error && <p className="mt-1.5 text-micro text-claret">{error}</p>}
    </div>
  );
}

export function CheckField({ label, error, className = "", ...input }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-ink" {...input} />
        <label htmlFor={id} className="text-small leading-5 text-ink/80">{label}</label>
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 pl-7.5 text-micro text-claret">{error}</p>}
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`border-l-2 py-1 pl-3 text-small ${kind === "error" ? "border-claret text-claret" : "border-ink text-ink"}`}>
      {children}
    </p>
  );
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export function passwordProblem(pw: string, t: { passwordShort: string; passwordMix: string }) {
  if (pw.length < 10) return t.passwordShort;
  if (!/[a-zA-Z]/.test(pw) || !/[0-9\W_]/.test(pw)) return t.passwordMix;
  return null;
}
