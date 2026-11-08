"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import type { ProductDetail } from "@/lib/types";
import { useWishlist } from "@/lib/wishlist";
import { HeartIcon } from "../icons";
import { Gallery } from "./gallery";
import { SizeGuide } from "./size-guide";

export function ProductView({ product }: { product: ProductDetail }) {
  const { t, intl } = useI18n();
  const P = t.product;
  const money = (m: number) => formatMoney(m, product.currency, intl);
  const wishlist = useWishlist();
  const saved = wishlist.has(product.id);

  const variantAt = (color: string, size: string) => product.variants.find((v) => v.colorSlug === color && v.size === size);
  const colorInStock = (color: string) => product.variants.some((v) => v.colorSlug === color && v.stock !== "out_of_stock");

  const [color, setColor] = useState(() => product.colors.find((c) => colorInStock(c.slug))?.slug ?? product.colors[0]!.slug);
  const [size, setSize] = useState<string | null>(product.sizes.length === 1 ? product.sizes[0]! : null);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const buyRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);

  const current = product.colors.find((c) => c.slug === color)!;
  const variant = size ? variantAt(color, size) : undefined;
  const purchasable = !!variant && variant.stock !== "out_of_stock";
  const maxQty = variant?.stock === "low_stock" ? variant.lowStockCount ?? 1 : 10;
  const allSoldOut = !product.variants.some((v) => v.stock !== "out_of_stock");

  // If the chosen size isn't available in the newly chosen colour, clear it.
  useEffect(() => {
    if (size && variantAt(color, size)?.stock === "out_of_stock" && product.sizes.length > 1) setSize(null);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);
  useEffect(() => setQty((q) => Math.min(q, maxQty)), [maxQty]);

  // Mobile: show a sticky purchase bar once the main button scrolls away.
  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e!.isIntersecting && e!.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addToBag = () => {
    if (!purchasable) return;
    // The cart (MySQL-backed, server-validated) arrives in Phase 5.
    setNotice(P.bagSoon(`${product.title}, ${current.name}, ${size} × ${qty}`));
  };

  const price = (
    <p className="flex flex-wrap items-baseline gap-x-3 text-lead tabular-nums">
      {product.compareAtPriceMinor ? (
        <>
          <span className="text-claret"><span className="sr-only">{t.card.sale} </span>{money(variant?.priceMinor ?? product.priceMinor)}</span>
          <s className="text-mute"><span className="sr-only">{t.card.original} </span>{money(product.compareAtPriceMinor)}</s>
          <span className="bg-claret px-2 py-0.5 text-micro text-white">−{product.discountPercent}%</span>
        </>
      ) : (
        <span>{money(variant?.priceMinor ?? product.priceMinor)}</span>
      )}
    </p>
  );

  const stockLine =
    allSoldOut ? <span className="text-claret">{P.soldOutAll}</span>
    : !variant ? null
    : variant.stock === "out_of_stock" ? <span className="text-claret">{P.outOfStock}</span>
    : variant.stock === "low_stock" ? <span className="text-claret">{P.lowStock(variant.lowStockCount ?? 1)}</span>
    : <span className="text-ink/70">{P.inStock}</span>;

  const buyLabel = allSoldOut ? P.soldOutAll : !size ? P.chooseSize : purchasable ? P.addToBag : P.unavailable;

  const delivery = useMemo(
    () =>
      product.delivery.methods.map((m) => {
        const name = P.methods[m.code] ?? m.code;
        const cost = m.priceMinor === 0 ? P.free : money(m.priceMinor) + (m.freeOverMinor ? ` (${P.freeOver(money(m.freeOverMinor))})` : "");
        const days = m.minDays != null && m.maxDays != null ? P.days(m.minDays, m.maxDays) : "";
        return P.deliveryLine(name, cost, days);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, intl],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">
      <div className="lg:col-span-7">
        <Gallery images={current.images} hex={(product.colors.find((c) => c.slug === color) ?? product.colors[0]!).hex} title={product.title} />
      </div>

      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          {product.brand && <p className="text-small text-mute">{product.brand.name}</p>}
          <h1 className="display mt-2 text-[clamp(2rem,3.4vw,3.25rem)] leading-[1.02] text-balance">{product.title}</h1>
          <div className="mt-5">{price}</div>

          {/* Colour */}
          <fieldset className="mt-8">
            <legend className="text-small">
              {P.colour}: <span className="text-ink/70">{current.name}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5" role="radiogroup">
              {product.colors.map((c) => {
                const on = c.slug === color;
                const out = !colorInStock(c.slug);
                return (
                  <button
                    key={c.slug}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${c.name}${out ? ` — ${P.soldOutAll}` : ""}`}
                    title={c.name}
                    onClick={() => setColor(c.slug)}
                    className={`relative grid h-10 w-10 place-items-center rounded-full transition-shadow ${on ? "ring-1 ring-ink ring-offset-2 ring-offset-paper" : "hover:ring-1 hover:ring-line hover:ring-offset-2"}`}
                  >
                    <span className="h-8 w-8 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: c.hex }} />
                    {out && <span aria-hidden className="absolute h-px w-9 rotate-45 bg-ink/60" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Size */}
          {product.sizes.length > 0 && (
            <fieldset className="mt-7">
              <div className="flex items-center justify-between">
                <legend className="text-small">
                  {P.size}
                  {size && <span className="text-ink/70">: {size}</span>}
                </legend>
                {product.sizeScale.guide && <SizeGuide guide={product.sizeScale.guide} highlight={size} />}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label={P.selectSize}>
                {product.sizes.map((s) => {
                  const v = variantAt(color, s);
                  const out = !v || v.stock === "out_of_stock";
                  const on = s === size;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={out}
                      disabled={out}
                      aria-label={out ? `${s} — ${P.unavailable}` : s}
                      onClick={() => {
                        setSize(s);
                        setNotice(null);
                      }}
                      className={`min-h-12 border text-small transition-colors ${
                        out ? "cursor-not-allowed border-line text-mute line-through decoration-ink/40"
                        : on ? "border-ink bg-ink text-paper"
                        : "border-line hover:border-ink"
                      }`}
                    >
                      {s === "ONE SIZE" ? P.oneSize : s}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <p className="mt-4 min-h-5 text-small" aria-live="polite">{stockLine}</p>

          {/* Quantity + add */}
          <div ref={buyRef} className="mt-5 flex flex-wrap gap-3 sm:flex-nowrap">
            <div className="flex h-12 items-center border border-line" role="group" aria-label={P.quantity}>
              <button type="button" className="h-full w-11 text-lg disabled:text-line" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={P.decrease}>−</button>
              <output className="w-8 text-center tabular-nums" aria-live="polite">{qty}</output>
              <button type="button" className="h-full w-11 text-lg disabled:text-line" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={!purchasable || qty >= maxQty} aria-label={P.increase}>+</button>
            </div>
            <button type="button" onClick={addToBag} disabled={!purchasable} className="btn btn-solid order-last h-12 basis-full sm:order-none sm:basis-auto sm:flex-1 disabled:cursor-not-allowed disabled:border-line disabled:bg-sand disabled:text-mute">
              {buyLabel}
            </button>
            <button
              type="button"
              onClick={() => wishlist.toggle(product.id)}
              aria-pressed={saved}
              aria-label={saved ? t.card.remove(product.title) : t.card.save(product.title)}
              className={`ml-auto grid h-12 w-12 shrink-0 place-items-center border border-line hover:border-ink sm:ml-0 ${saved ? "text-claret" : ""}`}
            >
              <HeartIcon filled={saved} />
            </button>
          </div>
          {notice && <p role="status" className="mt-4 border-l-2 border-claret pl-3 text-small text-ink/80">{notice}</p>}

          <p className="mt-6 text-micro text-mute">
            {P.ref} {variant?.sku ?? product.reference}
          </p>

          {/* Details */}
          <div className="mt-8 border-t border-line">
            {[
              { title: P.description, body: product.description, open: true },
              { title: P.composition, body: [product.composition, product.care].filter(Boolean).join("\n\n") || null },
              { title: P.delivery, body: [...delivery, product.delivery.codEnabled ? P.cod : null].filter(Boolean).join("\n") },
              { title: P.returns, body: P.returnsText(product.delivery.returnsDays) },
            ]
              .filter((d) => d.body)
              .map((d) => (
                <details key={d.title} open={d.open} className="group border-b border-line">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-small font-medium [&::-webkit-details-marker]:hidden">
                    {d.title}
                    <span aria-hidden className="text-mute"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
                  </summary>
                  <p className="whitespace-pre-line pb-5 text-small leading-6 text-ink/75">{d.body}</p>
                </details>
              ))}
          </div>
        </div>
      </div>

      {/* Mobile sticky purchase bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 p-3 backdrop-blur-sm transition-transform duration-300 lg:hidden ${showSticky ? "translate-y-0" : "translate-y-full"}`}
        aria-hidden={!showSticky}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-small">{product.title}</p>
            <p className="text-small tabular-nums text-ink/70">{money(variant?.priceMinor ?? product.priceMinor)}{size ? ` · ${size}` : ""}</p>
          </div>
          <button
            type="button"
            tabIndex={showSticky ? 0 : -1}
            onClick={() => (purchasable ? addToBag() : buyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }))}
            className="btn btn-solid h-11"
          >
            {purchasable ? P.addToBag : P.selectSize}
          </button>
        </div>
      </div>
    </div>
  );
}
