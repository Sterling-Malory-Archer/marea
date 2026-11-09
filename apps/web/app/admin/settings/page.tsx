"use client";

import { Card, PageHeader } from "@/components/admin/ui";
import { EntityForm, type FieldDef } from "@/components/admin/form";
import { useAdmin, useAdminData } from "@/lib/admin/session";
import { api } from "@/lib/store";

type Values = Record<string, unknown>;
const text = (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: "text", emptyValue: "", ...extra });

const SECTIONS: { title: string; intro?: string; fields: FieldDef[] }[] = [
  {
    title: "Store",
    fields: [
      text("store.name", "Store name", { half: true, required: true }),
      text("store.instagramUrl", "Instagram link", { half: true, placeholder: "https://instagram.com/…" }),
      text("store.tagline", "Tagline (English)", { half: true }),
      text("store.tagline.me", "Tagline (Montenegrin)", { half: true }),
      text("store.supportEmail", "Customer service e-mail", { type: "email", half: true, help: "Shown in the footer and in order e-mails." }),
      text("store.supportPhone", "Customer service phone", { half: true, placeholder: "+382 …" }),
    ],
  },
  {
    title: "Company details",
    intro: "Printed on order confirmations and packing slips. These documents are not fiscal invoices — fiscal receipts come from your fiscalisation system.",
    fields: [
      text("company.name", "Legal name", { half: true, placeholder: "e.g. MAREA d.o.o." }),
      text("company.taxId", "Tax ID (PIB)", { half: true }),
      text("company.registrationNo", "Registration number", { half: true }),
      { name: "company.address", label: "Registered address", type: "textarea", rows: 2, emptyValue: "" },
    ],
  },
  {
    title: "Checkout",
    fields: [
      { name: "checkout.codEnabled", label: "Offer cash on delivery", type: "bool", help: "Only on delivery methods that allow it." },
      { name: "checkout.cardEnabled", label: "Offer card payment", type: "bool", help: "Takes effect once a card payment provider is connected (not yet)." },
      { name: "tax.vatRateBps", label: "VAT rate", type: "percent", half: true, help: "Prices are entered including VAT; this is used to show the VAT share." },
      { name: "returns.days", label: "Return period (days)", type: "number", half: true },
    ],
  },
  {
    title: "Stock",
    fields: [
      { name: "inventory.codStockCommit", label: "Cash on delivery orders take stock", type: "select", required: true, half: true, options: [["order", "When the order is placed"], ["shipment", "When the order ships"]], help: "Either way the items are held for the customer immediately." },
      { name: "inventory.reservationMinutes", label: "Hold stock for unpaid card orders (minutes)", type: "number", half: true },
    ],
  },
  {
    title: "Notifications",
    fields: [text("notifications.orderEmail", "Send new-order alerts to", { type: "email", help: "A shared inbox for the team. Leave empty to turn alerts off." })],
  },
];

export default function SettingsPage() {
  const { can } = useAdmin();
  const { data, setData } = useAdminData<{ values: Values; payments: { cardProviderConnected: boolean } }>("/api/admin/settings");
  const write = can("settings:write");

  return (
    <>
      <PageHeader title="Settings" subtitle={write ? "Each section saves on its own." : "You can view settings; an owner or admin can change them."} />
      {data && !data.payments.cardProviderConnected && (
        <p className="mb-6 max-w-3xl border-l-2 border-line bg-white px-4 py-3 text-small text-mute">Card payments aren't connected yet. Until a payment provider is chosen and configured, checkout offers cash on delivery only.</p>
      )}
      <div className="max-w-3xl space-y-6">
        {data ? SECTIONS.map((s) => (
          <Card key={s.title} title={s.title}>
            {s.intro && <p className="mb-4 text-small text-mute">{s.intro}</p>}
            <EntityForm
              fields={s.fields}
              initial={data.values}
              readOnly={!write}
              onSubmit={async (payload) => {
                const r = await api<{ values: Values }>("/api/admin/settings", { method: "PATCH", json: payload });
                setData({ ...data, values: r.values });
              }}
            />
          </Card>
        )) : <p className="text-small text-mute">Loading…</p>}
      </div>
    </>
  );
}
