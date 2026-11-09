"use client";

import { Fragment, Suspense, useState } from "react";
import { PageHeader, Pager, Select, Table, useListParams } from "@/components/admin/ui";
import { useAdminData, when } from "@/lib/admin/session";

interface Row { id: number; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown; ipAddress: string | null; createdAt: string; actor: { id: number; email: string } | null }

const TYPES: [string, string][] = [["", "Everything"], ["product", "Products"], ["variant", "Variants & stock"], ["order", "Orders"], ["coupon", "Discount codes"], ["settings", "Settings"], ["user", "Staff"], ["customer", "Customers"], ["category", "Categories"], ["heroSlide", "Hero slides"], ["collection", "Collections"]];

export default function AuditPage() {
  return <Suspense><Audit /></Suspense>;
}

function Audit() {
  const lp = useListParams();
  const page = Number(lp.get("page") || 1);
  const { data } = useAdminData<{ items: Row[]; total: number; pageSize: number }>(`/api/admin/audit?${lp.query}`);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHeader title="Activity log" subtitle="Every change made in the admin, who made it and when. Entries can't be edited or deleted." />
      <div className="mb-4"><Select label="Show" value={lp.get("entityType")} onChange={(entityType) => lp.set({ entityType })} options={TYPES} /></div>
      <Table head={["When", "Who", "What", "Record", ""]} empty="No activity recorded.">
        {data?.items.map((r) => (
          <Fragment key={r.id}>
            <tr>
              <td className="whitespace-nowrap text-mute">{when(r.createdAt)}</td>
              <td>{r.actor?.email ?? <span className="text-mute">system</span>}</td>
              <td className="font-mono text-micro">{r.action}</td>
              <td className="text-mute">{r.entityType}{r.entityId ? ` #${r.entityId}` : ""}</td>
              <td className="text-right">{(r.before != null || r.after != null) && <button type="button" className="text-small underline underline-offset-2" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Details"}</button>}</td>
            </tr>
            {open === r.id && (
              <tr className="bg-paper">
                <td colSpan={5}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(["before", "after"] as const).map((k) => (
                      <div key={k}>
                        <p className="mb-1 text-micro text-mute">{k === "before" ? "Before" : "After"}</p>
                        <pre className="max-h-72 overflow-auto border border-line bg-white p-3 text-[11px] leading-4">{r[k] == null ? "—" : JSON.stringify(r[k], null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                  {r.ipAddress && <p className="mt-2 text-micro text-mute">From {r.ipAddress}</p>}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </Table>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => lp.set({ page: String(p) })} />}
    </>
  );
}
