"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, PageHeader } from "@/components/admin/ui";
import { EntityForm } from "@/components/admin/form";
import { productFields, useTaxonomy } from "@/components/admin/product-fields";
import { api } from "@/lib/store";

export default function NewProduct() {
  const t = useTaxonomy();
  const router = useRouter();
  return (
    <>
      <PageHeader title="New product" subtitle={<>Saved as a draft. Add sizes, stock and photos next, then publish. <Link href="/admin/products" className="underline underline-offset-2">Back to products</Link></>} />
      <div className="max-w-3xl">
        <Card>
          {t ? (
            <EntityForm
              fields={productFields(t)}
              initial={{ sizeScaleId: t.scales[0]?.id, isNewArrival: true }}
              submitLabel="Create draft"
              onSubmit={async (payload) => {
                const p = await api<{ id: number }>("/api/admin/products", { method: "POST", json: payload });
                router.push(`/admin/products/${p.id}?created=1`);
              }}
            />
          ) : (
            <p className="text-small text-mute">Loading…</p>
          )}
        </Card>
      </div>
    </>
  );
}
