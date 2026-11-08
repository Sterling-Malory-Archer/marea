import Link from "next/link";
import { categoryHref, formatMoney } from "@/lib/format";
import type { Layout } from "@/lib/types";
import { Newsletter } from "./newsletter";

export function Footer({ layout }: { layout: Layout }) {
  const { settings, navigation } = layout;
  const year = new Date().getFullYear();

  const columns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "Shop",
      links: [{ label: "New arrivals", href: "/new" }, ...navigation.map((c) => ({ label: c.name, href: categoryHref(c.path) })), { label: "Sale", href: "/sale" }],
    },
    {
      title: "Customer care",
      links: [
        { label: "Contact us", href: "/help/contact" },
        { label: "Shipping", href: "/help/shipping" },
        { label: "Returns & exchanges", href: "/help/returns" },
        { label: "Size guide", href: "/help/size-guide" },
        { label: "Your account", href: "/account" },
      ],
    },
    {
      title: "About",
      links: [
        { label: "About us", href: "/about" },
        { label: "Journal", href: "/journal" },
        { label: "Privacy policy", href: "/help/privacy" },
        { label: "Terms & conditions", href: "/help/terms" },
      ],
    },
  ];

  // Only list payment methods that are actually enabled. Card payments are added in Phase 7.
  const payments = [settings.codEnabled && "Cash on delivery"].filter(Boolean) as string[];

  return (
    <footer className="mt-8 bg-sand">
      <div className="shell border-b border-line py-14 lg:py-20">
        <Newsletter storeName={settings.storeName} />
      </div>

      <div className="shell grid gap-12 py-14 lg:grid-cols-12 lg:py-16">
        <div className="lg:col-span-4">
          <p className="wordmark text-2xl">{settings.storeName}</p>
          <p className="mt-4 max-w-[22rem] text-small text-ink/70">{settings.tagline}</p>
          {settings.freeShippingOverMinor != null && (
            <p className="mt-6 text-small text-ink/70">
              Free delivery in Montenegro on orders over {formatMoney(settings.freeShippingOverMinor, settings.currency, settings.locale)}.
              Free exchanges within {settings.returnsDays} days.
            </p>
          )}
          {(settings.supportEmail || settings.supportPhone) && (
            <p className="mt-4 text-small">
              {settings.supportEmail && <a href={`mailto:${settings.supportEmail}`} className="link-underline">{settings.supportEmail}</a>}
              {settings.supportPhone && <span className="ml-4">{settings.supportPhone}</span>}
            </p>
          )}
        </div>
        <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7 lg:col-start-6">
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-small font-medium">{col.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-small text-ink/70 hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        </div>
      </div>

      <div className="shell flex flex-col gap-4 border-t border-line py-6 text-micro text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} {settings.storeName}. All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {payments.length > 0 && (
            <p>
              <span className="sr-only">Payment methods: </span>
              {payments.join(", ")}
            </p>
          )}
          {settings.instagramUrl && (
            <a href={settings.instagramUrl} rel="noopener noreferrer" target="_blank" className="hover:text-ink">
              Instagram
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
