"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMoney, productHref, tint } from "@/lib/format";
import type { ProductCard as Card } from "@/lib/types";
import { useWishlist } from "@/lib/wishlist";
import { HeartIcon } from "./icons";
import { Placeholder } from "./placeholder";

const MAX_SWATCHES = 4;

function Frame({ img, colorHex, alt, className }: { img?: Card["images"][number]; colorHex?: string; alt: string; className: string }) {
  if (img?.url && !img.isPlaceholder) {
    return <Image src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 23vw, 48vw" className={`object-cover ${className}`} />;
  }
  return <Placeholder alt={img?.alt ?? alt} tint={colorHex ? tint(colorHex) : undefined} className={`absolute inset-0 ${className}`} />;
}

export function ProductCard({ product, locale }: { product: Card; locale?: string }) {
  const { has, toggle } = useWishlist();
  const saved = has(product.id);
  const [first, second] = product.images;
  const primaryHex = product.colors[0]?.hex;
  const secondaryHex = product.colors[1]?.hex ?? primaryHex;

  return (
    <article className="group/card relative">
      <Link href={productHref(product.slug)} className="block" aria-label={product.title}>
        <div className="relative aspect-[3/4] overflow-hidden bg-sand">
          <Frame img={first} colorHex={primaryHex} alt={product.title} className="transition-opacity duration-500" />
          {second && (
            <Frame
              img={second}
              colorHex={secondaryHex}
              alt={product.title}
              className="opacity-0 transition-opacity duration-500 group-hover/card:opacity-100"
            />
          )}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.discountPercent && (
              <span className="bg-claret px-2 py-0.5 text-micro text-white">−{product.discountPercent}%</span>
            )}
            {!product.inStock && <span className="bg-paper px-2 py-0.5 text-micro text-ink">Sold out</span>}
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
        className={`absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full transition-[opacity,color] ${
          saved ? "text-claret" : "text-ink sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100"
        }`}
      >
        <HeartIcon filled={saved} width={18} height={18} />
      </button>

      <div className="pt-3.5 sm:pt-4">
        {product.brand && <p className="text-micro text-mute">{product.brand.name}</p>}
        <h3 className="mt-0.5 text-small leading-snug sm:text-body">
          <Link href={productHref(product.slug)} className="hover:underline hover:underline-offset-4">
            {product.title}
          </Link>
        </h3>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-small tabular-nums">
          {product.compareAtPriceMinor ? (
            <>
              <span className="text-claret">
                <span className="sr-only">Sale price </span>
                {formatMoney(product.priceMinor, product.currency, locale)}
              </span>
              <s className="text-mute">
                <span className="sr-only">Original price </span>
                {formatMoney(product.compareAtPriceMinor, product.currency, locale)}
              </s>
            </>
          ) : (
            <span>{formatMoney(product.priceMinor, product.currency, locale)}</span>
          )}
        </p>
        {product.colors.length > 1 && (
          <ul className="mt-2.5 flex items-center gap-1.5" aria-label={`Available in ${product.colors.map((c) => c.name).join(", ")}`}>
            {product.colors.slice(0, MAX_SWATCHES).map((c) => (
              <li key={c.slug} title={c.name} className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: c.hex }} />
            ))}
            {product.colors.length > MAX_SWATCHES && <li className="text-micro text-mute">+{product.colors.length - MAX_SWATCHES}</li>}
          </ul>
        )}
      </div>
    </article>
  );
}
