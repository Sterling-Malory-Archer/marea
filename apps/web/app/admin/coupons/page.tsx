"use client";

import { Badge, PageHeader } from "@/components/admin/ui";
import { ResourceManager, type FieldDef } from "@/components/admin/form";
import { eur, useAdmin, useAdminData, when } from "@/lib/admin/session";

interface Coupon {
  id: number; code: string; description: string | null; type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING"; value: number;
  minSubtotalMinor: number | null; maxDiscountMinor: number | null; appliesToSaleItems: boolean; usageLimit: number | null; usageLimitPerCustomer: number | null;
  timesRedeemed: number; startsAt: string | null; endsAt: string | null; isActive: boolean; _count: { redemptions: number };
}

const FIELDS: FieldDef[] = [
  { name: "code", label: "Code", type: "text", required: true, half: true, help: "What customers type at checkout. Letters, numbers, - and _." },
  { name: "type", label: "Discount", type: "select", required: true, half: true, options: [["PERCENTAGE", "Percentage off"], ["FIXED_AMOUNT", "Amount off"], ["FREE_SHIPPING", "Free delivery"]] },
  { name: "value", label: "Value", type: "money", typeFrom: (v) => (v.type === "PERCENTAGE" ? "percent" : "money"), required: true, half: true, show: (v) => v.type !== "FREE_SHIPPING" },
  { name: "maxDiscountMinor", label: "Maximum discount", type: "money", nullable: true, half: true, show: (v) => v.type === "PERCENTAGE", help: "Optional cap per order." },
  { name: "minSubtotalMinor", label: "Minimum order", type: "money", nullable: true, half: true, help: "Optional. Bag total before discount." },
  { name: "appliesToSaleItems", label: "Also applies to reduced items", type: "bool", help: "Off: the discount is only calculated on full-price items." },
  { name: "usageLimit", label: "Total uses allowed", type: "number", nullable: true, half: true, help: "Empty = unlimited." },
  { name: "usageLimitPerCustomer", label: "Uses per customer", type: "number", nullable: true, half: true, help: "Counted by e-mail address." },
  { name: "startsAt", label: "Starts", type: "datetime", nullable: true, half: true },
  { name: "endsAt", label: "Ends", type: "datetime", nullable: true, half: true },
  { name: "description", label: "Internal note", type: "text", nullable: true, help: "Only visible to staff — e.g. which campaign it belongs to." },
  { name: "isActive", label: "Active", type: "bool" },
];

function valueLabel(c: Coupon) {
  if (c.type === "FREE_SHIPPING") return "Free delivery";
  if (c.type === "PERCENTAGE") return `${c.value / 100}% off${c.maxDiscountMinor ? ` (max ${eur(c.maxDiscountMinor)})` : ""}`;
  return `${eur(c.value)} off`;
}

function state(c: Coupon): [string, "good" | "neutral" | "warn" | "bad"] {
  const now = Date.now();
  if (!c.isActive) return ["Inactive", "neutral"];
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return ["Expired", "neutral"];
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return ["Scheduled", "warn"];
  if (c.usageLimit != null && c.timesRedeemed >= c.usageLimit) return ["Used up", "neutral"];
  return ["Active", "good"];
}

export default function CouponsPage() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Coupon[] }>("/api/admin/coupons");
  return (
    <>
      <PageHeader title="Discount codes" subtitle="Codes customers enter in the bag or at checkout. One code per order." />
      {data?.items.some((c) => c.code.startsWith("DEMO")) && (
        <p className="mb-4 border-l-2 border-[#6B4A00] bg-[#FBF6EA] px-4 py-3 text-small">A demo code (DEMO…) exists from the sample data — delete or deactivate it before launch.</p>
      )}
      <ResourceManager<Coupon>
        noun="discount code"
        rows={data?.items ?? null}
        canWrite={can("coupons:write")}
        onChanged={reload}
        fields={FIELDS}
        newDefaults={{ type: "PERCENTAGE", isActive: true, appliesToSaleItems: false }}
        createPath="/api/admin/coupons"
        patchPath={(r) => `/api/admin/coupons/${r.id}`}
        deletePath={(r) => `/api/admin/coupons/${r.id}`}
        deleteHint="Codes that have been used can only be deactivated."
        columns={[
          { header: "Code", render: (c) => <><span className="font-mono">{c.code}</span>{c.description && <div className="text-micro text-mute">{c.description}</div>}</> },
          { header: "Discount", render: valueLabel },
          { header: "Conditions", render: (c) => <span className="text-mute">{[c.minSubtotalMinor ? `Min ${eur(c.minSubtotalMinor)}` : null, c.appliesToSaleItems ? "incl. sale" : "full price only", c.usageLimitPerCustomer ? `${c.usageLimitPerCustomer}× per customer` : null].filter(Boolean).join(" · ")}</span> },
          { header: "Used", render: (c) => <span className="tabular-nums">{c.timesRedeemed}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</span> },
          { header: "Valid", render: (c) => <span className="text-micro text-mute">{c.startsAt || c.endsAt ? `${c.startsAt ? when(c.startsAt, false) : "now"} – ${c.endsAt ? when(c.endsAt, false) : "open"}` : "Always"}</span> },
          { header: "Status", render: (c) => { const [l, t] = state(c); return <Badge value={l} tone={t} />; } },
        ]}
      />
    </>
  );
}
