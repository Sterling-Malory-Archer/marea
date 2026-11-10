"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/store";
import { btn, errorText, inputCls, Notice } from "./ui";

/*
 * Config-driven admin forms. Each field converts between the API value
 * (cents, basis points, ISO dates, arrays) and what a person types.
 */

type Values = Record<string, unknown>;
export type FieldType = "text" | "textarea" | "email" | "number" | "money" | "percent" | "bool" | "select" | "multi" | "datetime" | "color" | "image" | "codes" | "slug";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** Switch the input type from the other values (e.g. a coupon's value is € or %). */
  typeFrom?: (v: Values) => FieldType;
  required?: boolean;
  help?: React.ReactNode;
  placeholder?: string;
  options?: [string | number, string][];
  /** Empty input → null (instead of omitting the key). */
  nullable?: boolean;
  /** Empty input → this value (e.g. "" for settings that can be cleared). */
  emptyValue?: unknown;
  show?: (v: Values) => boolean;
  disabled?: boolean;
  /** Full row (default) or half row on wide screens. */
  half?: boolean;
  rows?: number;
  maxLength?: number;
}

type Draft = string | boolean | string[];

function toDraft(type: FieldType, v: unknown): Draft {
  switch (type) {
    case "bool": return Boolean(v);
    case "multi": return Array.isArray(v) ? v.map(String) : [];
    case "money": return v == null ? "" : (Number(v) / 100).toFixed(2);
    case "percent": return v == null ? "" : String(Number(v) / 100);
    case "codes": return Array.isArray(v) ? v.join(", ") : "";
    case "datetime": {
      if (!v) return "";
      const d = new Date(String(v));
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    default: return v == null ? "" : String(v);
  }
}

function fromDraft(f: FieldDef, type: FieldType, d: Draft): unknown {
  if (type === "bool") return Boolean(d);
  if (type === "multi") return (d as string[]).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const s = String(d).trim();
  if (s === "") return f.emptyValue !== undefined ? f.emptyValue : f.nullable ? null : undefined;
  switch (type) {
    case "number": return Number(s);
    case "money": return Math.round(Number(s.replace(",", ".")) * 100);
    case "percent": return Math.round(Number(s.replace(",", ".")) * 100);
    case "codes": return s.split(/[\s,]+/).filter(Boolean).map((c) => c.toUpperCase());
    case "datetime": return new Date(s).toISOString();
    case "select": return f.options?.some(([o]) => typeof o === "number") ? Number(s) : s;
    default: return s;
  }
}

export function EntityForm({
  fields,
  initial,
  onSubmit,
  submitLabel = "Save",
  onCancel,
  extra,
  readOnly,
}: {
  fields: FieldDef[];
  initial: Values;
  onSubmit: (payload: Values) => Promise<unknown>;
  submitLabel?: string;
  onCancel?: () => void;
  extra?: React.ReactNode;
  readOnly?: boolean;
}) {
  const typeOf = (f: FieldDef, v: Values) => f.typeFrom?.(v) ?? f.type;
  // Field configs are often rebuilt every render; key the reset on content, not identity.
  const sig = JSON.stringify([fields.map((f) => [f.name, f.type]), fields.map((f) => initial[f.name])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialDrafts = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, toDraft(typeOf(f, initial), initial[f.name])])), [sig]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initialDrafts);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => setDrafts(initialDrafts), [initialDrafts]);

  // Current values in API shape — used for `show` / `typeFrom` predicates.
  const values: Values = { ...initial };
  for (const f of fields) values[f.name] = fromDraft(f, f.type === "select" || f.type === "bool" ? f.type : "text", drafts[f.name] ?? "");
  const dirty = fields.some((f) => JSON.stringify(drafts[f.name]) !== JSON.stringify(initialDrafts[f.name]));

  const set = (name: string, d: Draft) => {
    setSaved(false);
    setDrafts((s) => ({ ...s, [name]: d }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const payload: Values = {};
    for (const f of fields) {
      if (f.disabled || (f.show && !f.show(values))) continue;
      const v = fromDraft(f, typeOf(f, values), drafts[f.name] ?? "");
      if (v !== undefined) payload[f.name] = v;
    }
    try {
      await onSubmit(payload);
      setSaved(true);
    } catch (err) {
      const fe = (err as { fields?: { path: string; message: string }[] }).fields;
      if (fe?.length) setFieldErrors(Object.fromEntries(fe.map((x) => [x.path.split(".")[0] ?? "", x.message])));
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error && <Notice kind="error" onClose={() => setError(null)}>{error}</Notice>}
      <fieldset disabled={readOnly || busy} className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.show && !f.show(values)) return null;
          return (
            <FieldInput
              key={f.name}
              f={f}
              type={typeOf(f, values)}
              value={drafts[f.name] ?? ""}
              error={fieldErrors[f.name]}
              preview={previews[f.name] !== undefined ? previews[f.name]! : ((initial[`${f.name.replace(/Key$/, "")}Url`] as string | null) ?? null)}
              onChange={(d) => set(f.name, d)}
              onUploaded={(key, url) => {
                set(f.name, key);
                setPreviews((p) => ({ ...p, [f.name]: url }));
                if ("imageIsPlaceholder" in drafts) set("imageIsPlaceholder", false);
              }}
            />
          );
        })}
      </fieldset>
      {extra}
      {!readOnly && (
        <div className="mt-6 flex items-center gap-3">
          <button type="submit" className={btn.primary} disabled={busy || !dirty}>{busy ? "Saving…" : submitLabel}</button>
          {onCancel && <button type="button" className={btn.secondary} onClick={onCancel}>Cancel</button>}
          <span role="status" className="text-micro text-mute">{saved && !dirty ? "Saved" : dirty ? "Unsaved changes" : ""}</span>
        </div>
      )}
    </form>
  );
}

