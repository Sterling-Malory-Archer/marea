"use client";

import { Badge, PageHeader } from "@/components/admin/ui";
import { ResourceManager, YesNo, type FieldDef } from "@/components/admin/form";
import { countryName } from "@/components/admin/ui";
import { eur, useAdmin, useAdminData } from "@/lib/admin/session";

interface Method { id: number; code: string; name: string; description: string | null; priceMinor: number; freeOverMinor: number | null; minDays: number | null; maxDays: number | null; allowsCashOnDelivery: boolean; isActive: boolean; sortOrder: number }
interface Zone { id: number; name: string; countryCodes: string[]; isActive: boolean; methods: Method[] }

const ZONE_FIELDS: FieldDef[] = [
  { name: "name", label: "Zone name", type: "text", required: true },
  { name: "countryCodes", label: "Countries", type: "codes", required: true, help: "Two-letter codes separated by commas, e.g. ME, RS, BA, HR. A country should belong to one zone only." },
  { name: "isActive", label: "Deliver to this zone", type: "bool" },
];

const METHOD_FIELDS: FieldDef[] = [
  { name: "name", label: "Name shown at checkout", type: "text", required: true, half: true },
  { name: "code", label: "Code", type: "slug", required: true, half: true, help: "Internal, e.g. standard." },
  { name: "description", label: "Short description", type: "text", nullable: true },
  { name: "priceMinor", label: "Price", type: "money", required: true, half: true },
  { name: "freeOverMinor", label: "Free from", type: "money", nullable: true, half: true, help: "Bag total after discounts. Empty = never free." },
  { name: "minDays", label: "Delivery from (working days)", type: "number", nullable: true, half: true },
  { name: "maxDays", label: "Delivery to (working days)", type: "number", nullable: true, half: true },
  { name: "allowsCashOnDelivery", label: "Cash on delivery available", type: "bool" },
  { name: "isActive", label: "Offered at checkout", type: "bool", half: true },
  { name: "sortOrder", label: "Order", type: "number", half: true },
];

function days(m: Method) {
  if (m.minDays == null && m.maxDays == null) return "—";
  const lo = m.minDays ?? m.maxDays!, hi = m.maxDays ?? m.minDays!;
  return lo === hi ? `${lo} working day${lo === 1 ? "" : "s"}` : `${lo}–${hi} working days`;
}

export default function ShippingPage() {
  const { can } = useAdmin();
  const write = can("settings:write");
  const { data, reload } = useAdminData<{ items: Zone[] }>("/api/admin/shipping");

  return (
    <>
      <PageHeader title="Delivery" subtitle="Where you deliver, what it costs and how long it takes. Prices include VAT." />
      <ResourceManager<Zone>
        title="Zones"
        noun="zone"
        rows={data?.items ?? null}
        canWrite={write}
        onChanged={reload}
        fields={ZONE_FIELDS}
        newDefaults={{ isActive: true }}
        createPath="/api/admin/shipping/zones"
        patchPath={(z) => `/api/admin/shipping/zones/${z.id}`}
        columns={[
          { header: "Zone", render: (z) => z.name },
          { header: "Countries", render: (z) => <span className="text-mute">{z.countryCodes.map(countryName).join(", ")}</span> },
          { header: "Methods", render: (z) => <span className="tabular-nums">{z.methods.filter((m) => m.isActive).length}</span> },
          { header: "Status", render: (z) => <Badge value={z.isActive ? "Active" : "Off"} tone={z.isActive ? "good" : "neutral"} /> },
        ]}
      />
      {data?.items.map((z) => (
        <ResourceManager<Method>
          key={z.id}
          title={`${z.name} — delivery methods`}
          noun="method"
          rows={z.methods}
          canWrite={write}
          onChanged={reload}
          fields={METHOD_FIELDS}
          newDefaults={{ isActive: true, allowsCashOnDelivery: true, sortOrder: z.methods.length }}
          createPath={`/api/admin/shipping/zones/${z.id}/methods`}
          patchPath={(m) => `/api/admin/shipping/methods/${m.id}`}
          empty="No methods — customers in this zone can't check out."
          columns={[
            { header: "Method", render: (m) => <>{m.name}<div className="text-micro text-mute">{m.description}</div></> },
            { header: "Price", render: (m) => <span className="tabular-nums">{m.priceMinor === 0 ? "Free" : eur(m.priceMinor)}</span> },
            { header: "Free from", render: (m) => <span className="tabular-nums">{m.freeOverMinor != null ? eur(m.freeOverMinor) : "—"}</span> },
            { header: "Delivery time", render: (m) => days(m) },
            { header: "Cash on delivery", render: (m) => <YesNo value={m.allowsCashOnDelivery} /> },
            { header: "Status", render: (m) => <Badge value={m.isActive ? "Offered" : "Off"} tone={m.isActive ? "good" : "neutral"} /> },
          ]}
        />
      ))}
    </>
  );
}
