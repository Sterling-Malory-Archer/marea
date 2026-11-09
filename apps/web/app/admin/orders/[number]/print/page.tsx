"use client";

import { useSearchParams } from "next/navigation";
import { use } from "react";
import { countryName } from "@/components/admin/ui";
import { eur, useAdminData, when } from "@/lib/admin/session";

interface Order {
  orderNumber: string; placedAt: string; paymentMethod: string; email: string; phone: string | null; customerNote: string | null;
  shippingAddress: Record<string, string | null>; billingAddress: Record<string, string | null> | null; shippingMethodName: string; couponCode: string | null;
  subtotalMinor: number; discountMinor: number; shippingMinor: number; taxMinor: number; totalMinor: number;
  items: { id: number; sku: string; productTitle: string; colorName: string; sizeLabel: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
}
interface Settings { values: Record<string, string | number | boolean | null> }

/** Printable A4 documents. The order document is NOT a fiscal invoice (Montenegro requires fiscalised invoices). */
export default function PrintPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const doc = useSearchParams().get("doc") === "packing" ? "packing" : "order";
  const { data: o } = useAdminData<Order>(`/api/admin/orders/${encodeURIComponent(number)}`);
  const { data: s } = useAdminData<Settings>("/api/admin/settings");
  if (!o || !s) return null;
  const v = s.values;
  const addr = (a: Record<string, string | null>) => [`${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(), a.company, a.line1, a.line2, `${a.postalCode ?? ""} ${a.city ?? ""}`.trim(), countryName(a.countryCode), a.phone].filter(Boolean);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[11pt] text-ink print:p-0">
      <style>{`@page { size: A4; margin: 14mm } @media print { .no-print { display: none } body { background: white } }`}</style>
      <div className="no-print mb-6 flex gap-3">
        <button type="button" onClick={() => window.print()} className="bg-ink px-4 py-2 text-small text-paper">Print</button>
        <button type="button" onClick={() => window.close()} className="border border-line px-4 py-2 text-small">Close</button>
      </div>
      <header className="flex items-start justify-between gap-8 border-b border-ink pb-6">
        <div>
          <p className="wordmark text-2xl">{String(v["store.name"] ?? "MAREA")}</p>
          <p className="mt-3 whitespace-pre-line text-[9pt] leading-snug text-ink/75">
            {[v["company.name"], v["company.address"], v["company.taxId"] && `PIB ${v["company.taxId"]}`, v["company.registrationNo"] && `Reg. no. ${v["company.registrationNo"]}`, v["store.supportEmail"]].filter(Boolean).join("\n") || "Add company details in Settings"}
          </p>
        </div>
        <div className="text-right">
          <h1 className="text-[16pt]">{doc === "packing" ? "Packing slip" : "Order confirmation"}</h1>
          <p className="mt-1 text-[10pt]">{o.orderNumber}</p>
          <p className="text-[9pt] text-ink/70">{when(o.placedAt)}</p>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-8 text-[10pt]">
        <div>
          <h2 className="mb-1 text-[9pt] uppercase tracking-wide text-ink/60">Deliver to</h2>
          {addr(o.shippingAddress).map((l) => <p key={l}>{l}</p>)}
        </div>
        <div>
          <h2 className="mb-1 text-[9pt] uppercase tracking-wide text-ink/60">{o.billingAddress ? "Bill to" : "Customer"}</h2>
          {(o.billingAddress ? addr(o.billingAddress) : [o.email, o.phone].filter(Boolean)).map((l) => <p key={l as string}>{l}</p>)}
          <p className="mt-2 text-[9pt] text-ink/70">{o.shippingMethodName} · {o.paymentMethod === "CASH_ON_DELIVERY" ? "Cash on delivery" : "Card"}</p>
        </div>
      </section>

      <table className="mt-8 w-full border-collapse text-[10pt]">
        <thead>
          <tr className="border-b border-ink text-left text-[9pt] text-ink/70">
            {doc === "packing" && <th className="w-8 py-2 font-normal">✓</th>}
            <th className="py-2 font-normal">Item</th><th className="py-2 font-normal">SKU</th><th className="py-2 text-right font-normal">Qty</th>
            {doc === "order" && <><th className="py-2 text-right font-normal">Price</th><th className="py-2 text-right font-normal">Total</th></>}
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-line">
              {doc === "packing" && <td className="py-2"><span className="inline-block h-3.5 w-3.5 border border-ink" /></td>}
              <td className="py-2">{i.productTitle}<br /><span className="text-[9pt] text-ink/70">{i.colorName} / {i.sizeLabel}</span></td>
              <td className="py-2 font-mono text-[9pt]">{i.sku}</td>
              <td className="py-2 text-right">{i.quantity}</td>
              {doc === "order" && <><td className="py-2 text-right">{eur(i.unitPriceMinor)}</td><td className="py-2 text-right">{eur(i.lineTotalMinor)}</td></>}
            </tr>
          ))}
        </tbody>
      </table>

      {doc === "order" ? (
        <div className="ml-auto mt-6 w-72 space-y-1 text-[10pt]">
          <div className="flex justify-between"><span>Subtotal</span><span>{eur(o.subtotalMinor)}</span></div>
          {o.discountMinor > 0 && <div className="flex justify-between"><span>Discount {o.couponCode && `(${o.couponCode})`}</span><span>−{eur(o.discountMinor)}</span></div>}
          <div className="flex justify-between"><span>Delivery</span><span>{eur(o.shippingMinor)}</span></div>
          <div className="flex justify-between border-t border-ink pt-1 font-medium"><span>Total</span><span>{eur(o.totalMinor)}</span></div>
          <div className="flex justify-between text-[9pt] text-ink/70"><span>VAT included</span><span>{eur(o.taxMinor)}</span></div>
        </div>
      ) : (
        o.customerNote && <p className="mt-6 border-l-2 border-ink pl-3 text-[10pt]">Customer note: {o.customerNote}</p>
      )}

      <footer className="mt-12 border-t border-line pt-4 text-[8.5pt] text-ink/60">
        {doc === "order"
          ? "This order confirmation is not a fiscal invoice. The fiscal invoice is issued separately through the fiscalisation system."
          : `Thank you for shopping with ${String(v["store.name"] ?? "us")}. Exchanges within ${String(v["returns.days"] ?? 14)} days of delivery.`}
      </footer>
    </div>
  );
}
