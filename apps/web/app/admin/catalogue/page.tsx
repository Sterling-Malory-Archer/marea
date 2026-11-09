"use client";

import { Suspense, useState } from "react";
import { Badge, btn, Card, errorText, inputCls, Notice, PageHeader, useListParams } from "@/components/admin/ui";
import { ResourceManager, YesNo, type FieldDef } from "@/components/admin/form";
import { useAdmin, useAdminData } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Category { id: number; name: string; slug: string; path: string; depth: number; parentId: number | null; description: string | null; imageKey: string | null; isActive: boolean; showInNav: boolean; sortOrder: number; seoTitle: string | null; seoDescription: string | null; _count: { products: number; children: number } }
interface Brand { id: number; name: string; slug: string; description: string | null; isActive: boolean; sortOrder: number; _count: { products: number } }
interface Color { id: number; name: string; slug: string; hex: string; sortOrder: number }
interface Scale { id: number; name: string; code: string; guide: { columns: string[]; rows: string[][]; note?: string } | null; sizes: { id: number; label: string; sortOrder: number }[] }

const TABS = [["categories", "Categories"], ["brands", "Brands"], ["colours", "Colours"], ["sizes", "Sizes & size guides"]] as const;

export default function CataloguePage() {
  return <Suspense><Catalogue /></Suspense>;
}

function Catalogue() {
  const lp = useListParams();
  const tab = (lp.get("tab") || "categories") as (typeof TABS)[number][0];
  return (
    <>
      <PageHeader title="Brands & categories" subtitle="How the catalogue is organised in the store's menus and filters." />
      <nav aria-label="Sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => lp.set({ tab: k === "categories" ? null : k })} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-small ${tab === k ? "border-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}</button>
        ))}
      </nav>
      {tab === "categories" && <Categories />}
      {tab === "brands" && <Brands />}
      {tab === "colours" && <Colours />}
      {tab === "sizes" && <Sizes />}
    </>
  );
}

