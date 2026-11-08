import type { Prisma } from "@marea/db";
import type { Storage } from "../storage/storage.js";
import { discountPercent } from "../../lib/util.js";

/** Everything a storefront product card needs, in one query shape. */
export const productCardInclude = {
  brand: { select: { name: true, slug: true } },
  images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 2 },
  variants: {
    where: { isActive: true },
    select: {
      color: { select: { id: true, name: true, slug: true, hex: true, sortOrder: true } },
      inventory: { select: { quantityOnHand: true, quantityReserved: true, allowBackorder: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

export interface ProductCard {
  id: number;
  slug: string;
  title: string;
  brand: { name: string; slug: string } | null;
  currency: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  discountPercent: number | null;
  isOnSale: boolean;
  isNewArrival: boolean;
  inStock: boolean;
  colors: { name: string; slug: string; hex: string }[];
  images: { url: string | null; alt: string; width: number | null; height: number | null; isPlaceholder: boolean }[];
}

export function toProductCard(row: CardRow, storage: Storage): ProductCard {
  const colors = new Map<number, { name: string; slug: string; hex: string; sortOrder: number }>();
  let inStock = false;
  for (const v of row.variants) {
    colors.set(v.color.id, v.color);
    const inv = v.inventory;
    if (inv && (inv.allowBackorder || inv.quantityOnHand - inv.quantityReserved > 0)) inStock = true;
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    currency: row.currency,
    priceMinor: row.priceMinor,
    compareAtPriceMinor: row.compareAtPriceMinor,
    discountPercent: discountPercent(row.priceMinor, row.compareAtPriceMinor),
    isOnSale: row.isOnSale,
    isNewArrival: row.isNewArrival,
    inStock,
    colors: [...colors.values()].sort((a, b) => a.sortOrder - b.sortOrder).map(({ sortOrder: _s, ...c }) => c),
    images: row.images.map((img) => ({
      url: img.isPlaceholder ? null : storage.publicUrl(img.storageKey),
      alt: img.altText ?? row.title,
      width: img.width,
      height: img.height,
      isPlaceholder: img.isPlaceholder,
    })),
  };
}
