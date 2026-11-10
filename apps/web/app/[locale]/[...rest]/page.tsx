import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/rich-text";
import { getLayout, getPage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { LOCALE_META, localePath, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { alternates, share } from "@/lib/seo";
import type { InfoPage } from "@/lib/types";

/*
 * Information pages edited in the admin (/help/…, /about, or any address the
 * owner chooses). Anything else under a locale is the localized 404.
 */

type Props = { params: Promise<{ locale: string; rest: string[] }> };

async function load({ params }: Props) {
  const { locale, rest } = await params;
  const page = await getPage(rest.join("/"), locale as Locale);
  if (!page) notFound();
  return { locale: locale as Locale, page };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, page } = await load(props);
  const { settings } = await getLayout(locale);
  const title = page.seoTitle ?? page.title;
  const description = page.seoDescription ?? page.intro ?? undefined;
  return { title, description, alternates: alternates(locale, `/${page.slug}`), ...share(locale, settings.storeName, { title, description, path: `/${page.slug}` }) };
}

const HELP_LINKS = [
  ["help/contact", "contact"],
  ["help/shipping", "shipping"],
  ["help/returns", "returns"],
  ["help/size-guide", "sizeGuide"],
  ["help/privacy", "privacy"],
  ["help/terms", "terms"],
] as const;

export default async function InfoPageRoute(props: Props) {
  const { locale, page } = await load(props);
  const t = getMessages(locale);
  const I = t.info;
  const layout = await getLayout(locale);
  const isHelp = page.slug.startsWith("help/");
  const updated = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Podgorica" }).format(new Date(page.updatedAt));

  return (
    <div className="shell py-10 sm:py-14">
      <div className={isHelp ? "grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-16" : ""}>
        {isHelp && (
          <nav aria-label={I.helpPages} className="order-last border-t border-line pt-6 lg:order-first lg:border-0 lg:pt-1">
            <p className="mb-3 text-micro uppercase tracking-[0.14em] text-mute">{I.help}</p>
            <ul className="space-y-2 text-small">
              {HELP_LINKS.map(([slug, key]) => (
                <li key={slug}>
                  {slug === page.slug ? (
                    <span aria-current="page" className="text-ink underline underline-offset-4">{t.footer[key]}</span>
                  ) : (
                    <Link href={localePath(locale, `/${slug}`)} className="text-ink/70 hover:text-ink">{t.footer[key]}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
        <article className="max-w-2xl">
          <h1 className="display text-4xl leading-[1.05] sm:text-5xl">{page.title}</h1>
          {page.intro && <p className="mt-5 text-lead text-ink/80">{page.intro}</p>}
          {page.needsReview && (
            <p role="note" className="mt-6 border-l-2 border-line bg-sand/60 px-4 py-3 text-small text-ink/75">{I.draft}</p>
          )}
          <div className="mt-8 space-y-10">
            {page.kind === "CONTACT" && page.contact && <Contact c={page.contact} locale={locale} />}
            {page.kind === "SHIPPING" && page.zones && <Delivery zones={page.zones} locale={locale} />}
            {page.body && <RichText source={page.body} locale={locale} />}
            {page.kind === "SIZE_GUIDE" && page.guides && <Guides guides={page.guides} locale={locale} />}
          </div>
          {page.kind === "LEGAL" && <p className="mt-12 text-micro text-mute">{I.updated(updated)}</p>}
          {page.kind !== "CONTACT" && layout.settings.supportEmail && (
            <p className="mt-12 border-t border-line pt-6 text-small text-ink/70">
              {I.writeUs}: <a href={`mailto:${layout.settings.supportEmail}`} className="link-underline">{layout.settings.supportEmail}</a>
            </p>
          )}
        </article>
      </div>
    </div>
  );
}

function Contact({ c, locale }: { c: NonNullable<InfoPage["contact"]>; locale: Locale }) {
  const I = getMessages(locale).info;
  const rows = [
    c.email && [I.email, <a key="e" href={`mailto:${c.email}`} className="link-underline">{c.email}</a>],
    c.phone && [I.phone, <a key="p" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="link-underline">{c.phone}</a>],
    c.instagramUrl && [I.instagram, <a key="i" href={c.instagramUrl} target="_blank" rel="noopener noreferrer" className="link-underline">{c.instagramUrl.replace(/^https?:\/\/(www\.)?/, "")}</a>],
  ].filter(Boolean) as [string, React.ReactNode][];
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-y-3 border-y border-line py-6 text-body">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mute">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Delivery({ zones, locale }: { zones: NonNullable<InfoPage["zones"]>; locale: Locale }) {
  const t = getMessages(locale);
  const I = t.info;
  const money = (m: number) => formatMoney(m, "EUR", LOCALE_META[locale].intl);
  const countries = new Intl.DisplayNames([LOCALE_META[locale].intl, "en"], { type: "region" });
  return (
    <div className="space-y-10">
      {zones.map((z) => (
        <section key={z.name}>
          <h2 className="text-lead font-medium">{I.zoneNames[z.name] ?? z.name}</h2>
          <p className="mt-1 text-small text-mute">{I.deliversTo}: {z.countryCodes.map((c) => { try { return countries.of(c) ?? c; } catch { return c; } }).join(", ")}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-small">
              <thead>
                <tr className="border-b border-ink text-left">
                  {[I.method, I.price, I.freeFrom, I.time, I.cod].map((h) => <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {z.methods.map((m) => (
                  <tr key={m.code} className="border-b border-line">
                    <th scope="row" className="py-3 pr-4 text-left font-normal">{t.product.methods[m.code] ?? m.name}</th>
                    <td className="py-3 pr-4 tabular-nums">{m.priceMinor === 0 ? I.free : money(m.priceMinor)}</td>
                    <td className="py-3 pr-4 tabular-nums">{m.freeOverMinor != null ? money(m.freeOverMinor) : "—"}</td>
                    <td className="py-3 pr-4">{m.minDays != null || m.maxDays != null ? I.days(m.minDays ?? m.maxDays!, m.maxDays ?? m.minDays!) : "—"}</td>
                    <td className="py-3 pr-4">{m.cashOnDelivery ? I.yes : I.no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Guides({ guides, locale }: { guides: NonNullable<InfoPage["guides"]>; locale: Locale }) {
  const t = getMessages(locale);
  const P = t.product;
  return (
    <div className="space-y-12">
      {guides.map((g) => (
        <section key={g.code} id={g.code} className="scroll-mt-28">
          <h2 className="text-lead font-medium">{t.info.scaleNames[g.code] ?? g.name}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-small tabular-nums">
              <thead>
                <tr>{g.guide.columns.map((c) => <th key={c} scope="col" className="border-b border-ink py-2 pr-4 text-left font-medium">{P.guideCols[c] ?? c}</th>)}</tr>
              </thead>
              <tbody>
                {g.guide.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line">
                    {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="py-2 pr-4 text-left font-medium">{c}</th> : <td key={j} className="py-2 pr-4">{c}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {g.guide.note && <p className="mt-3 text-micro text-mute">{P.guideNote[g.guide.note] ?? g.guide.note}</p>}
        </section>
      ))}
    </div>
  );
}
