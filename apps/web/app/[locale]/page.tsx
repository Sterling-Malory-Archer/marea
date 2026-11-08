import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { Editorial, FeaturedCollections, ProductRail, ServiceStrip } from "@/components/home-sections";
import { getHome, getLayout } from "@/lib/api";
import { isLocale, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates(isLocale(locale) ? locale : "en", "/") };
}

export default async function HomePage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const [home, layout] = await Promise.all([getHome(locale), getLayout(locale)]);
  const t = getMessages(locale);

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: layout.settings.storeName,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ...(layout.settings.instagramUrl ? { sameAs: [layout.settings.instagramUrl] } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd).replace(/</g, "\\u003c") }} />
      <Hero slides={home.hero} />
      <ServiceStrip items={home.services} locale={locale} />
      <ProductRail id="new-arrivals" title={t.home.newArrivals} href="/new" products={home.newArrivals} locale={locale} />
      <FeaturedCollections items={home.featuredCollections} locale={locale} />
      <Editorial block={home.editorial} locale={locale} />
      <ProductRail id="bestsellers" title={t.home.mostWanted} href="/collections/bestsellers" products={home.bestsellers} locale={locale} />
    </>
  );
}
