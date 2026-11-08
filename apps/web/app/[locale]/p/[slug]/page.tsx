import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductRail } from "@/components/home-sections";
import { breadcrumbJsonLd, Breadcrumbs } from "@/components/listing/listing-view";
import { ProductView } from "@/components/product/product-view";
import { getProduct } from "@/lib/api";
import { categoryHref, productHref } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { alternates } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function load({ params }: Props) {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale as Locale);
  if (!product) notFound();
  return { locale: locale as Locale, product };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, product } = await load(props);
  const description = product.seoDescription ?? product.description?.slice(0, 160) ?? undefined;
  const firstImage = product.colors[0]?.images.find((i) => i.url)?.url;
  return {
    title: product.seoTitle ?? (product.brand ? `${product.title} — ${product.brand.name}` : product.title),
    description,
    alternates: alternates(locale, productHref(product.slug)),
    openGraph: { type: "website", title: product.title, description, ...(firstImage ? { images: [{ url: firstImage }] } : {}) },
  };
}

export default async function ProductPage(props: Props) {
  const { locale, product } = await load(props);
  const t = getMessages(locale);
  const url = SITE + localePath(locale, productHref(product.slug));

  // schema.org Product: one Offer per purchasable variant.
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    sku: product.reference,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    image: product.colors.flatMap((c) => c.images.filter((i) => i.url).map((i) => i.url)),
    color: product.colors.map((c) => c.name).join(", "),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      url,
      priceCurrency: product.currency,
      price: (v.priceMinor / 100).toFixed(2),
      availability: v.stock === "out_of_stock" ? "https://schema.org/OutOfStock" : v.stock === "low_stock" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    })),
  };
  const crumbs = breadcrumbJsonLd([
    ...product.breadcrumbs.map((b) => ({ name: b.name, url: SITE + localePath(locale, categoryHref(b.path)) })),
    { name: product.title, url },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([productLd, crumbs]).replace(/</g, "\\u003c") }} />
      <div className="shell pt-6 lg:pt-8">
        <div className="mb-6 hidden lg:block">
          <Breadcrumbs items={product.breadcrumbs} locale={locale} current={product.title} />
        </div>
        <ProductView product={product} />
      </div>
      <ProductRail id="related" title={t.product.related} products={product.related} locale={locale} />
    </>
  );
}