function FieldInput({ f, type, value, error, preview, onChange, onUploaded }: { f: FieldDef; type: FieldType; value: Draft; error?: string; preview: string | null; onChange: (d: Draft) => void; onUploaded: (key: string, url: string) => void }) {
  const id = useId();
  const describedBy = [f.help ? `${id}-help` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, disabled: f.disabled, required: f.required };
  const span = f.half ? "" : "sm:col-span-2";

  if (type === "bool")
    return (
      <div className={span}>
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" {...common} checked={value as boolean} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-ink" />
          {f.label}
        </label>
        {f.help && <p id={`${id}-help`} className="mt-1 pl-6 text-micro text-mute">{f.help}</p>}
      </div>
    );

  let input: React.ReactNode;
  switch (type) {
    case "textarea":
      input = <textarea {...common} rows={f.rows ?? 4} maxLength={f.maxLength} value={value as string} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} className={`${inputCls} h-auto py-2 leading-5`} />;
      break;
    case "select":
      input = (
        <select {...common} value={value as string} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {(f.nullable || !f.required) && <option value="">—</option>}
          {f.options?.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
        </select>
      );
      break;
    case "multi": {
      const sel = new Set(value as string[]);
      input = (
        <div id={id} role="group" aria-describedby={describedBy} className="max-h-48 overflow-y-auto border border-line bg-white p-2">
          {f.options?.length ? f.options.map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 px-1 py-1 text-small">
              <input type="checkbox" className="size-4 accent-ink" checked={sel.has(String(v))} disabled={f.disabled} onChange={(e) => {
                const next = new Set(sel);
                if (e.target.checked) next.add(String(v)); else next.delete(String(v));
                onChange([...next]);
              }} />
              {l}
            </label>
          )) : <p className="px-1 py-1 text-micro text-mute">Nothing to choose from yet.</p>}
        </div>
      );
      break;
    }
    case "money":
    case "percent":
      input = (
        <div className="relative">
          <input {...common} inputMode="decimal" value={value as string} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={f.placeholder} className={`${inputCls} ${type === "money" ? "pl-7" : "pr-7"} tabular-nums`} />
          <span aria-hidden className={`pointer-events-none absolute inset-y-0 flex items-center text-small text-mute ${type === "money" ? "left-3" : "right-3"}`}>{type === "money" ? "€" : "%"}</span>
        </div>
      );
      break;
    case "color":
      input = (
        <div className="flex gap-2">
          <input type="color" aria-label={`${f.label} picker`} value={/^#[0-9A-Fa-f]{6}$/.test(value as string) ? (value as string) : "#EEECE7"} onChange={(e) => onChange(e.target.value.toUpperCase())} disabled={f.disabled} className="h-9 w-12 cursor-pointer border border-line bg-white p-1" />
          <input {...common} value={value as string} onChange={(e) => onChange(e.target.value)} placeholder="#RRGGBB" className={`${inputCls} font-mono uppercase`} />
        </div>
      );
      break;
    case "image":
      input = <ImageInput id={id} value={value as string} preview={preview} onChange={onChange} onUploaded={onUploaded} disabled={f.disabled} />;
      break;
    default:
      input = (
        <input
          {...common}
          type={type === "email" ? "email" : type === "number" ? "number" : type === "datetime" ? "datetime-local" : "text"}
          value={value as string}
          maxLength={f.maxLength}
          onChange={(e) => onChange(type === "slug" ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") : e.target.value)}
          placeholder={f.placeholder}
          className={`${inputCls} ${type === "number" ? "tabular-nums" : ""} ${type === "slug" || type === "codes" ? "font-mono" : ""}`}
        />
      );
  }

  return (
    <div className={span}>
      <label htmlFor={id} className="mb-1.5 block text-micro text-mute">
        {f.label}{f.required && <span aria-hidden> *</span>}
      </label>
      {input}
      {f.help && <p id={`${id}-help`} className="mt-1 text-micro text-mute">{f.help}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-micro text-claret">{error}</p>}
    </div>
  );
}

function ImageInput({ id, value, preview, onChange, onUploaded, disabled }: { id: string; value: string; preview: string | null; onChange: (d: Draft) => void; onUploaded: (key: string, url: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const r = await api<{ key: string; url: string }>("/api/admin/media", { method: "POST", body: fd });
      onUploaded(r.key, r.url);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden border border-line bg-sand">
        {value && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-1 text-center text-[10px] leading-tight text-mute">{value ? "Image set" : "No image"}</span>
        )}
      </div>
      <div className="space-y-2">
        <input ref={ref} id={id} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={disabled || busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex gap-2">
          <button type="button" className={btn.secondary} disabled={disabled || busy} onClick={() => ref.current?.click()}>{busy ? "Uploading…" : value ? "Replace image" : "Upload image"}</button>
          {value && <button type="button" className={btn.link} disabled={disabled} onClick={() => onChange("")}>Remove</button>}
        </div>
        <p className="text-micro text-mute">JPEG, PNG, WebP or AVIF · at least 1200px on the long edge</p>
        {err && <p className="text-micro text-claret">{err}</p>}
      </div>
    </div>
  );
}

/** Right-hand panel for editing one record without leaving the list. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative flex h-full w-full max-w-2xl flex-col bg-paper shadow-xl outline-none" style={{ animation: "slide-in .2s ease-out" }}>
        <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <h2 className="text-lead font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 text-xl leading-none text-mute hover:text-ink" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export interface TranslationConfig {
  entity: "product" | "category" | "collection" | "color" | "heroSlide" | "announcement" | "contentBlock" | "page";
  fields: { name: string; label: string; multiline?: boolean; required?: boolean }[];
}

/** Montenegrin copy for one record. Empty fields fall back to English on the storefront. */
export function TranslationPanel({ config, id, source, disabled }: { config: TranslationConfig; id: number; source: Values; disabled?: boolean }) {
  const [row, setRow] = useState<Values | null | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fid = useId();

  useEffect(() => {
    let live = true;
    api<{ items: (Values & { locale: string })[] }>(`/api/admin/translations/${config.entity}/${id}`)
      .then((r) => {
        if (!live) return;
        const me = r.items.find((t) => t.locale === "me") ?? null;
        setRow(me);
        setDrafts(Object.fromEntries(config.fields.map((f) => [f.name, me?.[f.name] == null ? "" : String(me[f.name])])));
      })
      .catch((e) => live && setMsg({ kind: "error", text: errorText(e) }));
    return () => { live = false; };
  }, [config, id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = Object.fromEntries(config.fields.map((f) => [f.name, drafts[f.name]?.trim() || null]));
      const saved = await api<Values>(`/api/admin/translations/${config.entity}/${id}/me`, { method: "PUT", json: body });
      setRow(saved);
      setMsg({ kind: "success", text: "Montenegrin copy saved." });
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the Montenegrin copy? The storefront will show English instead.")) return;
    setBusy(true);
    try {
      await api(`/api/admin/translations/${config.entity}/${id}/me`, { method: "DELETE" });
      setRow(null);
      setDrafts(Object.fromEntries(config.fields.map((f) => [f.name, ""])));
      setMsg({ kind: "success", text: "Removed — English is shown on /me pages." });
    } finally {
      setBusy(false);
    }
  }

  if (row === undefined) return <p className="text-small text-mute">Loading translation…</p>;
  return (
    <form onSubmit={save} noValidate>
      <p className="mb-4 text-small text-mute">
        {row ? "Shown on the Montenegrin site (/me)." : "No Montenegrin copy yet — the Montenegrin site shows the English text."} Empty optional fields fall back to English.
      </p>
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <fieldset disabled={disabled || busy} className="space-y-4">
        {config.fields.map((f) => {
          const src = source[f.name];
          return (
            <div key={f.name}>
              <label htmlFor={`${fid}-${f.name}`} className="mb-1.5 block text-micro text-mute">{f.label} (Montenegrin){f.required && <span aria-hidden> *</span>}</label>
              {f.multiline ? (
                <textarea id={`${fid}-${f.name}`} rows={f.name === "body" ? 14 : 4} value={drafts[f.name] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [f.name]: e.target.value }))} className={`${inputCls} h-auto py-2 leading-5`} />
              ) : (
                <input id={`${fid}-${f.name}`} value={drafts[f.name] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [f.name]: e.target.value }))} className={inputCls} />
              )}
              {src ? <p className="mt-1 line-clamp-2 text-micro text-mute">English: {String(src)}</p> : null}
            </div>
          );
        })}
      </fieldset>
      {!disabled && (
        <div className="mt-6 flex gap-3">
          <button type="submit" className={btn.primary} disabled={busy}>Save Montenegrin</button>
          {row && <button type="button" className={btn.secondary} onClick={remove} disabled={busy}>Remove translation</button>}
        </div>
      )}
    </form>
  );
}

