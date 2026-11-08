import type { Prisma } from "@marea/db";
import type { Storage } from "../storage/storage.js";
import { discountPercent } from "../../lib/util.js";
import { localize, tr, type Locale } from "../../lib/i18n.js";

/** Everything a storefront product card needs, in one query shape. */
export const productCardInclude = (locale: Locale) =>
  ({
    brand: { select: { name: true, slug: true } },
    translations: tr(locale),
    images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 2 },
    variants: {
      where: { isActive: true },
      select: {
        color: { select: { id: true, name: true, slug: true, hex: true, sortOrder: true, translations: tr(locale) } },
        inventory: { select: { quantityOnHand: true, quantityReserved: true, allowBackorder: true } },
      },
    },
  }) satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productCardInclude> }>;

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
  const p = localize(row, ["title"] as const);
  const colors = new Map<number, { name: string; slug: string; hex: string; sortOrder: number }>();
  let inStock = false;
  for (const v of row.variants) {
    const c = localize(v.color, ["name"] as const);
    colors.set(c.id, c);
    const inv = v.inventory;
    if (inv && (inv.allowBackorder || inv.quantityOnHand - inv.quantityReserved > 0)) inStock = true;
  }
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand: row.brand,
    currency: p.currency,
    priceMinor: p.priceMinor,
    compareAtPriceMinor: p.compareAtPriceMinor,
    discountPercent: discountPercent(p.priceMinor, p.compareAtPriceMinor),
    isOnSale: p.isOnSale,
    isNewArrival: p.isNewArrival,
    inStock,
    colors: [...colors.values()].sort((a, b) => a.sortOrder - b.sortOrder).map(({ name, slug, hex }) => ({ name, slug, hex })),
    images: row.images.map((img) => ({
      url: img.isPlaceholder ? null : storage.publicUrl(img.storageKey),
      // Alt text follows the localized title so screen readers hear the page language.
      alt: p.title,
      width: img.width,
      height: img.height,
      isPlaceholder: img.isPlaceholder,
    })),
  };
}
