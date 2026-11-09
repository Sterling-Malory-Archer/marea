"use client";

import Link from "next/link";
import { Badge, PageHeader, Pager, SearchBox, Select, Table, useListParams } from "@/components/admin/ui";
import { eur, useAdminData, when } from "@/lib/admin/session";

interface Row { orderNumber: string; placedAt: string; email: string; customerFirstName: string; customerLastName: string; status: string; paymentStatus: string; paymentMethod: string; totalMinor: number; shippingCountry: string; _count: { items: number } }

const STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED", "REFUNDED"];

export default function OrdersPage() {
  const lp = useListParams();
  const page = Number(lp.get("page") || 1);
  const qs = new URLSearchParams({ page: String(page), pageSize: "25", ...(lp.get("q") && { q: lp.get("q") }), ...(lp.get("status") && { status: lp.get("status") }) });
  const { data } = useAdminData<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/admin/orders?${qs}`);
  return (
    <>
      <PageHeader title="Orders" subtitle="Search by order number, e-mail, surname, phone or SKU." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={lp.get("q")} onSearch={(q) => lp.set({ q })} placeholder="Search orders" />
        <Select label="Status" value={lp.get("status")} onChange={(status) => lp.set({ status })} options={[["", "All"], ...STATUSES.map((s): [string, string] => [s, s.replace(/_/g, " ").toLowerCase()])]} />
      </div>
      <Table head={["Order", "Placed", "Customer", "Items", "Payment", "Status", "Total"]} empty="No orders match.">
        {data?.items.map((o) => (
          <tr key={o.orderNumber} className="hover:bg-paper">
            <td><Link href={`/admin/orders/${o.orderNumber}`} className="font-medium underline underline-offset-2">{o.orderNumber}</Link></td>
            <td className="whitespace-nowrap text-ink/75">{when(o.placedAt)}</td>
            <td>{o.customerFirstName} {o.customerLastName}<div className="text-micro text-mute">{o.email} · {o.shippingCountry}</div></td>
            <td className="tabular-nums">{o._count.items}</td>
            <td><Badge value={o.paymentStatus} /><div className="mt-1 text-micro text-mute">{o.paymentMethod === "CASH_ON_DELIVERY" ? "Cash on delivery" : "Card"}</div></td>
            <td><Badge value={o.status} /></td>
            <td className="tabular-nums">{eur(o.totalMinor)}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => lp.set({ page: String(p) })} />}
    </>
  );
}