function Categories() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Category[] }>("/api/admin/categories");
  const rows = data ? [...data.items].sort((a, b) => a.path.localeCompare(b.path)) : null;
  const fields = (row: Category | null): FieldDef[] => [
    { name: "name", label: "Name", type: "text", required: true, half: true },
    { name: "slug", label: "URL segment", type: "slug", half: true, help: row ? `Currently /c/${row.path}. Changing it changes the URLs of this category and everything inside it.` : "Leave empty to generate from the name." },
    { name: "parentId", label: "Inside", type: "select", nullable: true, options: (rows ?? []).filter((c) => !row || (c.id !== row.id && !c.path.startsWith(`${row.path}/`))).map((c) => [c.id, `${"— ".repeat(c.depth)}${c.name}`]), help: "Empty = top level (appears in the main menu)." },
    { name: "description", label: "Intro text", type: "textarea", nullable: true, rows: 3 },
    { name: "isActive", label: "Visible in the store", type: "bool", half: true },
    { name: "showInNav", label: "Show in the menu", type: "bool", half: true },
    { name: "sortOrder", label: "Order", type: "number", half: true, help: "Lower numbers come first." },
    { name: "seoTitle", label: "Search title", type: "text", nullable: true },
    { name: "seoDescription", label: "Search description", type: "textarea", nullable: true, rows: 2 },
  ];
  return (
    <ResourceManager<Category>
      noun="category"
      rows={rows}
      canWrite={can("catalog:write")}
      onChanged={reload}
      fields={fields}
      newDefaults={{ isActive: true, showInNav: true, sortOrder: 0 }}
      createPath="/api/admin/categories"
      patchPath={(r) => `/api/admin/categories/${r.id}`}
      deletePath={(r) => `/api/admin/categories/${r.id}`}
      deleteHint="Only empty categories without subcategories can be deleted; otherwise hide it."
      translation={{ entity: "category", fields: [{ name: "name", label: "Name", required: true }, { name: "description", label: "Intro text", multiline: true }, { name: "seoTitle", label: "Search title" }, { name: "seoDescription", label: "Search description", multiline: true }] }}
      columns={[
        { header: "Name", render: (c) => <span style={{ paddingLeft: `${c.depth * 1.25}rem` }} className={c.depth === 0 ? "font-medium" : ""}>{c.depth > 0 && <span aria-hidden className="mr-1.5 text-mute">└</span>}{c.name}</span> },
        { header: "URL", render: (c) => <span className="font-mono text-micro text-mute">/c/{c.path}</span> },
        { header: "Products", render: (c) => <span className="tabular-nums">{c._count.products}</span> },
        { header: "Menu", render: (c) => <YesNo value={c.showInNav} /> },
        { header: "Status", render: (c) => <Badge value={c.isActive ? "Visible" : "Hidden"} tone={c.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function Brands() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Brand[] }>("/api/admin/brands");
  return (
    <ResourceManager<Brand>
      noun="brand"
      rows={data?.items ?? null}
      canWrite={can("catalog:write")}
      onChanged={reload}
      fields={[
        { name: "name", label: "Name", type: "text", required: true, half: true },
        { name: "slug", label: "URL segment", type: "slug", half: true },
        { name: "description", label: "About the brand", type: "textarea", nullable: true, rows: 3 },
        { name: "isActive", label: "Active", type: "bool", half: true },
        { name: "sortOrder", label: "Order", type: "number", half: true },
      ]}
      newDefaults={{ isActive: true, sortOrder: 0 }}
      createPath="/api/admin/brands"
      patchPath={(r) => `/api/admin/brands/${r.id}`}
      deletePath={(r) => `/api/admin/brands/${r.id}`}
      deleteHint="Brands with products can't be deleted; deactivate instead."
      columns={[
        { header: "Brand", render: (b) => b.name },
        { header: "Products", render: (b) => <span className="tabular-nums">{b._count.products}</span> },
        { header: "Status", render: (b) => <Badge value={b.isActive ? "Active" : "Inactive"} tone={b.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function Colours() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Color[] }>("/api/admin/colors");
  return (
    <ResourceManager<Color>
      noun="colour"
      rows={data?.items ?? null}
      canWrite={can("catalog:write")}
      onChanged={reload}
      fields={[
        { name: "name", label: "Name", type: "text", required: true, half: true },
        { name: "hex", label: "Swatch", type: "color", required: true, half: true, help: "Shown as the swatch in filters and on product pages." },
        { name: "slug", label: "URL / SKU code", type: "slug", half: true, help: "Used in filter URLs and generated SKUs." },
        { name: "sortOrder", label: "Order", type: "number", half: true },
      ]}
      newDefaults={{ hex: "#777777", sortOrder: 0 }}
      createPath="/api/admin/colors"
      patchPath={(r) => `/api/admin/colors/${r.id}`}
      deletePath={(r) => `/api/admin/colors/${r.id}`}
      deleteHint="Colours used by variants can't be deleted."
      translation={{ entity: "color", fields: [{ name: "name", label: "Name", required: true }] }}
      columns={[
        { header: "Colour", render: (c) => <span className="flex items-center gap-2"><span aria-hidden className="size-4 rounded-full border border-ink/15" style={{ background: c.hex }} />{c.name}</span> },
        { header: "Hex", render: (c) => <span className="font-mono text-micro text-mute">{c.hex}</span> },
        { header: "Code", render: (c) => <span className="font-mono text-micro text-mute">{c.slug}</span> },
      ]}
    />
  );
}

/* ───────────── Size systems & guides ───────────── */

function Sizes() {
  const { can } = useAdmin();
  const write = can("catalog:write");
  const { data, reload } = useAdminData<{ items: Scale[] }>("/api/admin/size-scales");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", code: "", sizes: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/admin/size-scales", { method: "POST", json: { name: form.name, code: form.code, sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean) } });
      setForm({ name: "", code: "", sizes: "" });
      setMsg({ kind: "success", text: "Size system created." });
      await reload();
    } catch (err) {
      setMsg({ kind: "error", text: errorText(err) });
    }
  }

  return (
    <div className="space-y-6">
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {data?.items.map((s) => <ScaleCard key={s.id} scale={s} write={write} onChange={reload} onMessage={setMsg} />)}
      {write && (
        <Card title="New size system">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <label className="text-small"><span className="mb-1.5 block text-micro text-mute">Name</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kids' ages" className={inputCls} /></label>
            <label className="text-small"><span className="mb-1.5 block text-micro text-mute">Code</span><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="kids-age" className={`${inputCls} font-mono`} /></label>
            <label className="text-small sm:col-span-2"><span className="mb-1.5 block text-micro text-mute">Sizes, smallest first, separated by commas</span><input value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} placeholder="2Y, 4Y, 6Y, 8Y" className={inputCls} /></label>
            <div><button type="submit" className={btn.primary}>Create</button></div>
          </form>
        </Card>
      )}
    </div>
  );
}

function ScaleCard({ scale, write, onChange, onMessage }: { scale: Scale; write: boolean; onChange: () => Promise<void>; onMessage: (m: { kind: "error" | "success"; text: string }) => void }) {
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await onChange();
      onMessage({ kind: "success", text: ok });
    } catch (e) {
      onMessage({ kind: "error", text: errorText(e) });
    }
  };
  return (
    <Card title={`${scale.name}`} actions={<span className="font-mono text-micro text-mute">{scale.code}</span>}>
      <div className="flex flex-wrap items-center gap-2">
        {scale.sizes.map((s) => (
          <span key={s.id} className="inline-flex h-8 items-center gap-1.5 border border-line bg-paper pl-3 pr-1 text-small">
            {s.label}
            {write && <button type="button" aria-label={`Remove size ${s.label}`} className="px-1.5 text-mute hover:text-claret" onClick={() => confirm(`Remove size ${s.label}?`) && run(() => api(`/api/admin/sizes/${s.id}`, { method: "DELETE" }), `Size ${s.label} removed.`)}>×</button>}
          </span>
        ))}
        {write && (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (label.trim()) void run(() => api(`/api/admin/size-scales/${scale.id}/sizes`, { method: "POST", json: { label: label.trim() } }), `Size ${label} added at the end.`).then(() => setLabel("")); }}>
            <input aria-label={`New size for ${scale.name}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add size" className={`${inputCls} h-8 w-28`} />
            <button type="submit" className={`${btn.secondary} h-8`}>Add</button>
          </form>
        )}
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-small font-medium">Size guide</h3>
          {write && !editing && <button type="button" className={btn.link} onClick={() => setEditing(true)}>{scale.guide ? "Edit guide" : "Add guide"}</button>}
        </div>
        {editing ? (
          <GuideEditor scale={scale} onCancel={() => setEditing(false)} onSave={(guide) => run(() => api(`/api/admin/size-scales/${scale.id}`, { method: "PATCH", json: { guide } }), "Size guide saved.").then(() => setEditing(false))} />
        ) : scale.guide ? (
          <GuideTable guide={scale.guide} />
        ) : (
          <p className="text-small text-mute">No guide — product pages won't show a size guide link for this system.</p>
        )}
      </div>
    </Card>
  );
}

function GuideTable({ guide }: { guide: NonNullable<Scale["guide"]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-small">
        <thead><tr className="text-left text-micro text-mute">{guide.columns.map((c, i) => <th key={i} className="border-b border-line py-1.5 pr-6 font-normal">{c}</th>)}</tr></thead>
        <tbody>{guide.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-line py-1.5 pr-6 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
      {guide.note && <p className="mt-2 text-micro text-mute">{guide.note}</p>}
    </div>
  );
}

function GuideEditor({ scale, onSave, onCancel }: { scale: Scale; onSave: (g: Scale["guide"]) => void; onCancel: () => void }) {
  const init = scale.guide ?? { columns: ["Size", "Bust (cm)", "Waist (cm)", "Hips (cm)"], rows: scale.sizes.map((s) => [s.label, "", "", ""]), note: "Body measurements in cm" };
  const [cols, setCols] = useState(init.columns);
  const [rows, setRows] = useState(init.rows.map((r) => cols.map((_, i) => r[i] ?? "")));
  const [note, setNote] = useState(init.note ?? "");
  const cell = "h-8 w-full min-w-20 border border-line bg-white px-2 text-small focus:border-ink focus:outline-none";
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-small">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i} className="pb-1 pr-1 font-normal">
                  <input aria-label={`Column ${i + 1} heading`} value={c} onChange={(e) => setCols(cols.map((x, j) => (j === i ? e.target.value : x)))} className={`${cell} font-medium`} />
                </th>
              ))}
              <th>{cols.length < 10 && <button type="button" className={btn.link} onClick={() => { setCols([...cols, ""]); setRows(rows.map((r) => [...r, ""])); }}>+ column</button>}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className="pb-1 pr-1"><input aria-label={`Row ${ri + 1}, ${cols[ci] || `column ${ci + 1}`}`} value={c} onChange={(e) => setRows(rows.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? e.target.value : x)) : row)))} className={cell} /></td>
                ))}
                <td><button type="button" aria-label={`Remove row ${ri + 1}`} className="px-2 text-mute hover:text-claret" onClick={() => setRows(rows.filter((_, i) => i !== ri))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={`${btn.link} mt-2`} onClick={() => setRows([...rows, cols.map(() => "")])}>+ row</button>
      <label className="mt-4 block text-small"><span className="mb-1.5 block text-micro text-mute">Note under the table</span><input maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></label>
      <div className="mt-4 flex gap-3">
        <button type="button" className={btn.primary} onClick={() => onSave({ columns: cols.map((c) => c.trim()), rows: rows.filter((r) => r.some((c) => c.trim())).map((r) => r.map((c) => c.trim())), ...(note.trim() ? { note: note.trim() } : {}) })}>Save guide</button>
        <button type="button" className={btn.secondary} onClick={onCancel}>Cancel</button>
        {scale.guide && <button type="button" className="ml-auto text-small text-mute hover:text-claret" onClick={() => confirm("Remove this size guide?") && onSave(null)}>Remove guide</button>}
      </div>
    </div>
  );
}
