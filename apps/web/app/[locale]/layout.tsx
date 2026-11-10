import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getLayout } from "@/lib/api";
import { isLocale, LOCALE_META, LOCALES, type Locale } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n-client";
import { StoreProvider } from "@/lib/store";
import { BagDrawer } from "@/components/bag/bag-drawer";
import { getMessages } from "@/lib/messages";
import { fontVariables } from "../fonts/fonts";
import { share, SITE_URL } from "@/lib/seo";

// Rendered per request (with a short data cache) so admin edits appear quickly.
export const dynamic = "force-dynamic";


type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { settings } = await getLayout(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${settings.storeName} — ${settings.tagline}`, template: `%s — ${settings.storeName}` },
    description: settings.tagline,
    ...share(locale, settings.storeName, {}),
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = { themeColor: "#F8F7F4", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: Props & { children: React.ReactNode }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const layout = await getLayout(locale);
  const t = getMessages(locale);
  return (
    <html lang={LOCALE_META[locale].htmlLang} className={fontVariables}>
      <body className="min-h-svh">
        <I18nProvider locale={locale}>
          <StoreProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-paper focus:px-4 focus:py-2">
            {t.nav.skip}
          </a>
          <AnnouncementBar items={layout.announcements} />
          <Header storeName={layout.settings.storeName} navigation={layout.navigation} />
          <main id="main">{children}</main>
          <Footer layout={layout} locale={locale} />
          <BagDrawer />
          </StoreProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
