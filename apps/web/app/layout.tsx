import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/jost";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AnnouncementBar } from "@/components/announcement-bar";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getLayout } from "@/lib/api";

// Rendered per request (with a 60 s data cache) so admin edits appear quickly.
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getLayout();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${settings.storeName} — ${settings.tagline}`, template: `%s — ${settings.storeName}` },
    description: settings.tagline,
    openGraph: { siteName: settings.storeName, type: "website", locale: "en_GB" },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = { themeColor: "#F8F7F4", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const layout = await getLayout();
  return (
    <html lang="en">
      <body className="min-h-svh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-paper focus:px-4 focus:py-2">
          Skip to content
        </a>
        <AnnouncementBar items={layout.announcements} />
        <Header storeName={layout.settings.storeName} navigation={layout.navigation} />
        <main id="main">{children}</main>
        <Footer layout={layout} />
      </body>
    </html>
  );
}
