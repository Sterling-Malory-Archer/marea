"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Badge, btn, Card, errorText, inputCls, Notice, PageHeader } from "@/components/admin/ui";
import { useAdmin, useAdminData } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface P { id: number; title: string; reference: string; status: string }
interface Collection { id: number; title: string; slug: string; products: { product: P }[] }

/** Choose and order the products in a collection (order = order on the collection page). */
export default function CollectionProducts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdmin();
  const write = can("content:write");
  const { data } = useAdminData<Collection>(`/api/admin/collections/${id}`);
  const [list, setList] = useState<P[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<P[]>([]);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data && !dirty) setList(data.products.map((p) => p.product));
  }, [data, dirty]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api<{ items: P[] }>(`/api/admin/products?pageSize=10&q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.items)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const update = (next: P[]) => {
    setList(next);
    setDirty(true);
    setMsg(null);
  };
  const move = (i: number, d: -1 | 1) => {
    if (!list) return;
    const n = [...list];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    update(n);
  };

  async function save() {
    if (!list) return;
    setBusy(true);
    try {
      await api(`/api/admin/collections/${id}/products`, { method: "PUT", json: { productIds: list.map((p) => p.id) } });
      setDirty(false);
      setMsg({ kind: "success", text: "Collection saved." });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!data || !list) return <p className="text-small text-mute">Loading…</p>;
  const inList = new Set(list.map((p) => p.id));

  return (
    <>
      <p className="mb-2 text-micro"><Link href="/admin/content?tab=collections" className="text-mute hover:text-ink">← Collections</Link></p>
      <PageHeader
        title={data.title}
        subtitle={`${list.length} product${list.length === 1 ? "" : "s"} · shown in this order on /collections/${data.slug}. Only active products appear in the store.`}
        actions={write && <button type="button" className={btn.primary} onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save order"}</button>}
      />
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ol className="border border-line bg-white">
          {list.length === 0 && <li className="px-4 py-10 text-center text-small text-mute">No products yet — find some on the right.</li>}
          {list.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <span className="w-6 text-right text-micro tabular-nums text-mute">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/products/${p.id}`} className="text-small hover:underline">{p.title}</Link>
                <div className="font-mono text-micro text-mute">{p.reference}</div>
              </div>
              {p.status !== "ACTIVE" && <Badge value={p.status} />}
              {write && (
                <div className="flex gap-1">
                  <button type="button" className={`${btn.secondary} h-8 px-2.5`} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.title} up`}>↑</button>
                  <button type="button" className={`${btn.secondary} h-8 px-2.5`} disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p.title} down`}>↓</button>
                  <button type="button" className="px-2 text-mute hover:text-claret" onClick={() => update(list.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.title}`}>×</button>
                </div>
              )}
            </li>
          ))}
        </ol>
        {write && (
          <Card title="Add products">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, reference or SKU" aria-label="Search products" className={inputCls} />
            <ul className="mt-3 space-y-1">
              {results.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-small">
                  <span className="min-w-0 truncate">{p.title} <span className="font-mono text-micro text-mute">{p.reference}</span></span>
                  {inList.has(p.id) ? <span className="text-micro text-mute">Added</span> : <button type="button" className={btn.link} onClick={() => update([...list, p])}>Add</button>}
                </li>
              ))}
              {q.trim().length >= 2 && results.length === 0 && <li className="text-micro text-mute">No matches.</li>}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
