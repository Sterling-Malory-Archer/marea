"use client";

import Link from "next/link";
import { useState } from "react";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { Badge, Card, PageHeader, Select, Stat, Table } from "@/components/admin/ui";
import { eur, useAdminData, when } from "@/lib/admin/session";

interface Dashboard {
  totals: { salesMinor: number; orders: number; averageOrderMinor: number; newCustomers: number; toFulfil: number; previous: { salesMinor: number; orders: number } };
  revenueByDay: { date: string; salesMinor: number; orders: number }[];
  recentOrders: { orderNumber: string; placedAt: string; customerFirstName: string; customerLastName: string; status: string; totalMinor: number }[];
  bestsellers: { productId: number; title: string; units: number; revenueMinor: number }[];
  lowStock: { variantId: number; productId: number; sku: string; title: string; size: string; color: string; available: number; threshold: number }[];
}

const change = (now: number, prev: number) => {
  if (!prev) return now ? "New this period" : "No change";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous period`;
};

interface Checklist { items: { key: string; ok: boolean; label: string; detail: string | null; href: string | null }[]; done: number; total: number }

/** Shown until every launch item is done; then it disappears. */
function LaunchChecklist() {
  const { data } = useAdminData<Checklist>("/api/admin/dashboard/launch-checklist");
  const [open, setOpen] = useState(true);
  if (!data || data.done === data.total) return null;
  return (
    <section className="mb-6 border border-line bg-white" aria-labelledby="launch-title">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span>
          <span id="launch-title" className="font-medium">Before launch</span>
          <span className="ml-3 text-small text-mute">{data.done} of {data.total} done</span>
        </span>
        <span aria-hidden className="text-mute">{open ? "−" : "+"}</span>
      </button>
      <div className="mx-5 h-1 bg-sand" aria-hidden><div className="h-1 bg-ink" style={{ width: `${(data.done / data.total) * 100}%` }} /></div>
      {open && (
        <ul className="divide-y divide-line px-5 pb-2 pt-3">
          {data.items.map((i) => (
            <li key={i.key} className="flex items-start gap-3 py-2.5 text-small">
              <span aria-hidden className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${i.ok ? "border-ink bg-ink text-paper" : "border-ink/30"}`}>{i.ok ? "✓" : ""}</span>
              <span className="sr-only">{i.ok ? "Done:" : "To do:"}</span>
              <span className="flex-1">
                <span className={i.ok ? "text-mute line-through decoration-ink/20" : ""}>{i.label}</span>
                {!i.ok && i.detail && <span className="block text-micro text-mute">{i.detail}</span>}
              </span>
              {!i.ok && i.href && <Link href={i.href} className="text-small underline underline-offset-2">Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [days, setDays] = useState("30");
  const { data } = useAdminData<Dashboard>(`/api/admin/dashboard?days=${days}`);
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Sales count orders that are paid, being prepared, shipped or delivered (cash on delivery counts when placed)."
        actions={<Select label="Period" value={days} onChange={setDays} options={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]]} />}
      />
      <LaunchChecklist />
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total sales" value={eur(data.totals.salesMinor)} sub={change(data.totals.salesMinor, data.totals.previous.salesMinor)} />
            <Stat label="Orders" value={String(data.totals.orders)} sub={change(data.totals.orders, data.totals.previous.orders)} />
            <Stat label="Average order value" value={eur(data.totals.averageOrderMinor)} />
            <Stat label="To fulfil now" value={String(data.totals.toFulfil)} sub={`${data.totals.newCustomers} new customer account${data.totals.newCustomers === 1 ? "" : "s"}`} />
          </div>
          <Card title="Revenue per day">
            <RevenueChart data={data.revenueByDay} />
          </Card>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Recent orders" actions={<Link href="/admin/orders" className="text-small underline underline-offset-2">All orders</Link>}>
              <Table head={["Order", "Customer", "Status", "Total"]} empty="No orders yet.">
                {data.recentOrders.map((o) => (
                  <tr key={o.orderNumber}>
                    <td><Link href={`/admin/orders/${o.orderNumber}`} className="underline underline-offset-2">{o.orderNumber}</Link><div className="text-micro text-mute">{when(o.placedAt)}</div></td>
                    <td>{o.customerFirstName} {o.customerLastName}</td>
                    <td><Badge value={o.status} /></td>
                    <td className="tabular-nums">{eur(o.totalMinor)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Bestsellers">
              <Table head={["Product", "Units", "Revenue"]} empty="No sales in this period.">
                {data.bestsellers.map((b) => (
                  <tr key={b.productId}>
                    <td><Link href={`/admin/products/${b.productId}`} className="underline underline-offset-2">{b.title}</Link></td>
                    <td className="tabular-nums">{b.units}</td>
                    <td className="tabular-nums">{eur(b.revenueMinor)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
          <Card title="Low stock" actions={<Link href="/admin/products?lowStock=true" className="text-small underline underline-offset-2">All low-stock products</Link>}>
            <Table head={["Product", "Variant", "SKU", "Available"]} empty="Nothing is running low.">
              {data.lowStock.map((l) => (
                <tr key={l.variantId}>
                  <td><Link href={`/admin/products/${l.productId}`} className="underline underline-offset-2">{l.title}</Link></td>
                  <td>{l.color} / {l.size}</td>
                  <td className="font-mono text-micro">{l.sku}</td>
                  <td>{l.available <= 0 ? <Badge value="Sold out" tone="bad" /> : <Badge value={`${l.available} left`} tone="warn" />}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
