import { Hero } from "@/components/hero";
import { Editorial, FeaturedCollections, ProductRail, ServiceStrip } from "@/components/home-sections";
import { getHome, getLayout } from "@/lib/api";

export default async function HomePage() {
  const [home, layout] = await Promise.all([getHome(), getLayout()]);
  const locale = layout.settings.locale;

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
      <ServiceStrip items={home.services} />
      <ProductRail id="new-arrivals" title="New arrivals" href="/new" products={home.newArrivals} locale={locale} />
      <FeaturedCollections items={home.featuredCollections} />
      <Editorial block={home.editorial} />
      <ProductRail id="bestsellers" title="Most wanted" href="/collections/bestsellers" products={home.bestsellers} locale={locale} />
    </>
  );
}
