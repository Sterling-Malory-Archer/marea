"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n-client";
import type { Listing, SortKey } from "@/lib/types";
import { activeFilterCount, first, list, toggleValue, withParam, type SP } from "@/lib/url";
import { CloseIcon } from "../icons";

type Facets = Listing["facets"];

function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return { pending, go: (qs: string) => start(() => router.push(`${pathname}${qs === "?" ? "" : qs}`, { scroll: false })) };
}

function Group({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-t border-line py-4 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-small font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-mute"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
      </summary>
      <div className="pt-3.5">{children}</div>
    </details>
  );
}

function Check({ checked, onChange, children, count }: { checked: boolean; onChange: () => void; children: React.ReactNode; count?: number }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-3 text-small">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 shrink-0 accent-ink" />
      <span className="flex-1">{children}</span>
      {count !== undefined && <span className="tabular-nums text-micro text-mute">{count}</span>}
    </label>
  );
}

/** The filter controls; used in the desktop sidebar and in the mobile drawer. */
export function FilterPanel({ facets, sp }: { facets: Facets; sp: SP }) {
  const { t } = useI18n();
  const L = t.listing;
  const { go, pending } = useNavigate();
  const sel = { brand: list(sp.brand), size: list(sp.size), color: list(sp.color) };
  const priceId = useId();
  const [min, setMin] = useState(first(sp.minPrice) ?? "");
  const [max, setMax] = useState(first(sp.maxPrice) ?? "");
  useEffect(() => {
    setMin(first(sp.minPrice) ?? "");
    setMax(first(sp.maxPrice) ?? "");
  }, [sp.minPrice, sp.maxPrice]);

  // Group sizes by size system (letters, IT numeric, shoes…).
  const scales = new Map<string, Facets["sizes"]>();
  for (const s of facets.sizes) scales.set(s.scaleName, [...(scales.get(s.scaleName) ?? []), s]);

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const qs1 = withParam(sp, "minPrice", min ? String(Math.max(0, Math.floor(+min))) : null);
    const sp2 = Object.fromEntries(new URLSearchParams(qs1.slice(1)));
    go(withParam(sp2, "maxPrice", max ? String(Math.max(0, Math.ceil(+max))) : null));
  };

  return (
    <div className={`transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      {facets.brands.length > 0 && (
        <Group title={L.brand}>
          {facets.brands.map((b) => (
            <Check key={b.slug} checked={sel.brand.includes(b.slug)} onChange={() => go(toggleValue(sp, "brand", b.slug))} count={b.count}>
              {b.name}
            </Check>
          ))}
        </Group>
      )}

      {facets.sizes.length > 0 && (
        <Group title={L.size}>
          {[...scales.entries()].map(([scale, sizes]) => (
            <fieldset key={scale} className="mb-3 last:mb-0">
              {scales.size > 1 && <legend className="mb-2 text-micro text-mute">{scale}</legend>}
              <div className="grid grid-cols-4 gap-1.5">
                {sizes.map((s) => {
                  const on = sel.size.includes(s.label);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => go(toggleValue(sp, "size", s.label))}
                      className={`min-h-10 border px-1 text-small transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                    >
                      {s.label === "ONE SIZE" ? "OS" : s.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </Group>
      )}

      {facets.colors.length > 0 && (
        <Group title={L.colour}>
          {facets.colors.map((c) => (
            <Check key={c.slug} checked={sel.color.includes(c.slug)} onChange={() => go(toggleValue(sp, "color", c.slug))} count={c.count}>
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/15" style={{ backgroundColor: c.hex }} />
                {c.name}
              </span>
            </Check>
          ))}
        </Group>
      )}

      {facets.price && (
        <Group title={L.price}>
          <form onSubmit={applyPrice} className="flex items-end gap-2" aria-labelledby={priceId}>
            <span id={priceId} className="sr-only">{L.price} (€)</span>
            {[
              [L.min, min, setMin, Math.floor(facets.price.min / 100)],
              [L.max, max, setMax, Math.ceil(facets.price.max / 100)],
            ].map(([label, value, set, ph]) => (
              <label key={label as string} className="flex-1 text-micro text-mute">
                {label as string} (€)
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={value as string}
                  placeholder={String(ph)}
                  onChange={(e) => (set as (v: string) => void)(e.target.value.replace(/[^0-9]/g, ""))}
                  className="mt-1 block h-10 w-full border border-line bg-paper px-2.5 text-small text-ink focus:border-ink focus:outline-none"
                />
              </label>
            ))}
            <button type="submit" className="btn btn-outline h-10 min-h-10 px-3">{L.apply}</button>
          </form>
        </Group>
      )}

      <Group title={L.availability}>
        <Check checked={!!first(sp.inStock)} onChange={() => go(withParam(sp, "inStock", first(sp.inStock) ? null : "1"))}>{L.inStock}</Check>
        {(facets.saleCount > 0 || first(sp.sale)) && (
          <Check checked={!!first(sp.sale)} onChange={() => go(withParam(sp, "sale", first(sp.sale) ? null : "1"))} count={facets.saleCount}>
            {L.onSale}
          </Check>
        )}
      </Group>
    </div>
  );
}

export function SortSelect({ sort, sp, allowRelevance }: { sort: SortKey; sp: SP; allowRelevance: boolean }) {
  const { t } = useI18n();
  const { go } = useNavigate();
  const id = useId();
  const options = (Object.keys(t.listing.sort) as SortKey[]).filter((k) => allowRelevance || k !== "relevance");
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only text-small text-mute sm:not-sr-only">{t.listing.sortBy}</label>
      <select
        id={id}
        value={sort}
        onChange={(e) => go(withParam(sp, "sort", e.target.value))}
        className="h-10 cursor-pointer appearance-none border-0 border-b border-ink bg-transparent pr-6 text-small focus:outline-none"
        style={{ backgroundImage: "linear-gradient(45deg,transparent 50%,#202020 50%),linear-gradient(135deg,#202020 50%,transparent 50%)", backgroundPosition: "right 6px center, right 1px center", backgroundSize: "5px 5px", backgroundRepeat: "no-repeat" }}
      >
        {options.map((k) => (
          <option key={k} value={k}>{t.listing.sort[k]}</option>
        ))}
      </select>
    </div>
  );
}

/** Mobile: a full-height drawer holding the same filter panel. */
export function MobileFilters({ facets, sp, total }: { facets: Facets; sp: SP; total: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const n = activeFilterCount(sp);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)} className="btn btn-outline h-10 min-h-10 px-4 lg:hidden" aria-expanded={open}>
        {t.listing.filter}
        {n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[0.625rem] text-paper">{n}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div ref={panel} role="dialog" aria-modal="true" aria-label={t.listing.filters} className="absolute inset-y-0 right-0 flex w-[min(92vw,26rem)] animate-[fade_0.2s_ease] flex-col bg-paper">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <h2 className="text-lead">{t.listing.filters}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.product.close} className="-mr-2 p-2">
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <FilterPanel facets={facets} sp={sp} />
            </div>
            <div className="border-t border-line p-5">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-solid w-full">{t.listing.showResults(total)}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
