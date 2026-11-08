// Response shapes of the storefront API (apps/api/src/modules/storefront).

export interface StoreSettings {
  storeName: string;
  tagline: string;
  currency: string;
  locale: string;
  freeShippingOverMinor: number | null;
  codEnabled: boolean;
  returnsDays: number;
  supportEmail: string;
  supportPhone: string;
  instagramUrl: string;
}

export interface NavCategory {
  id: number;
  name: string;
  slug: string;
  path: string;
  imageUrl?: string | null;
  children: { id: number; name: string; slug: string; path: string }[];
}

export interface Announcement {
  id: number;
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
}

export interface Layout {
  locale: "en" | "me";
  settings: StoreSettings;
  announcements: Announcement[];
  navigation: NavCategory[];
}

export interface HeroSlide {
  id: number;
  layout: "SPLIT_RIGHT" | "SPLIT_LEFT" | "FULL_BLEED";
  eyebrow: string | null;
  headline: string;
  body: string | null;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string | null;
  secondaryCtaUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageIsPlaceholder: boolean;
  panelColor: string;
}

export interface CollectionTile {
  id: number;
  title: string;
  slug: string;
  eyebrow: string | null;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface ProductCard {
  id: number;
  slug: string;
  title: string;
  brand: { name: string; slug: string } | null;
  currency: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  discountPercent: number | null;
  isOnSale: boolean;
  isNewArrival: boolean;
  inStock: boolean;
  colors: { name: string; slug: string; hex: string }[];
  images: { url: string | null; alt: string; width: number | null; height: number | null; isPlaceholder: boolean }[];
}

export interface ContentBlock {
  id: number;
  eyebrow: string | null;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageIsPlaceholder: boolean;
}

export interface Home {
  hero: HeroSlide[];
  featuredCollections: CollectionTile[];
  newArrivals: ProductCard[];
  bestsellers: ProductCard[];
  editorial: ContentBlock | null;
  services: ContentBlock[];
}

export interface Breadcrumb {
  name: string;
  path: string;
}

export interface CategoryInfo {
  id: number;
  name: string;
  path: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  breadcrumbs: Breadcrumb[];
  children: { id: number; name: string; path: string }[];
}

export interface CollectionInfo {
  id: number;
  slug: string;
  title: string;
  eyebrow: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  imageUrl: string | null;
}

export type SortKey = "relevance" | "newest" | "price_asc" | "price_desc" | "bestselling";

export interface Listing {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: SortKey;
  facets: {
    brands: { slug: string; name: string; count: number }[];
    sizes: { label: string; scale: string; scaleName: string; count: number }[];
    colors: { slug: string; name: string; hex: string; count: number }[];
    price: { min: number; max: number } | null;
    saleCount: number;
  };
}

export interface ProductImage {
  id: number;
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  kind: string;
  colorId: number | null;
  isPlaceholder: boolean;
}

export interface ProductDetail {
  id: number;
  slug: string;
  reference: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  composition: string | null;
  care: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  brand: { name: string; slug: string } | null;
  currency: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  discountPercent: number | null;
  isNewArrival: boolean;
  breadcrumbs: Breadcrumb[];
  colors: { id: number; slug: string; name: string; hex: string; images: ProductImage[] }[];
  sizes: string[];
  sizeScale: { code: string; name: string; guide: { columns: string[]; rows: string[][]; note?: string } | null };
  variants: { id: number; sku: string; colorSlug: string; size: string; priceMinor: number; stock: "in_stock" | "low_stock" | "out_of_stock"; lowStockCount: number | null }[];
  delivery: {
    methods: { code: string; priceMinor: number; freeOverMinor: number | null; minDays: number | null; maxDays: number | null }[];
    codEnabled: boolean;
    returnsDays: number;
  };
  related: ProductCard[];
}
