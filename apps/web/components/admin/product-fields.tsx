"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/store";
import type { FieldDef } from "./form";

export interface Taxonomy {
  brands: { id: number; name: string }[];
  categories: { id: number; name: string; path: string; depth: number }[];
  collections: { id: number; title: string }[];
  scales: { id: number; name: string; code: string; sizes: { id: number; label: string }[] }[];
  colors: { id: number; name: string; hex: string; slug: string }[];
}

/** Everything a product form needs to offer as choices. */
export function useTaxonomy() {
  const [t, setT] = useState<Taxonomy | null>(null);
  useEffect(() => {
    Promise.all([
      api<{ items: Taxonomy["brands"] }>("/api/admin/brands"),
      api<{ items: Taxonomy["categories"] }>("/api/admin/categories"),
      api<{ items: Taxonomy["collections"] }>("/api/admin/collections"),
      api<{ items: Taxonomy["scales"] }>("/api/admin/size-scales"),
      api<{ items: Taxonomy["colors"] }>("/api/admin/colors"),
    ]).then(([b, c, col, s, co]) => setT({ brands: b.items, categories: [...c.items].sort((a, z) => a.path.localeCompare(z.path)), collections: col.items, scales: s.items, colors: co.items }));
  }, []);
  return t;
}

/** "Women › Knitwear" — unambiguous when several departments share a subcategory name. */
function pathLabels(cats: Taxonomy["categories"]) {
  const byPath = new Map(cats.map((c) => [c.path, c.name]));
  return (c: Taxonomy["categories"][number]) =>
    c.path.split("/").map((_, i, parts) => byPath.get(parts.slice(0, i + 1).join("/")) ?? parts[i]).join(" › ");
}

export function productFields(t: Taxonomy, opts: { hasVariants?: boolean } = {}): FieldDef[] {
  const indent = pathLabels(t.categories);
  return [
    { name: "title", label: "Product name", type: "text", required: true, maxLength: 200 },
    { name: "reference", label: "Reference", type: "text", required: true, half: true, help: "Your style code, e.g. KN-104. Used to build SKUs.", maxLength: 64 },
    { name: "slug", label: "URL", type: "slug", half: true, help: "Leave empty to generate from the name." },
    { name: "subtitle", label: "Short line under the name", type: "text", nullable: true, maxLength: 200 },
    { name: "brandId", label: "Brand", type: "select", nullable: true, half: true, options: t.brands.map((b) => [b.id, b.name]) },
    { name: "sizeScaleId", label: "Size system", type: "select", required: true, half: true, options: t.scales.map((s) => [s.id, s.name]), disabled: opts.hasVariants, help: opts.hasVariants ? "Fixed once variants exist." : "Which sizes this product comes in." },
    { name: "priceMinor", label: "Price (incl. VAT)", type: "money", required: true, half: true },
    { name: "compareAtPriceMinor", label: "Original price", type: "money", nullable: true, half: true, help: "Set to show the item as reduced; must be higher than the price." },
    { name: "primaryCategoryId", label: "Main category", type: "select", nullable: true, options: t.categories.map((c) => [c.id, indent(c)]), help: "Decides the breadcrumb and where the product appears first." },
    { name: "categoryIds", label: "Also show in", type: "multi", help: "The main category is always included.", options: t.categories.map((c) => [c.id, indent(c)]) },
    { name: "collectionIds", label: "Collections", type: "multi", options: t.collections.map((c) => [c.id, c.title]) },
    { name: "isNewArrival", label: "Show in New arrivals", type: "bool" },
    { name: "description", label: "Description", type: "textarea", nullable: true, rows: 6 },
    { name: "composition", label: "Composition", type: "textarea", nullable: true, rows: 2, placeholder: "e.g. 100% organic cotton" },
    { name: "care", label: "Care", type: "textarea", nullable: true, rows: 2, placeholder: "e.g. Machine wash 30°C" },
    { name: "seoTitle", label: "Search title", type: "text", nullable: true, maxLength: 160, help: "Optional. Defaults to the product name." },
    { name: "seoDescription", label: "Search description", type: "textarea", nullable: true, rows: 2, maxLength: 320 },
  ];
}
