import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { breadcrumbJsonLd, ListingView } from "@/components/listing/listing-view";
import { getCategory, getLayout, getListing } from "@/lib/api";
import { categoryHref } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n";
import { absolute, alternates, share } from "@/lib/seo";
import type { SP } from "@/lib/url";

type Props = { params: Promise<{ locale: string; path: string[] }>; searchParams: Promise<SP> };

async function load(props: Props) {
  const { locale, path } = await props.params;
  const joined = path.map((p) => p.toLowerCase()).join("/");
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(joined)) notFound();
  const category = await getCategory(joined, locale as Locale);
  if (!category) notFound();
  return { locale: locale as Locale, category };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, category } = await load(props);
  const sp = await props.searchParams;
  const filtered = Object.keys(sp).some((k) => k !== "page");
  const { settings } = await getLayout(locale);
  const title = category.seoTitle ?? category.breadcrumbs.map((b) => b.name).reverse().join(" — ");
  const description = category.seoDescription ?? category.description ?? undefined;
  return {
    title,
    description,
    alternates: alternates(locale, categoryHref(category.path)),
    ...share(locale, settings.storeName, { title, description, path: categoryHref(category.path) }),
    // Filter combinations are useful to shoppers but thin duplicates for search engines.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage(props: Props) {
  const { locale, category } = await load(props);
  const sp = await props.searchParams;
  const listing = await getListing({ category: category.path }, sp, locale);
  // Show sibling categories when on a leaf, children when on a parent.
  const parentPath = category.breadcrumbs.length > 1 ? category.breadcrumbs.at(-2)!.path : null;
  const subs = category.children.length ? category.children : parentPath ? (await getCategory(parentPath, locale))?.children ?? [] : [];
  const ld = breadcrumbJsonLd(category.breadcrumbs.map((b) => ({ name: b.name, url: absolute(localePath(locale, categoryHref(b.path))) })));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <ListingView
        locale={locale}
        title={category.name}
        intro={category.description}
        breadcrumbs={category.breadcrumbs}
        subcategories={subs}
        activePath={category.path}
        listing={listing}
        sp={sp}
      />
    </>
  );
}
