"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Badge, btn, Card, countryName, errorText, inputCls, Notice, PageHeader, Table } from "@/components/admin/ui";
import { eur, useAdmin, useAdminData, when } from "@/lib/admin/session";
import { api } from "@/lib/store";

interface Order {
  orderNumber: string; placedAt: string; status: string; paymentStatus: string; fulfillmentStatus: string; paymentMethod: string; currency: string; locale: string;
  email: string; phone: string | null; customerFirstName: string; customerLastName: string; customerNote: string | null;
  shippingAddress: Record<string, string | null>; shippingMethodName: string; couponCode: string | null;
  subtotalMinor: number; discountMinor: number; shippingMinor: number; taxMinor: number; totalMinor: number; refundedMinor: number;
  items: { id: number; sku: string; productTitle: string; brandName: string | null; colorName: string; sizeLabel: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; productId: number | null }[];
  payments: { id: number; provider: string; status: string; amountMinor: number; createdAt: string }[];
  shipments: { id: number; carrier: string; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null }[];
  events: { id: number; fromStatus: string | null; toStatus: string | null; message: string | null; isInternal: boolean; createdAt: string; actorUserId: number | null }[];
  inventoryMovements: { variantId: number; reason: string; deltaOnHand: number; deltaReserved: number; createdAt: string }[];
  user: { id: number; email: string } | null;
  allowedTransitions: string[];
}

const ACTION_LABEL: Record<string, string> = { PAID: "Mark paid", PROCESSING: "Start preparing", SHIPPED: "Mark shipped", DELIVERED: "Mark delivered", CANCELLED: "Cancel order", FAILED: "Mark failed", REFUNDED: "Record refund" };
const CARRIERS = ["Pošta Crne Gore", "City Express", "DHL Express", "Other"];

