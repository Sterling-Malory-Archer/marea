"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useMemo, useRef, useState } from "react";
import { Badge, btn, Card, errorText, inputCls, Notice, PageHeader } from "@/components/admin/ui";
import { EntityForm, TranslationPanel, type TranslationConfig } from "@/components/admin/form";
import { productFields, useTaxonomy, type Taxonomy } from "@/components/admin/product-fields";
import { eur, useAdmin, useAdminData, when } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Variant {
  id: number; sku: string; barcode: string | null; priceMinor: number | null; isActive: boolean; colorId: number; sizeId: number;
  color: { id: number; name: string; hex: string; sortOrder: number }; size: { id: number; label: string; sortOrder: number };
  inventory: { quantityOnHand: number; quantityReserved: number; lowStockThreshold: number; allowBackorder: boolean } | null;
  available: number;
}
interface Image { id: number; url: string | null; isPlaceholder: boolean; altText: string | null; kind: string; colorId: number | null; width: number | null; height: number | null }
interface Product {
  id: number; reference: string; title: string; slug: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; priceMinor: number; compareAtPriceMinor: number | null; discountPercent: number | null;
  subtitle: string | null; description: string | null; composition: string | null; care: string | null; seoTitle: string | null; seoDescription: string | null;
  brandId: number | null; primaryCategoryId: number | null; sizeScaleId: number; isNewArrival: boolean; publishedAt: string | null; updatedAt: string;
  categories: { categoryId: number }[]; collections: { collectionId: number }[];
  sizeScale: { id: number; name: string; sizes: { id: number; label: string }[] };
  variants: Variant[]; images: Image[];
}

const TRANSLATION: TranslationConfig = {
  entity: "product",
  fields: [
    { name: "title", label: "Product name", required: true },
    { name: "subtitle", label: "Short line" },
    { name: "description", label: "Description", multiline: true },
    { name: "composition", label: "Composition" },
    { name: "care", label: "Care" },
    { name: "seoTitle", label: "Search title" },
    { name: "seoDescription", label: "Search description", multiline: true },
  ],
};

type Tab = "details" | "stock" | "photos" | "me";

export default function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense><ProductEditor id={Number(use(params).id)} /></Suspense>;
}

