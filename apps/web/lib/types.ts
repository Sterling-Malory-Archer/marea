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
