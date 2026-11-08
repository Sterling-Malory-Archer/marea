import type { Metadata } from "next";
import { ListingView } from "@/components/listing/listing-view";
import { getListing } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { first, type SP } from "@/lib/url";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  // Search results pages are not indexed.
  return { title: getMessages(locale).pages.searchTitle, robots: { index: false, follow: true } };
}

function SearchForm({ q, locale }: { q: string; locale: Locale }) {
  const t = getMessages(locale).pages;
  return (
    <form role="search" action="" className="mt-8 flex max-w-[40rem] border-b border-ink">
      <label htmlFor="q" className="sr-only">{t.searchTitle}</label>
      <input id="q" name="q" type="search" defaultValue={q} placeholder={t.searchPlaceholder} autoFocus={!q} maxLength={100} className="min-h-14 flex-1 bg-transparent text-lead placeholder:text-mute focus:outline-none" />
      <button type="submit" className="pl-4 text-small font-medium">{t.searchTitle}</button>
    </form>
  );
}

export default async function SearchPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const t = getMessages(locale).pages;
  const q = (first(sp.q) ?? "").trim().slice(0, 100);

  if (!q) {
    return (
      <div className="shell min-h-[50svh] pb-24 pt-12">
        <h1 className="display text-[clamp(2.5rem,6vw,5.5rem)]">{t.searchPrompt}</h1>
        <SearchForm q="" locale={locale} />
      </div>
    );
  }
  const listing = await getListing({ q }, sp, locale);
  return (
    <ListingView
      locale={locale}
      title={listing.total ? t.searchFor(q) : t.searchEmpty(q)}
      intro={listing.total ? null : t.searchHint}
      breadcrumbs={[]}
      currentCrumb={t.searchTitle}
      listing={listing}
      sp={sp}
      allowRelevance
      headerSlot={<SearchForm q={q} locale={locale} />}
    />
  );
}
