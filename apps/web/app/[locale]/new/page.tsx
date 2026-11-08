import type { Metadata } from "next";
import { ListingView } from "@/components/listing/listing-view";
import { getListing } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { alternates } from "@/lib/seo";
import type { SP } from "@/lib/url";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = getMessages(locale).pages;
  return { title: t.newTitle, description: t.newIntro, alternates: alternates(locale, "/new") };
}

export default async function Page({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const t = getMessages(locale).pages;
  const listing = await getListing({ scope: "new" }, sp, locale);
  return <ListingView locale={locale} title={t.newTitle} intro={t.newIntro} breadcrumbs={[]} currentCrumb={t.newTitle} listing={listing} sp={sp} />;
}
