import type { Metadata } from "next";
import { ListingView } from "@/components/listing/listing-view";
import { getLayout, getListing } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { alternates, share } from "@/lib/seo";
import type { SP } from "@/lib/url";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = getMessages(locale).pages;
  const { settings } = await getLayout(locale);
  return { title: t.saleTitle, description: t.saleIntro, alternates: alternates(locale, "/sale"), ...share(locale, settings.storeName, { title: t.saleTitle, description: t.saleIntro, path: "/sale" }) };
}

export default async function Page({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const sp = await searchParams;
  const t = getMessages(locale).pages;
  const listing = await getListing({ scope: "sale" }, sp, locale);
  return <ListingView locale={locale} title={t.saleTitle} intro={t.saleIntro} breadcrumbs={[]} currentCrumb={t.saleTitle} listing={listing} sp={sp} />;
}