export interface Column<T> { header: string; render: (row: T) => React.ReactNode; className?: string }

/**
 * List + drawer editor for simple records. The page owns loading; this owns
 * create/edit/delete and the optional Montenegrin tab.
 */
export function ResourceManager<T extends { id: number }>({
  title,
  noun,
  rows,
  columns,
  fields,
  newDefaults = {},
  createPath,
  patchPath,
  deletePath,
  deleteHint,
  translation,
  canWrite,
  onChanged,
  rowActions,
  empty,
  toolbar,
}: {
  title?: string;
  noun: string;
  rows: T[] | null;
  columns: Column<T>[];
  fields: FieldDef[] | ((row: T | null) => FieldDef[]);
  newDefaults?: Values;
  createPath?: string;
  patchPath: (row: T) => string;
  deletePath?: (row: T) => string;
  deleteHint?: string;
  translation?: TranslationConfig;
  canWrite: boolean;
  onChanged: () => void | Promise<void>;
  rowActions?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [tab, setTab] = useState<"en" | "me">("en");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const current = editing === "new" ? null : editing;
  const fieldList = typeof fields === "function" ? fields(current) : fields;
  const close = () => { setEditing(null); setTab("en"); };

  async function remove(row: T) {
    if (!deletePath) return;
    if (!confirm(`Delete this ${noun}? ${deleteHint ?? "This cannot be undone."}`)) return;
    try {
      const r = await api<{ deactivated?: boolean } | undefined>(deletePath(row), { method: "DELETE" });
      setMsg({ kind: "success", text: r?.deactivated ? `The ${noun} is in use, so it was deactivated instead.` : `Deleted.` });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  }

  return (
    <section className="mb-10">
      {(title || (canWrite && createPath) || toolbar) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-lead font-medium">{title}</h2> : <span />}
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {canWrite && createPath && <button type="button" className={btn.primary} onClick={() => setEditing("new")}>Add {noun}</button>}
          </div>
        </div>
      )}
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {rows === null ? (
        <p className="text-small text-mute">Loading…</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-left text-micro text-mute">
                {columns.map((c, i) => <th key={c.header || i} scope="col" className="whitespace-nowrap px-4 py-2.5 font-normal">{c.header || <span className="sr-only">Image</span>}</th>)}
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  {columns.map((c) => <td key={c.header} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>{c.render(row)}</td>)}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      {rowActions?.(row)}
                      <button type="button" className={btn.link} onClick={() => setEditing(row)}>{canWrite ? "Edit" : "View"}</button>
                      {canWrite && deletePath && <button type="button" className="text-small text-mute underline-offset-2 hover:text-claret hover:underline" onClick={() => remove(row)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="px-4 py-10 text-center text-small text-mute">{empty ?? `No ${noun}s yet.`}</div>}
        </div>
      )}

      {editing && (
        <Drawer title={editing === "new" ? `New ${noun}` : `Edit ${noun}`} onClose={close}>
          {translation && current && (
            <div role="tablist" className="mb-6 flex gap-1 border-b border-line">
              {(["en", "me"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-small ${tab === t ? "border-ink" : "border-transparent text-mute hover:text-ink"}`}>
                  {t === "en" ? "English (default)" : "Montenegrin"}
                </button>
              ))}
            </div>
          )}
          {tab === "me" && translation && current ? (
            <TranslationPanel config={translation} id={current.id} source={current as unknown as Values} disabled={!canWrite} />
          ) : (
            <EntityForm
              key={current?.id ?? "new"}
              fields={fieldList}
              initial={(current as unknown as Values) ?? newDefaults}
              readOnly={!canWrite}
              submitLabel={editing === "new" ? `Create ${noun}` : "Save changes"}
              onCancel={close}
              onSubmit={async (payload) => {
                if (editing === "new") await api(createPath!, { method: "POST", json: payload });
                else await api(patchPath(editing), { method: "PATCH", json: payload });
                await onChanged();
                setMsg({ kind: "success", text: editing === "new" ? `${noun.charAt(0).toUpperCase() + noun.slice(1)} created.` : "Changes saved." });
                close();
              }}
            />
          )}
        </Drawer>
      )}
    </section>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return <span className={value ? "" : "text-mute"}>{value ? "Yes" : "No"}</span>;
}
