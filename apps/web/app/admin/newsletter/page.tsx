"use client";

import { Suspense, useState } from "react";
import { Badge, btn, errorText, Notice, PageHeader, Pager, SearchBox, Select, Table, useListParams } from "@/components/admin/ui";
import { useAdmin, useAdminData, when } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Row { id: number; email: string; status: string; source: string | null; consentAt: string | null; createdAt: string; unsubscribedAt: string | null }

export default function NewsletterPage() {
  return <Suspense><Newsletter /></Suspense>;
}

function Newsletter() {
  const { can } = useAdmin();
  const lp = useListParams();
  const page = Number(lp.get("page") || 1);
  const { data, reload } = useAdminData<{ items: Row[]; total: number; subscribed: number; pageSize: number }>(`/api/admin/newsletter?${lp.query}`);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function unsubscribe(r: Row) {
    if (!confirm(`Unsubscribe ${r.email}?`)) return;
    try {
      await api(`/api/admin/newsletter/${r.id}/unsubscribe`, { method: "POST" });
      await reload();
      setMsg({ kind: "success", text: `${r.email} unsubscribed.` });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    }
  }

  return (
    <>
      <PageHeader
        title="Newsletter"
        subtitle={data ? `${data.subscribed} subscribed` : " "}
        actions={<a href="/api/admin/newsletter/export.csv" className={btn.secondary} download>Export subscribers (CSV)</a>}
      />
      <p className="mb-4 max-w-3xl text-small text-mute">Sign-ups from the footer form, with the consent text and time recorded. The export contains only active subscribers — import it into your e-mail tool and keep it private.</p>
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={lp.get("q")} onSearch={(q) => lp.set({ q })} placeholder="Search e-mail" />
        <Select label="Status" value={lp.get("status")} onChange={(status) => lp.set({ status })} options={[["", "All"], ["SUBSCRIBED", "Subscribed"], ["PENDING", "Pending"], ["UNSUBSCRIBED", "Unsubscribed"]]} />
      </div>
      <Table head={["E-mail", "Status", "Source", "Consent given", ""]} empty="No sign-ups yet.">
        {data?.items.map((r) => (
          <tr key={r.id}>
            <td>{r.email}</td>
            <td><Badge value={r.status} /></td>
            <td className="text-mute">{r.source ?? "—"}</td>
            <td className="text-mute">{when(r.consentAt ?? r.createdAt)}</td>
            <td className="text-right">{can("customers:write") && r.status !== "UNSUBSCRIBED" && <button type="button" className={btn.link} onClick={() => unsubscribe(r)}>Unsubscribe</button>}</td>
          </tr>
        ))}
      </Table>
      {data && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => lp.set({ page: String(p) })} />}
    </>
  );
}
