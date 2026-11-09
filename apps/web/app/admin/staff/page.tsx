"use client";

import { useState } from "react";
import { Badge, btn, Card, errorText, inputCls, Notice, PageHeader, Table, humanize } from "@/components/admin/ui";
import { useAdmin, useAdminData, when } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Member { id: number; email: string; firstName: string | null; lastName: string | null; role: string; status: string; lastLoginAt: string | null; createdAt: string }
interface Data { items: Member[]; roles: { role: string; permissions: string[] }[] }

const ROLE_HELP: Record<string, string> = {
  CONTENT_EDITOR: "Homepage, banners, collections and translations.",
  CATALOG_MANAGER: "Products, stock, categories and photos.",
  ORDER_MANAGER: "Orders, shipping updates and customers.",
  ADMIN: "Everything except managing owners.",
  OWNER: "Full access, including staff and owners.",
};

export default function StaffPage() {
  const { user } = useAdmin();
  const { data, reload } = useAdminData<Data>("/api/admin/staff");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "ORDER_MANAGER" });
  const [busy, setBusy] = useState(false);
  const roles = (data?.roles ?? []).filter((r) => r.role !== "OWNER" || user?.role === "OWNER");

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

  return (
    <>
      <PageHeader title="Staff" subtitle="Who can sign in to this admin, and what they can do." />
      {msg && <Notice kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Table head={["Name", "Role", "Status", "Last sign-in", ""]}>
          {data?.items.map((m) => {
            const me = m.id === user?.id;
            const locked = me || (m.role === "OWNER" && user?.role !== "OWNER");
            return (
              <tr key={m.id}>
                <td>{[m.firstName, m.lastName].filter(Boolean).join(" ") || "—"}{me && <span className="ml-2 text-micro text-mute">(you)</span>}<div className="text-micro text-mute">{m.email}</div></td>
                <td>
                  {locked ? humanize(m.role) : (
                    <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy} onChange={(e) => confirm(`Change ${m.email} to ${humanize(e.target.value)}? They will be signed out.`) && run(() => api(`/api/admin/staff/${m.id}`, { method: "PATCH", json: { role: e.target.value } }), "Role changed.")} className={`${inputCls} h-8 w-auto`}>
                      {roles.map((r) => <option key={r.role} value={r.role}>{humanize(r.role)}</option>)}
                    </select>
                  )}
                </td>
                <td><Badge value={m.status} />{!m.lastLoginAt && m.status === "ACTIVE" && <span className="ml-2 text-micro text-mute">invited</span>}</td>
                <td className="text-mute">{when(m.lastLoginAt)}</td>
                <td className="text-right">
                  {!locked && (m.status === "ACTIVE"
                    ? <button type="button" className="text-small text-mute hover:text-claret" disabled={busy} onClick={() => confirm(`Remove access for ${m.email}?`) && run(() => api(`/api/admin/staff/${m.id}`, { method: "PATCH", json: { status: "DISABLED" } }), "Access removed.")}>Remove access</button>
                    : <button type="button" className={btn.link} disabled={busy} onClick={() => run(() => api(`/api/admin/staff/${m.id}`, { method: "PATCH", json: { status: "ACTIVE" } }), "Access restored.")}>Restore access</button>)}
                </td>
              </tr>
            );
          })}
        </Table>
        <Card title="Invite a team member">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api("/api/admin/staff", { method: "POST", json: form }), `Invitation sent to ${form.email}. The link to choose a password is valid for 1 hour.`).then(() => setForm({ ...form, email: "", firstName: "", lastName: "" }));
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="text-small"><span className="mb-1.5 block text-micro text-mute">First name</span><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputCls} /></label>
              <label className="text-small"><span className="mb-1.5 block text-micro text-mute">Last name</span><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputCls} /></label>
            </div>
            <label className="block text-small"><span className="mb-1.5 block text-micro text-mute">Work e-mail</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></label>
            <fieldset>
              <legend className="mb-1.5 text-micro text-mute">Role</legend>
              <div className="space-y-2">
                {roles.map((r) => (
                  <label key={r.role} className="flex items-start gap-2 text-small">
                    <input type="radio" name="role" value={r.role} checked={form.role === r.role} onChange={() => setForm({ ...form, role: r.role })} className="mt-1 accent-ink" />
                    <span>{humanize(r.role)}<span className="block text-micro text-mute">{ROLE_HELP[r.role]}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className={btn.primary} disabled={busy}>Send invitation</button>
            <p className="text-micro text-mute">They choose their own password from the e-mailed link. Nobody else ever sees it.</p>
          </form>
        </Card>
      </div>
    </>
  );
}
