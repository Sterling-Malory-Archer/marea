"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Badge, btn, PageHeader, Pager, SearchBox, Select, Table, useListParams } from "@/components/admin/ui";
import { eur, useAdmin, useAdminData } from "@/lib/admin/session";

interface Row {
  id: number; reference: string; title: string; status: string; priceMinor: number; compareAtPriceMinor: number | null;
  brand: { name: string } | null; primaryCategory: { name: string; path: string } | null;
  thumbnail: { url: string | null; isPlaceholder: boolean; altText: string | null } | null;
  variantCount: number; available: number; lowStockVariants: number;
}

export default function ProductsPage() {
  return <Suspense><Products /></Suspense>;
}

function Products() {
  const { can } = useAdmin();
  const lp = useListParams();
  const page = Number(lp.get("page") || 1);
  const { data, error } = useAdminData<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/admin/products?${lp.query}`);

  return (
    <>
      <PageHeader title="Products" subtitle={data ? `${data.total} product${data.total === 1 ? "" : "s"}` : " "} actions={can("catalog:write") && <Link href="/admin/products/new" className={btn.primary}>New product</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={lp.get("q")} onSearch={(q) => lp.set({ q })} placeholder="Search title, reference or SKU" />
        <Select label="Status" value={lp.get("status")} onChange={(status) => lp.set({ status })} options={[["", "All"], ["ACTIVE", "Active"], ["DRAFT", "Draft"], ["ARCHIVED", "Archived"]]} />
        <label className="flex items-center gap-2 text-small">
          <input type="checkbox" className="size-4 accent-ink" checked={lp.get("lowStock") === "true"} onChange={(e) => lp.set({ lowStock: e.target.checked ? "true" : null })} />
          Low stock only
        </label>
      </div>
      {error && <p className="mb-4 text-small text-claret">{error}</p>}
      <Table head={["", "Product", "Status", "Category", "Price", "Variants", "Available"]} empty="No products match.">
        {data?.items.map((p) => (
          <tr key={p.id} className="hover:bg-paper">
            <td className="w-14">
              <div className="h-14 w-11 overflow-hidden bg-sand">
                {p.thumbnail?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnail.url} alt="" className="h-full w-full object-cover" />
                ) : p.thumbnail?.isPlaceholder ? (
                  <span className="flex h-full items-center justify-center text-[9px] uppercase tracking-wide text-mute">Placeholder</span>
                ) : null}
              </div>
            </td>
            <td>
              <Link href={`/admin/products/${p.id}`} className="underline-offset-2 hover:underline">{p.title}</Link>
              <div className="font-mono text-micro text-mute">{p.reference}{p.brand ? ` · ${p.brand.name}` : ""}</div>
            </td>
            <td><Badge value={p.status} /></td>
            <td className="text-mute">{p.primaryCategory?.path.replace(/\//g, " / ") ?? "—"}</td>
            <td className="tabular-nums">
              {eur(p.priceMinor)}
              {p.compareAtPriceMinor && <div className="text-micro text-mute line-through">{eur(p.compareAtPriceMinor)}</div>}
            </td>
            <td className="tabular-nums">{p.variantCount}</td>
            <td className="tabular-nums">
              {p.available}
              {p.lowStockVariants > 0 && <div><Badge value={`${p.lowStockVariants} low`} tone="warn" /></div>}
            </td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => lp.set({ page: String(p) })} />}
    </>
  );
}