export default function OrderDetail({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const { can } = useAdmin();
  const { data: o, reload } = useAdminData<Order>(`/api/admin/orders/${encodeURIComponent(number)}`);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [ship, setShip] = useState({ carrier: CARRIERS[0]!, other: "", trackingNumber: "", trackingUrl: "" });
  const write = can("orders:write");

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "success", text: ok });
      await reload();
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const transition = (status: string) => {
    if (status === "CANCELLED" && !window.confirm("Cancel this order? Stock is returned and the customer is e-mailed (if notification is on).")) return;
    if (status === "REFUNDED" && !window.confirm("Record that this order's money was returned to the customer? This doesn't move money by itself.")) return;
    void run(() => api(`/api/admin/orders/${number}/status`, { method: "POST", json: { status, message: note || undefined, notifyCustomer: notify } }), `Order marked ${status.replace("_", " ").toLowerCase()}.`).then(() => setNote(""));
  };

  if (!o) return <PageHeader title={`Order ${number}`} />;
  const a = o.shippingAddress;

  return (
    <>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        subtitle={<>Placed {when(o.placedAt)} · e-mails in {o.locale === "me" ? "Montenegrin" : "English"}</>}
        actions={
          <>
            <Link href={`/admin/orders/${o.orderNumber}/print?doc=order`} target="_blank" className={btn.secondary}>Print order</Link>
            <Link href={`/admin/orders/${o.orderNumber}/print?doc=packing`} target="_blank" className={btn.secondary}>Packing slip</Link>
          </>
        }
      />
      <Notice kind={msg?.kind ?? "info"} onClose={() => setMsg(null)}>{msg?.text}</Notice>
      <div className="mb-6 flex flex-wrap gap-2"><Badge value={o.status} /><Badge value={o.paymentStatus} /><Badge value={`Fulfilment: ${o.fulfillmentStatus}`} tone="neutral" /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Table head={["Item", "SKU", "Qty", "Price", "Total"]}>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td>{i.productId ? <Link href={`/admin/products/${i.productId}`} className="underline underline-offset-2">{i.productTitle}</Link> : i.productTitle}<div className="text-micro text-mute">{i.brandName ? `${i.brandName} · ` : ""}{i.colorName} / {i.sizeLabel}</div></td>
                <td className="font-mono text-micro">{i.sku}</td>
                <td className="tabular-nums">{i.quantity}</td>
                <td className="tabular-nums">{eur(i.unitPriceMinor)}</td>
                <td className="tabular-nums">{eur(i.lineTotalMinor)}</td>
              </tr>
            ))}
          </Table>
          <Card title="Totals">
            <dl className="grid max-w-sm grid-cols-2 gap-y-1.5 text-small">
              <dt>Subtotal</dt><dd className="text-right tabular-nums">{eur(o.subtotalMinor)}</dd>
              {o.discountMinor > 0 && <><dt>Discount {o.couponCode && `(${o.couponCode})`}</dt><dd className="text-right tabular-nums">−{eur(o.discountMinor)}</dd></>}
              <dt>Delivery — {o.shippingMethodName}</dt><dd className="text-right tabular-nums">{eur(o.shippingMinor)}</dd>
              <dt className="font-medium">Total</dt><dd className="text-right font-medium tabular-nums">{eur(o.totalMinor)}</dd>
              <dt className="text-mute">of which VAT</dt><dd className="text-right tabular-nums text-mute">{eur(o.taxMinor)}</dd>
              {o.refundedMinor > 0 && <><dt className="text-claret">Refunded</dt><dd className="text-right tabular-nums text-claret">{eur(o.refundedMinor)}</dd></>}
            </dl>
          </Card>
          <Card title="Timeline">
            <ol className="space-y-3 text-small">
              {o.events.map((e) => (
                <li key={e.id} className="flex gap-4">
                  <span className="w-36 shrink-0 text-micro text-mute">{when(e.createdAt)}</span>
                  <span>{e.toStatus ? <Badge value={e.toStatus} /> : <Badge value="Note" tone="neutral" />} {e.message}{e.isInternal && <span className="ml-2 text-micro text-mute">(internal)</span>}</span>
                </li>
              ))}
            </ol>
          </Card>
          <details className="border border-line bg-white p-5 text-small">
            <summary className="cursor-pointer">Stock movements for this order</summary>
            <ul className="mt-3 space-y-1 font-mono text-micro">
              {o.inventoryMovements.map((m, i) => <li key={i}>{when(m.createdAt)} · variant {m.variantId} · {m.reason} · on hand {m.deltaOnHand >= 0 ? "+" : ""}{m.deltaOnHand} · reserved {m.deltaReserved >= 0 ? "+" : ""}{m.deltaReserved}</li>)}
            </ul>
          </details>
        </div>

        <div className="space-y-6">
          {write && (
            <Card title="Update status">
              {o.allowedTransitions.length === 0 ? (
                <p className="text-small text-mute">This order is closed — no further status changes.</p>
              ) : (
                <div className="space-y-3">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message for the timeline (optional)" rows={2} className={`${inputCls} h-auto py-2`} />
                  <label className="flex items-center gap-2 text-small"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-ink" /> E-mail the customer</label>
                  <div className="flex flex-wrap gap-2">
                    {o.allowedTransitions.filter((s) => !(s === "REFUNDED" && o.paymentMethod === "CARD")).map((s) => (
                      <button key={s} type="button" disabled={busy} onClick={() => transition(s)} className={s === "CANCELLED" || s === "FAILED" ? btn.danger : btn.primary}>{ACTION_LABEL[s] ?? s}</button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          {write && ["PROCESSING", "PAID", "SHIPPED"].includes(o.status) && (
            <Card title={o.shipments.length ? "Add another parcel" : "Ship with tracking"}>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const carrier = ship.carrier === "Other" ? ship.other.trim() : ship.carrier;
                  if (!carrier) return setMsg({ kind: "error", text: "Enter the carrier name." });
                  void run(() => api(`/api/admin/orders/${number}/shipments`, { method: "POST", json: { carrier, trackingNumber: ship.trackingNumber || undefined, trackingUrl: ship.trackingUrl || undefined, notifyCustomer: notify } }), "Shipment saved.");
                }}
              >
                <select value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} className={inputCls} aria-label="Carrier">{CARRIERS.map((c) => <option key={c}>{c}</option>)}</select>
                {ship.carrier === "Other" && <input value={ship.other} onChange={(e) => setShip({ ...ship, other: e.target.value })} placeholder="Carrier name" aria-label="Carrier name" className={inputCls} />}
                <input value={ship.trackingNumber} onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })} placeholder="Tracking number" aria-label="Tracking number" className={inputCls} />
                <input value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} placeholder="Tracking link (https://…)" aria-label="Tracking link" className={inputCls} type="url" />
                <button type="submit" disabled={busy} className={btn.primary}>{o.status === "SHIPPED" ? "Add parcel" : "Save and mark shipped"}</button>
              </form>
            </Card>
          )}
          <Card title="Customer">
            <p className="text-small">{o.customerFirstName} {o.customerLastName}</p>
            <p className="text-small"><a href={`mailto:${o.email}`} className="underline underline-offset-2">{o.email}</a></p>
            {o.phone && <p className="text-small">{o.phone}</p>}
            <p className="mt-2 text-micro text-mute">{o.user ? <Link href={`/admin/customers/${o.user.id}`} className="underline">Registered customer</Link> : "Guest checkout"}</p>
            {o.customerNote && <p className="mt-3 border-l-2 border-line pl-3 text-small italic">“{o.customerNote}”</p>}
          </Card>
          <Card title="Delivery address">
            <address className="text-small not-italic leading-6">{a.firstName} {a.lastName}<br />{a.company && <>{a.company}<br /></>}{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.postalCode} {a.city}<br />{countryName(a.countryCode)}{a.phone && <><br />{a.phone}</>}</address>
          </Card>
          <Card title="Payment & shipments">
            <ul className="space-y-2 text-small">
              {o.payments.map((p) => <li key={p.id}>{p.provider === "CASH_ON_DELIVERY" ? "Cash on delivery" : p.provider} — {eur(p.amountMinor)} <Badge value={p.status} /></li>)}
              {o.shipments.map((s) => <li key={s.id}>{s.carrier} {s.trackingNumber} {s.trackingUrl && <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline">track</a>} <Badge value={s.status} /></li>)}
            </ul>
          </Card>
          {write && (
            <Card title="Internal note">
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(() => api(`/api/admin/orders/${number}/notes`, { method: "POST", json: { message: note.trim() } }), "Note added.").then(() => setNote("")); }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} h-auto py-2`} placeholder="Only staff can see this" />
                <button type="submit" disabled={busy || !note.trim()} className={btn.secondary}>Add note</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
