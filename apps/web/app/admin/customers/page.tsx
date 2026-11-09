"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Badge, PageHeader, Pager, SearchBox, Select, Table, useListParams } from "@/components/admin/ui";
import { useAdminData, when } from "@/lib/admin/session";

interface Row { id: number; email: string; firstName: string | null; lastName: string | null; phone: string | null; status: string; emailVerifiedAt: string | null; marketingOptIn: boolean; createdAt: string; lastLoginAt: string | null; orderCount: number }

export default function CustomersPage() {
  return <Suspense><Customers /></Suspense>;
}

function Customers() {
  const lp = useListParams();
  const page = Number(lp.get("page") || 1);
  const { data } = useAdminData<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/customers?${lp.query}`);
  return (
    <>
      <PageHeader title="Customers" subtitle="Registered accounts. Guest orders are found under Orders." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={lp.get("q")} onSearch={(q) => lp.set({ q })} placeholder="Search name, e-mail or phone" />
        <Select label="Status" value={lp.get("status")} onChange={(status) => lp.set({ status })} options={[["", "All"], ["ACTIVE", "Active"], ["DISABLED", "Disabled"], ["DELETION_REQUESTED", "Deletion requested"]]} />
      </div>
      <Table head={["Customer", "Status", "Orders", "Newsletter", "Joined", "Last sign-in"]} empty="No customers match.">
        {data?.items.map((c) => (
          <tr key={c.id} className="hover:bg-paper">
            <td>
              <Link href={`/admin/customers/${c.id}`} className="underline-offset-2 hover:underline">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Link>
              <div className="text-micro text-mute">{c.email}{!c.emailVerifiedAt && " · not verified"}</div>
            </td>
            <td><Badge value={c.status} /></td>
            <td className="tabular-nums">{c.orderCount}</td>
            <td>{c.marketingOptIn ? "Yes" : <span className="text-mute">No</span>}</td>
            <td className="text-mute">{when(c.createdAt, false)}</td>
            <td className="text-mute">{when(c.lastLoginAt)}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => lp.set({ page: String(p) })} />}
    </>
  );
}
