import Image from "next/image";
import Link from "next/link";
import type { CollectionTile, ContentBlock, ProductCard as Card } from "@/lib/types";
import { Placeholder } from "./placeholder";
import { ProductCard } from "./product-card";

export function ServiceStrip({ items }: { items: ContentBlock[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Our service" className="border-y border-line">
      <ul className="shell grid grid-cols-2 lg:grid-cols-4">
        {items.map((s, i) => (
          <li
            key={s.id}
            className={`py-5 pr-4 lg:py-6 ${i % 2 === 1 ? "pl-4 max-lg:border-l max-lg:border-line" : ""} ${
              i > 0 ? "lg:border-l lg:border-line lg:pl-8" : ""
            } ${i > 1 ? "max-lg:border-t max-lg:border-line" : ""}`}
          >
            <p className="text-small font-medium">{s.title}</p>
            {s.body && <p className="mt-0.5 text-micro text-mute sm:text-small">{s.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({ title, href, linkLabel, id }: { title: string; href?: string; linkLabel?: string; id: string }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6 lg:mb-10">
      <h2 id={id} className="display text-[clamp(2rem,3.6vw,3.25rem)]">
        {title}
      </h2>
      {href && (
        <Link href={href} className="link-underline shrink-0 text-small">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}

/** Asymmetric collection grid: one tall feature beside two stacked tiles. */
export function FeaturedCollections({ items }: { items: CollectionTile[] }) {
  if (!items.length) return null;
  const tints = ["#DCD3C6", "#CFCAC0", "#D9CFCB", "#D3D4CC"];
  return (
    <section aria-labelledby="collections-title" className="shell py-16 lg:py-24">
      <SectionHeading id="collections-title" title="The collections" />
      <div className="grid gap-x-6 gap-y-10 md:grid-cols-12 lg:gap-x-10">
        {items.slice(0, 3).map((c, i) => (
          <Link
            key={c.id}
            href={`/collections/${c.slug}`}
            className={`group block ${i === 0 ? "md:col-span-7 md:row-span-2" : "md:col-span-5"}`}
          >
            <div className={`relative overflow-hidden ${i === 0 ? "aspect-[4/5] md:aspect-auto md:h-full md:min-h-[38rem]" : "aspect-[16/10]"}`}>
              {c.imageUrl ? (
                <Image src={c.imageUrl} alt="" fill sizes="(min-width: 768px) 55vw, 100vw" className="object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.02]" />
              ) : (
                <Placeholder alt={`${c.title} collection`} tint={tints[i % tints.length]} className="absolute inset-0" label="Placeholder — editorial photograph" />
              )}
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <div>
                {c.eyebrow && <p className="text-micro text-mute">{c.eyebrow}</p>}
                <h3 className="display mt-1 text-[clamp(1.6rem,2.4vw,2.25rem)]">{c.title}</h3>
              </div>
              <span className="link-underline shrink-0 text-small">Shop the edit</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ProductRail({ id, title, href, products, locale }: { id: string; title: string; href?: string; products: Card[]; locale: string }) {
  if (!products.length) return null;
  // Show complete rows only (4 per row on desktop) so the grid never ends ragged.
  const shown = products.length >= 4 ? products.slice(0, Math.min(8, products.length - (products.length % 4))) : products;
  return (
    <section aria-labelledby={id} className="shell py-16 lg:py-24">
      <SectionHeading id={id} title={title} href={href} />
      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-14">
        {shown.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Magazine-style feature: photograph bleeds to the edge, text sits on a sand field. */
export function Editorial({ block }: { block: ContentBlock | null }) {
  if (!block) return null;
  return (
    <section aria-labelledby="editorial-title" className="bg-sand">
      <div className="grid lg:grid-cols-12">
        <div className="relative aspect-[4/5] sm:aspect-[3/2] lg:col-span-7 lg:aspect-auto lg:min-h-[44rem]">
          {block.imageUrl && !block.imageIsPlaceholder ? (
            <Image src={block.imageUrl} alt={block.imageAlt ?? ""} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
          ) : (
            <Placeholder alt={block.imageAlt ?? block.title} tint="#D3CCC1" className="absolute inset-0" label="Placeholder — lifestyle photograph" />
          )}
        </div>
        <div className="flex items-center px-5 py-14 sm:px-10 lg:col-span-5 lg:px-16 xl:px-24">
          <div className="max-w-[30rem]">
            {block.eyebrow && <p className="text-small text-mute">{block.eyebrow}</p>}
            <h2 id="editorial-title" className="display mt-5 text-[clamp(2.25rem,4vw,3.75rem)] text-balance">
              {block.title}
            </h2>
            {block.body && <p className="mt-6 font-display text-lead leading-[1.85] text-ink/90">{block.body}</p>}
            {block.ctaUrl && (
              <Link href={block.ctaUrl} className="link-underline mt-8 inline-block text-small">
                {block.ctaLabel ?? "Read more"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
