import Link from "next/link";
import { categoryHref, formatMoney } from "@/lib/format";
import { LOCALE_META, localePath, type Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import type { Layout } from "@/lib/types";
import { FooterLanguageSwitch } from "./footer-language";
import { Newsletter } from "./newsletter";

export function Footer({ layout, locale }: { layout: Layout; locale: Locale }) {
  const { settings, navigation } = layout;
  const t = getMessages(locale);
  const f = t.footer;
  const to = (p: string) => localePath(locale, p);
  const year = new Date().getFullYear();

  const columns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: f.shop,
      links: [{ label: t.nav.newArrivals, href: to("/new") }, ...navigation.map((c) => ({ label: c.name, href: to(categoryHref(c.path)) })), { label: t.nav.sale, href: to("/sale") }],
    },
    {
      title: f.care,
      links: [
        { label: f.contact, href: to("/help/contact") },
        { label: f.shipping, href: to("/help/shipping") },
        { label: f.returns, href: to("/help/returns") },
        { label: f.sizeGuide, href: to("/help/size-guide") },
        { label: f.account, href: to("/account") },
      ],
    },
    {
      title: f.about,
      links: [
        { label: f.aboutUs, href: to("/about") },
        { label: f.privacy, href: to("/help/privacy") },
        { label: f.terms, href: to("/help/terms") },
      ],
    },
  ];

  // Only list payment methods that are actually enabled. Card payments are added in Phase 7.
  const payments = [settings.codEnabled && f.cod].filter(Boolean) as string[];
  const money = (m: number) => formatMoney(m, settings.currency, LOCALE_META[locale].intl);

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
            <p className="mt-6 max-w-[24rem] text-small text-ink/70">{f.freeDelivery(money(settings.freeShippingOverMinor), settings.returnsDays)}</p>
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
                    <Link href={l.href} className="text-small text-ink/70 hover:text-ink">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="shell flex flex-col gap-4 border-t border-line py-6 text-micro text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} {settings.storeName}. {f.rights}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <FooterLanguageSwitch />
          {payments.length > 0 && (
            <p>
              <span className="sr-only">{f.payments}: </span>
              {payments.join(", ")}
            </p>
          )}
          {settings.instagramUrl && (
            <a href={settings.instagramUrl} rel="noopener noreferrer" target="_blank" className="hover:text-ink">Instagram</a>
          )}
        </div>
      </div>
    </footer>
  );
}
