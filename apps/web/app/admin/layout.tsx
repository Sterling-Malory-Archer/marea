import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/jost";
import "../globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/shell";
import { AdminSessionProvider } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: { default: "Admin — MAREA", template: "%s — MAREA admin" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// The admin is a separate root layout: English-only, never indexed, no storefront chrome.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-paper">
        <Suspense>
          <AdminSessionProvider>
            <AdminShell>{children}</AdminShell>
          </AdminSessionProvider>
        </Suspense>
      </body>
    </html>
  );
}
