import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { Editorial, FeaturedCollections, ProductRail, ServiceStrip } from "@/components/home-sections";
import { getHome, getLayout } from "@/lib/api";
import { isLocale, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { absolute, alternates, jsonLd, share } from "@/lib/seo";
import { localePath } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).locale;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const { settings } = await getLayout(locale);
  return { alternates: alternates(locale, "/"), ...share(locale, settings.storeName, { title: `${settings.storeName} — ${settings.tagline}`, description: settings.tagline, path: "/" }) };
}

export default async function HomePage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const [home, layout] = await Promise.all([getHome(locale), getLayout(locale)]);
  const t = getMessages(locale);

  const orgJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": absolute("/#organization"),
      name: layout.settings.storeName,
      url: absolute("/"),
      logo: absolute("/icon.svg"),
      ...(layout.settings.supportEmail ? { email: layout.settings.supportEmail } : {}),
      ...(layout.settings.instagramUrl ? { sameAs: [layout.settings.instagramUrl] } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: layout.settings.storeName,
      url: absolute(localePath(locale, "/")),
      inLanguage: locale === "me" ? "sr-Latn-ME" : "en",
      publisher: { "@id": absolute("/#organization") },
      potentialAction: { "@type": "SearchAction", target: `${absolute(localePath(locale, "/search"))}?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(orgJsonLd)} />
      <Hero slides={home.hero} />
      <ServiceStrip items={home.services} locale={locale} />
      <ProductRail id="new-arrivals" title={t.home.newArrivals} href="/new" products={home.newArrivals} locale={locale} />
      <FeaturedCollections items={home.featuredCollections} locale={locale} />
      <Editorial block={home.editorial} locale={locale} />
      <ProductRail id="bestsellers" title={t.home.mostWanted} href="/collections/bestsellers" products={home.bestsellers} locale={locale} />
    </>
  );
}
