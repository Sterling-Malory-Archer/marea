import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingView } from "@/components/listing/listing-view";
import { getCollection, getListing } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { alternates } from "@/lib/seo";
import type { SP } from "@/lib/url";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SP> };

async function load({ params }: Props) {
  const { locale, slug } = await params;
  const collection = await getCollection(slug, locale as Locale);
  if (!collection) notFound();
  return { locale: locale as Locale, collection };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, collection } = await load(props);
  return { title: collection.seoTitle ?? collection.title, description: collection.seoDescription ?? collection.description ?? undefined, alternates: alternates(locale, `/collections/${collection.slug}`) };
}

export default async function CollectionPage(props: Props) {
  const { locale, collection } = await load(props);
  const sp = await props.searchParams;
  const listing = await getListing({ collection: collection.slug }, sp, locale);
  return <ListingView locale={locale} title={collection.title} intro={collection.description} breadcrumbs={[]} currentCrumb={collection.title} listing={listing} sp={sp} />;
}
