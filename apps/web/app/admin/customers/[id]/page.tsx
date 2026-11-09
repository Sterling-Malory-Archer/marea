"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Badge, btn, Card, countryName, errorText, inputCls, Notice, PageHeader, Stat, Table } from "@/components/admin/ui";
import { eur, useAdmin, useAdminData, when } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Customer {
  id: number; email: string; firstName: string | null; lastName: string | null; phone: string | null; status: string; locale: string;
  emailVerifiedAt: string | null; marketingOptIn: boolean; createdAt: string; lastLoginAt: string | null; deletionRequestedAt: string | null; lifetimeValueMinor: number;
  addresses: { id: number; label: string | null; firstName: string; lastName: string; line1: string; line2: string | null; city: string; postalCode: string; countryCode: string; phone: string | null; isDefaultShipping: boolean }[];
  orders: { orderNumber: string; placedAt: string; status: string; totalMinor: number }[];
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdmin();
  const { data: c, error, reload } = useAdminData<Customer>(`/api/admin/customers/${id}`);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const write = can("customers:write");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg({ kind: "success", text: ok });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!c) return <p className="text-small text-mute">Loading…</p>;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <>
      <p className="mb-2 text-micro"><Link href="/admin/customers" className="text-mute hover:text-ink">← Customers</Link></p>
      <PageHeader
        title={name}
        subtitle={<>{c.email} · joined {when(c.createdAt, false)} · prefers {c.locale === "me" ? "Montenegrin" : "English"}</>}
        actions={write && c.status !== "DELETION_REQUESTED" && (
          c.status === "ACTIVE"
            ? <button type="button" className={btn.danger} disabled={busy} onClick={() => confirm("Disable this account? The customer is signed out and can't sign in until you enable it again.") && run(() => api(`/api/admin/customers/${c.id}`, { method: "PATCH", json: { status: "DISABLED" } }), "Account disabled.")}>Disable account</button>
            : <button type="button" className={btn.secondary} disabled={busy} onClick={() => run(() => api(`/api/admin/customers/${c.id}`, { method: "PATCH", json: { status: "ACTIVE" } }), "Account enabled.")}>Enable account</button>
        )}
      />
      <div className="mb-5 flex gap-2"><Badge value={c.status} />{c.emailVerifiedAt ? <Badge value="E-mail verified" tone="good" /> : <Badge value="Not verified" tone="neutral" />}{c.marketingOptIn && <Badge value="Newsletter" tone="info" />}</div>
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      {c.status === "DELETION_REQUESTED" && (
        <Card title="Deletion request" className="mb-6 border-claret/40">
          <p className="text-small">The customer asked to delete their account on {when(c.deletionRequestedAt)}. Anonymising removes their name, contact details, addresses, wishlist and newsletter subscription. Orders are kept for accounting, with the details printed on them.</p>
          {write && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-small"><span className="mb-1.5 block text-micro text-mute">Type ANONYMISE to confirm</span><input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${inputCls} w-48`} /></label>
              <button type="button" className={btn.danger} disabled={busy || confirmText !== "ANONYMISE"} onClick={() => run(() => api(`/api/admin/customers/${c.id}/anonymise`, { method: "POST", json: { confirm: true } }), "Personal data erased.")}>Anonymise account</button>
            </div>
          )}
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={String(c.orders.length)} />
        <Stat label="Total spent" value={eur(c.lifetimeValueMinor)} sub="Paid, processing, shipped and delivered" />
        <Stat label="Last sign-in" value={c.lastLoginAt ? when(c.lastLoginAt, false) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="mb-3 text-lead font-medium">Orders</h2>
          <Table head={["Order", "Placed", "Status", "Total"]} empty="No orders yet.">
            {c.orders.map((o) => (
              <tr key={o.orderNumber}>
                <td><Link href={`/admin/orders/${o.orderNumber}`} className="font-mono underline-offset-2 hover:underline">{o.orderNumber}</Link></td>
                <td className="text-mute">{when(o.placedAt)}</td>
                <td><Badge value={o.status} /></td>
                <td className="tabular-nums">{eur(o.totalMinor)}</td>
              </tr>
            ))}
          </Table>
        </section>
        <aside className="space-y-6">
          <Card title="Contact">
            <p className="text-small">{c.email}</p>
            <p className="text-small">{c.phone ?? <span className="text-mute">No phone</span>}</p>
          </Card>
          <Card title={`Addresses (${c.addresses.length})`}>
            {c.addresses.length === 0 ? <p className="text-small text-mute">None saved.</p> : (
              <ul className="space-y-4">
                {c.addresses.map((a) => (
                  <li key={a.id} className="text-small leading-6">
                    {a.isDefaultShipping && <span className="mb-1 block text-micro text-mute">Default delivery</span>}
                    {a.firstName} {a.lastName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.postalCode} {a.city}, {countryName(a.countryCode)}{a.phone && <><br />{a.phone}</>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