function ProductEditor({ id }: { id: number }) {
  const { can } = useAdmin();
  const t = useTaxonomy();
  const sp = useSearchParams();
  const { data: p, error, reload, setData } = useAdminData<Product>(`/api/admin/products/${id}`);
  const [tab, setTab] = useState<Tab>(sp.get("created") ? "stock" : "details");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(sp.get("created") ? { kind: "success", text: "Draft created. Add sizes and stock, then photos, then publish." } : null);
  const [busy, setBusy] = useState(false);
  const write = can("catalog:write");

  async function lifecycle(action: "publish" | "unpublish" | "archive") {
    setBusy(true);
    setMsg(null);
    try {
      setData(await api<Product>(`/api/admin/products/${id}/${action}`, { method: "POST" }));
      setMsg({ kind: "success", text: action === "publish" ? "Published — the product is live in the store." : action === "archive" ? "Archived. It's hidden from the store; order history is kept." : "Moved back to draft and hidden from the store." });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this product permanently, with its variants and photos? Products that appear in orders can only be archived.")) return;
    try {
      await api(`/api/admin/products/${id}`, { method: "DELETE" });
      window.location.href = "/admin/products";
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!p || !t) return <p className="text-small text-mute">Loading…</p>;

  const initial = { ...p, categoryIds: p.categories.map((c) => c.categoryId), collectionIds: p.collections.map((c) => c.collectionId) };
  const stockTotal = p.variants.reduce((s, v) => s + v.available, 0);
  const tabs: [Tab, string][] = [["details", "Details"], ["stock", `Sizes & stock (${p.variants.length})`], ["photos", `Photos (${p.images.length})`], ["me", "Montenegrin"]];

  return (
    <>
      <p className="mb-2 text-micro"><Link href="/admin/products" className="text-mute hover:text-ink">← Products</Link></p>
      <PageHeader
        title={p.title}
        subtitle={<><span className="font-mono">{p.reference}</span> · {eur(p.priceMinor)}{p.discountPercent ? ` (−${p.discountPercent}%)` : ""} · {stockTotal} in stock · updated {when(p.updatedAt)}</>}
        actions={
          <>
            {p.status === "ACTIVE" && <a href={`/p/${p.slug}`} target="_blank" rel="noopener" className={btn.secondary}>View in store ↗</a>}
            {write && p.status !== "ACTIVE" && <button type="button" className={btn.primary} disabled={busy} onClick={() => lifecycle("publish")}>Publish</button>}
            {write && p.status === "ACTIVE" && <button type="button" className={btn.secondary} disabled={busy} onClick={() => lifecycle("unpublish")}>Unpublish</button>}
            {write && p.status !== "ARCHIVED" && <button type="button" className={btn.secondary} disabled={busy} onClick={() => lifecycle("archive")}>Archive</button>}
            {write && <button type="button" className={btn.danger} disabled={busy} onClick={remove}>Delete</button>}
          </>
        }
      />
      <div className="mb-5 flex items-center gap-2"><Badge value={p.status} />{p.publishedAt && <span className="text-micro text-mute">First published {when(p.publishedAt, false)}</span>}</div>
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      <div role="tablist" aria-label="Product sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-small ${tab === k ? "border-ink" : "border-transparent text-mute hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "details" && (
        <div className="max-w-3xl">
          <Card>
            <EntityForm
              fields={productFields(t, { hasVariants: p.variants.length > 0 })}
              initial={initial}
              readOnly={!write}
              onSubmit={async (payload) => {
                setData(await api<Product>(`/api/admin/products/${id}`, { method: "PATCH", json: payload }));
              }}
            />
          </Card>
        </div>
      )}
      {tab === "stock" && <Variants product={p} taxonomy={t} onChange={reload} />}
      {tab === "photos" && <Photos product={p} colors={t.colors} onChange={reload} />}
      {tab === "me" && (
        <div className="max-w-3xl">
          <Card><TranslationPanel config={TRANSLATION} id={p.id} source={p as unknown as Record<string, unknown>} disabled={!write} /></Card>
        </div>
      )}
    </>
  );
}

/* ───────────── Sizes & stock ───────────── */

function Variants({ product, taxonomy, onChange }: { product: Product; taxonomy: Taxonomy; onChange: () => Promise<void> }) {
  const { can } = useAdmin();
  const write = can("catalog:write");
  const [colors, setColors] = useState<Set<number>>(new Set());
  const [sizes, setSizes] = useState<Set<number>>(new Set());
  const [qty, setQty] = useState("0");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<number, { color: Variant["color"]; rows: Variant[] }>();
    for (const v of product.variants) {
      if (!m.has(v.colorId)) m.set(v.colorId, { color: v.color, rows: [] });
      m.get(v.colorId)!.rows.push(v);
    }
    return [...m.values()].sort((a, b) => a.color.sortOrder - b.color.sortOrder);
  }, [product.variants]);

  const toggle = (set: Set<number>, upd: (s: Set<number>) => void, id: number) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    upd(n);
  };
  const toCreate = [...colors].length * [...sizes].length - product.variants.filter((v) => colors.has(v.colorId) && sizes.has(v.sizeId)).length;

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ created: number }>(`/api/admin/products/${product.id}/variants/generate`, { method: "POST", json: { colorIds: [...colors], sizeIds: [...sizes], initialQuantity: Number(qty) || 0 } });
      setMsg({ kind: "success", text: `${r.created} variant${r.created === 1 ? "" : "s"} added with their own SKUs.` });
      setColors(new Set());
      setSizes(new Set());
      await onChange();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {write && (
        <Card title="Add colours and sizes">
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="mb-2 text-micro text-mute">Colours</legend>
              <div className="flex flex-wrap gap-2">
                {taxonomy.colors.map((c) => (
                  <label key={c.id} className={`flex cursor-pointer items-center gap-2 border px-2.5 py-1.5 text-small ${colors.has(c.id) ? "border-ink bg-sand" : "border-line bg-white"}`}>
                    <input type="checkbox" className="sr-only" checked={colors.has(c.id)} onChange={() => toggle(colors, setColors, c.id)} />
                    <span aria-hidden className="size-3.5 rounded-full border border-ink/15" style={{ background: c.hex }} />
                    {c.name}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-micro text-mute">Missing a colour? Add it under <Link href="/admin/catalogue?tab=colours" className="underline underline-offset-2">Brands &amp; categories → Colours</Link>.</p>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-micro text-mute">Sizes · {product.sizeScale.name}</legend>
              <div className="flex flex-wrap gap-2">
                {product.sizeScale.sizes.map((s) => (
                  <label key={s.id} className={`flex min-w-11 cursor-pointer items-center justify-center border px-2.5 py-1.5 text-small ${sizes.has(s.id) ? "border-ink bg-sand" : "border-line bg-white"}`}>
                    <input type="checkbox" className="sr-only" checked={sizes.has(s.id)} onChange={() => toggle(sizes, setSizes, s.id)} />
                    {s.label}
                  </label>
                ))}
              </div>
              <button type="button" className={`${btn.link} mt-2`} onClick={() => setSizes(new Set(product.sizeScale.sizes.map((s) => s.id)))}>Select all sizes</button>
            </fieldset>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <label className="text-small">
              <span className="mb-1.5 block text-micro text-mute">Starting stock for each</span>
              <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-28 tabular-nums`} />
            </label>
            <button type="button" className={btn.primary} disabled={busy || toCreate <= 0} onClick={generate}>
              {toCreate > 0 ? `Create ${toCreate} variant${toCreate === 1 ? "" : "s"}` : "Choose colours and sizes"}
            </button>
          </div>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card><p className="text-small text-mute">No variants yet. A product needs at least one colour and size before it can be published.</p></Card>
      ) : (
        groups.map((g) => (
          <section key={g.color.id} className="border border-line bg-white">
            <h3 className="flex items-center gap-2 border-b border-line px-4 py-3 text-small font-medium">
              <span aria-hidden className="size-3.5 rounded-full border border-ink/15" style={{ background: g.color.hex }} />
              {g.color.name}
              <span className="font-normal text-mute">· {g.rows.reduce((s, v) => s + v.available, 0)} available</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-line text-left text-micro text-mute">
                    {["Size", "SKU", "Price", "On hand", "Reserved", "Available", "Alert at", "On sale", ""].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 font-normal">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...g.rows].sort((a, b) => a.size.sortOrder - b.size.sortOrder).map((v) => <VariantRow key={v.id} v={v} productPrice={product.priceMinor} onChange={onChange} onMessage={setMsg} />)}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const REASONS = [["COUNT", "Stock count"], ["RESTOCK", "Delivery received"], ["RETURN", "Customer return"], ["DAMAGE", "Damaged / lost"], ["ADJUSTMENT", "Other correction"]] as const;

function VariantRow({ v, productPrice, onChange, onMessage }: { v: Variant; productPrice: number; onChange: () => Promise<void>; onMessage: (m: { kind: "error" | "success"; text: string }) => void }) {
  const { can } = useAdmin();
  const write = can("catalog:write");
  const stock = can("inventory:write");
  const onHand = v.inventory?.quantityOnHand ?? 0;
  const [count, setCount] = useState(String(onHand));
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("COUNT");
  const [price, setPrice] = useState(v.priceMinor == null ? "" : (v.priceMinor / 100).toFixed(2));
  const [threshold, setThreshold] = useState(String(v.inventory?.lowStockThreshold ?? 3));
  const [history, setHistory] = useState<{ id: number; reason: string; deltaOnHand: number; deltaReserved: number; note: string | null; createdAt: string; actor: { email: string } | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const stockDirty = Number(count) !== onHand && count !== "";
  const priceDirty = price !== (v.priceMinor == null ? "" : (v.priceMinor / 100).toFixed(2)) || threshold !== String(v.inventory?.lowStockThreshold ?? 3);
  const low = v.isActive && v.available <= (v.inventory?.lowStockThreshold ?? 0);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await onChange();
      onMessage({ kind: "success", text: ok });
    } catch (e) {
      onMessage({ kind: "error", text: `${v.sku}: ${errorText(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const saveStock = () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0) return onMessage({ kind: "error", text: `${v.sku}: enter a whole number of 0 or more.` });
    if (n < (v.inventory?.quantityReserved ?? 0) && !confirm(`${v.inventory?.quantityReserved} unit(s) are reserved by open orders. Set on-hand below that anyway?`)) return;
    const body = reason === "COUNT" ? { set: n, note: "Stock count" } : { delta: n - onHand, reason };
    return run(() => api(`/api/admin/variants/${v.id}/inventory`, { method: "POST", json: body }), `${v.sku}: stock updated to ${n}.`);
  };
  const saveVariant = () => {
    const priceMinor = price.trim() === "" ? null : Math.round(Number(price.replace(",", ".")) * 100);
    return run(() => api(`/api/admin/variants/${v.id}`, { method: "PATCH", json: { priceMinor, lowStockThreshold: Number(threshold) || 0 } }), `${v.sku} saved.`);
  };
  const toggleActive = () => run(() => api(`/api/admin/variants/${v.id}`, { method: "PATCH", json: { isActive: !v.isActive } }), `${v.sku} ${v.isActive ? "hidden from" : "shown in"} the store.`);
  const remove = () => confirm(`Remove ${v.sku}? If it has been ordered it will be hidden instead.`) && run(() => api(`/api/admin/variants/${v.id}`, { method: "DELETE" }), `${v.sku} removed.`);
  const loadHistory = async () => setHistory(history ? null : (await api<{ items: NonNullable<typeof history> }>(`/api/admin/variants/${v.id}/inventory/movements`)).items);

  return (
    <>
      <tr className={`border-b border-line last:border-0 ${v.isActive ? "" : "bg-paper text-mute"}`}>
        <td className="px-4 py-2.5 font-medium">{v.size.label}</td>
        <td className="px-4 py-2.5 font-mono text-micro">{v.sku}</td>
        <td className="px-4 py-2.5">
          <div className="relative w-28">
            <input aria-label={`Price override for ${v.sku}`} inputMode="decimal" value={price} disabled={!write || busy} placeholder={(productPrice / 100).toFixed(2)} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} className={`${inputCls} h-8 pl-6 tabular-nums`} />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-micro text-mute">€</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <input aria-label={`On hand for ${v.sku}`} type="number" min={0} value={count} disabled={!stock || busy} onChange={(e) => setCount(e.target.value)} className={`${inputCls} h-8 w-20 tabular-nums`} />
            {stockDirty && (
              <>
                <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className={`${inputCls} h-8 w-auto`}>
                  {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button type="button" className={`${btn.primary} h-8`} disabled={busy} onClick={saveStock}>Update</button>
              </>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-mute">{v.inventory?.quantityReserved ?? 0}</td>
        <td className="px-4 py-2.5 tabular-nums">{v.available}{low && <span className="ml-2"><Badge value={v.available <= 0 ? "Sold out" : "Low"} tone={v.available <= 0 ? "bad" : "warn"} /></span>}</td>
        <td className="px-4 py-2.5">
          <input aria-label={`Low-stock alert level for ${v.sku}`} type="number" min={0} value={threshold} disabled={!write || busy} onChange={(e) => setThreshold(e.target.value)} className={`${inputCls} h-8 w-16 tabular-nums`} />
        </td>
        <td className="px-4 py-2.5">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink" checked={v.isActive} disabled={!write || busy} onChange={toggleActive} /><span className="sr-only">Show {v.sku} in the store</span></label>
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-3">
            {priceDirty && write && <button type="button" className={`${btn.primary} h-8`} disabled={busy} onClick={saveVariant}>Save</button>}
            <button type="button" className={btn.link} onClick={loadHistory} aria-expanded={!!history}>History</button>
            {write && <button type="button" className="text-small text-mute hover:text-claret" onClick={remove} aria-label={`Remove ${v.sku}`}>Remove</button>}
          </div>
        </td>
      </tr>
      {history && (
        <tr className="border-b border-line bg-paper">
          <td colSpan={9} className="px-4 py-3">
            {history.length === 0 ? <p className="text-micro text-mute">No stock movements yet.</p> : (
              <table className="w-full text-micro">
                <tbody>
                  {history.slice(0, 20).map((m) => (
                    <tr key={m.id}>
                      <td className="py-1 pr-4 text-mute">{when(m.createdAt)}</td>
                      <td className="py-1 pr-4">{m.reason.toLowerCase().replace(/_/g, " ")}</td>
                      <td className="py-1 pr-4 tabular-nums">{m.deltaOnHand > 0 ? "+" : ""}{m.deltaOnHand} on hand{m.deltaReserved ? ` · ${m.deltaReserved > 0 ? "+" : ""}${m.deltaReserved} reserved` : ""}</td>
                      <td className="py-1 pr-4 text-mute">{m.note ?? ""}</td>
                      <td className="py-1 text-mute">{m.actor?.email ?? "system"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────────── Photos ───────────── */

function Photos({ product, colors, onChange }: { product: Product; colors: Taxonomy["colors"]; onChange: () => Promise<void> }) {
  const { can } = useAdmin();
  const write = can("catalog:write");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const usedColors = colors.filter((c) => product.variants.some((v) => v.colorId === c.id));

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await onChange();
      if (ok) setMsg({ kind: "success", text: ok });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList) {
    const fd = new FormData();
    for (const f of Array.from(files).slice(0, 12)) fd.append("images", f);
    await run(() => api(`/api/admin/products/${product.id}/images`, { method: "POST", body: fd }), `${files.length} photo${files.length === 1 ? "" : "s"} uploaded.`);
    if (fileRef.current) fileRef.current.value = "";
  }

  const move = (i: number, d: -1 | 1) => {
    const ids = product.images.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    return run(() => api(`/api/admin/products/${product.id}/images/order`, { method: "PUT", json: { imageIds: ids } }));
  };

  return (
    <div className="space-y-5">
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {write && (
        <div
          className="flex flex-col items-center justify-center gap-3 border border-dashed border-ink/25 bg-white px-6 py-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" id="photo-upload" onChange={(e) => e.target.files?.length && upload(e.target.files)} />
          <label htmlFor="photo-upload" className={`${btn.primary} cursor-pointer`}>{busy ? "Working…" : "Upload photos"}</label>
          <p className="text-micro text-mute">Or drop files here · JPEG, PNG, WebP or AVIF · up to 12 at once · shortest edge at least 600px (1600px+ recommended, 4:5 portrait). Location and camera data are removed automatically.</p>
        </div>
      )}
      {product.images.length === 0 ? (
        <p className="text-small text-mute">No photos yet. The first photo is the one shown in listings.</p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {product.images.map((img, i) => <PhotoCard key={img.id} img={img} index={i} count={product.images.length} colors={usedColors} write={write} busy={busy} onMove={move} run={run} />)}
        </ol>
      )}
    </div>
  );
}

function PhotoCard({ img, index, count, colors, write, busy, onMove, run }: { img: Image; index: number; count: number; colors: Taxonomy["colors"]; write: boolean; busy: boolean; onMove: (i: number, d: -1 | 1) => unknown; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [alt, setAlt] = useState(img.altText ?? "");
  const patch = (json: Record<string, unknown>) => run(() => api(`/api/admin/images/${img.id}`, { method: "PATCH", json }));
  return (
    <li className="border border-line bg-white">
      <div className="relative aspect-[4/5] bg-sand">
        {img.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.altText ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="placeholder-photo flex h-full items-center justify-center text-micro uppercase tracking-widest text-mute">Placeholder image</div>
        )}
        {index === 0 && <span className="absolute left-2 top-2 bg-ink px-2 py-0.5 text-micro text-paper">Cover</span>}
      </div>
      <div className="space-y-2 p-3">
        <label className="block">
          <span className="mb-1 block text-micro text-mute">Description for screen readers</span>
          <input value={alt} disabled={!write || busy} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt !== (img.altText ?? "") && patch({ altText: alt || null })} className={`${inputCls} h-8`} />
        </label>
        <div className="flex gap-2">
          <select aria-label="Colourway" value={img.colorId ?? ""} disabled={!write || busy} onChange={(e) => patch({ colorId: e.target.value ? Number(e.target.value) : null })} className={`${inputCls} h-8`}>
            <option value="">All colours</option>
            {colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Photo type" value={img.kind} disabled={!write || busy} onChange={(e) => patch({ kind: e.target.value })} className={`${inputCls} h-8`}>
            {[["PRODUCT", "Product"], ["ALTERNATE", "Alternate"], ["DETAIL", "Detail"], ["LIFESTYLE", "On model"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {write && (
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-1">
              <button type="button" className={`${btn.secondary} h-8 px-2.5`} disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label="Move earlier">←</button>
              <button type="button" className={`${btn.secondary} h-8 px-2.5`} disabled={busy || index === count - 1} onClick={() => onMove(index, 1)} aria-label="Move later">→</button>
            </div>
            <button type="button" className="text-small text-mute hover:text-claret" disabled={busy} onClick={() => confirm("Delete this photo?") && run(() => api(`/api/admin/images/${img.id}`, { method: "DELETE" }), "Photo deleted.")}>Delete</button>
          </div>
        )}
        {img.width && <p className="text-micro text-mute">{img.width}×{img.height}px</p>}
      </div>
    </li>
  );
}
