import Link from "next/link";
import { formatMoney, categoryHref } from "@/lib/format";
import { LOCALE_META, localePath, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import type { Breadcrumb, Listing } from "@/lib/types";
import { first, list, toggleValue, withParam, type SP } from "@/lib/url";
import { ProductCard } from "../product-card";
import { FilterPanel, MobileFilters, SortSelect } from "./filters";

export function Breadcrumbs({ items, locale, current }: { items: Breadcrumb[]; locale: Locale; current?: string }) {
  const t = getMessages(locale);
  const all = [{ name: t.nav.home, href: localePath(locale, "/") }, ...items.map((b) => ({ name: b.name, href: localePath(locale, categoryHref(b.path)) }))];
  return (
    <nav aria-label={t.nav.breadcrumb} className="text-micro text-mute sm:text-small">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {all.map((b, i) => {
          const last = i === all.length - 1 && !current;
          return (
            <li key={b.href} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>/</span>}
              {last ? <span aria-current="page" className="text-ink">{b.name}</span> : <Link href={b.href} className="hover:text-ink">{b.name}</Link>}
            </li>
          );
        })}
        {current && (
          <li className="flex items-center gap-2">
            <span aria-hidden>/</span>
            <span aria-current="page" className="text-ink">{current}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export function ListingView({
  locale,
  title,
  intro,
  breadcrumbs,
  currentCrumb,
  subcategories,
  activePath,
  listing,
  sp,
  allowRelevance = false,
  headerSlot,
}: {
  locale: Locale;
  title: string;
  intro?: string | null;
  breadcrumbs: Breadcrumb[];
  currentCrumb?: string;
  subcategories?: { id: number; name: string; path: string }[];
  activePath?: string;
  listing: Listing;
  sp: SP;
  allowRelevance?: boolean;
  headerSlot?: React.ReactNode;
}) {
  const t = getMessages(locale);
  const L = t.listing;
  const intl = LOCALE_META[locale].intl;

  // Active filter chips, each a plain link that removes itself.
  const chips: { label: string; href: string }[] = [];
  for (const slug of list(sp.brand)) chips.push({ label: listing.facets.brands.find((b) => b.slug === slug)?.name ?? slug, href: toggleValue(sp, "brand", slug) });
  for (const s of list(sp.size)) chips.push({ label: `${L.size} ${s}`, href: toggleValue(sp, "size", s) });
  for (const c of list(sp.color)) chips.push({ label: listing.facets.colors.find((x) => x.slug === c)?.name ?? c, href: toggleValue(sp, "color", c) });
  if (first(sp.minPrice) || first(sp.maxPrice)) {
    const lo = first(sp.minPrice), hi = first(sp.maxPrice);
    const fmt = (v: string) => formatMoney(Number(v) * 100, "EUR", intl).replace(/[.,]00(?=\D*$)/, "");
    const label = lo && hi ? `${fmt(lo)} – ${fmt(hi)}` : lo ? `≥ ${fmt(lo)}` : `≤ ${fmt(hi!)}`;
    const q = Object.fromEntries(new URLSearchParams(withParam(sp, "minPrice", null).slice(1)));
    chips.push({ label, href: withParam(q, "maxPrice", null) });
  }
  if (first(sp.inStock)) chips.push({ label: L.inStock, href: withParam(sp, "inStock", null) });
  if (first(sp.sale)) chips.push({ label: L.onSale, href: withParam(sp, "sale", null) });
  const keep = Object.fromEntries(Object.entries(sp).filter(([k]) => k === "q" || k === "sort"));
  const clearAll = withParam(keep, "page", null);

  return (
    <div className="shell pb-20 pt-8 lg:pt-12">
      <Breadcrumbs items={breadcrumbs} locale={locale} current={currentCrumb} />

      <header className="mt-6 grid gap-4 lg:mt-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <h1 className="display text-[clamp(2.5rem,6vw,5.5rem)]">{title}</h1>
          {intro && <p className="mt-4 max-w-[38rem] text-lead text-ink/70">{intro}</p>}
        </div>
        <p className="text-small text-mute lg:col-span-4 lg:text-right" aria-live="polite">{L.items(listing.total)}</p>
      </header>

      {headerSlot}

      {subcategories && subcategories.length > 0 && (
        <nav aria-label={L.subcategories} className="-mx-5 mt-8 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <ul className="flex gap-2 whitespace-nowrap">
            {subcategories.map((c) => {
              const on = activePath === c.path;
              return (
                <li key={c.id}>
                  <Link
                    href={localePath(locale, categoryHref(c.path))}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-10 items-center border px-4 text-small transition-colors ${on ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
                  >
                    {c.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block xl:col-span-2" aria-label={L.filters}>
          <div className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto pb-8 pr-2">
            <FilterPanel facets={listing.facets} sp={sp} />
          </div>
        </aside>

        <section className="lg:col-span-9 xl:col-span-10" aria-label={title}>
          <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
            <MobileFilters facets={listing.facets} sp={sp} total={listing.total} />
            <div className="ml-auto">
              <SortSelect sort={listing.sort} sp={sp} allowRelevance={allowRelevance} />
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <li key={c.href + c.label}>
                  <Link href={c.href} scroll={false} aria-label={L.remove(c.label)} className="inline-flex min-h-8 items-center gap-2 bg-sand px-3 text-micro hover:bg-line sm:text-small">
                    {c.label}
                    <span aria-hidden>×</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={clearAll} scroll={false} className="link-underline ml-2 text-small">{L.clearAll}</Link>
              </li>
            </ul>
          )}

          {listing.items.length === 0 ? (
            <div className="py-24 text-center">
              <p className="display text-3xl">{L.empty}</p>
              <p className="mt-3 text-body text-ink/70">{L.emptyHint}</p>
              {chips.length > 0 && <Link href={clearAll} className="btn btn-outline mt-8">{L.clearAll}</Link>}
            </div>
          ) : (
            <>
            <h2 className="sr-only">{L.productsHeading}</h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 lg:gap-x-6 lg:gap-y-14">
              {listing.items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
            </>
          )}

          {listing.pageCount > 1 && <Pagination listing={listing} sp={sp} locale={locale} />}
        </section>
      </div>
    </div>
  );
}

function Pagination({ listing, sp, locale }: { listing: Listing; sp: SP; locale: Locale }) {
  const L = getMessages(locale).listing;
  const { page, pageCount } = listing;
  const href = (p: number) => withParam(sp, "page", p === 1 ? null : String(p), true);
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return (
    <nav aria-label={L.pagination} className="mt-16 flex items-center justify-between border-t border-line pt-6 text-small">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="link-underline">{L.prev}</Link> : <span />}
      <ol className="flex items-center gap-1">
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && p - pages[i - 1]! > 1 && <span aria-hidden className="px-1 text-mute">…</span>}
            <Link
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={L.page(p, pageCount)}
              className={`grid h-10 min-w-10 place-items-center px-2 tabular-nums ${p === page ? "bg-ink text-paper" : "hover:bg-sand"}`}
            >
              {p}
            </Link>
          </li>
        ))}
      </ol>
      {page < pageCount ? <Link href={href(page + 1)} rel="next" className="link-underline">{L.next}</Link> : <span />}
    </nav>
  );
}
