"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Badge, btn, PageHeader, useListParams } from "@/components/admin/ui";
import { ResourceManager, YesNo, type FieldDef } from "@/components/admin/form";
import { useAdmin, useAdminData, when } from "@/lib/admin/session";

interface Hero { id: number; layout: string; eyebrow: string | null; headline: string; body: string | null; primaryCtaLabel: string; primaryCtaUrl: string; imageKey: string | null; imageUrl: string | null; imageIsPlaceholder: boolean; panelColor: string; isActive: boolean; sortOrder: number; startsAt: string | null; endsAt: string | null }
interface Announcement { id: number; message: string; linkLabel: string | null; linkUrl: string | null; isActive: boolean; sortOrder: number; startsAt: string | null; endsAt: string | null }
interface Block { id: number; placement: string; eyebrow: string | null; title: string; body: string | null; imageUrl: string | null; imageIsPlaceholder: boolean; isActive: boolean; sortOrder: number }
interface InfoPage { id: number; slug: string; kind: string; title: string; intro: string | null; body: string | null; isPublished: boolean; needsReview: boolean; updatedAt: string; translations: { locale: string }[] }
interface Collection { id: number; title: string; slug: string; eyebrow: string | null; isActive: boolean; featuredOnHome: boolean; sortOrder: number; imageUrl: string | null; _count: { products: number } }

const linkHelp = "A store path like /new or /c/women/knitwear, or a full https:// link.";
const schedule: FieldDef[] = [
  { name: "startsAt", label: "Show from", type: "datetime", nullable: true, half: true, help: "Optional." },
  { name: "endsAt", label: "Show until", type: "datetime", nullable: true, half: true, help: "Optional." },
];
const visibility: FieldDef[] = [
  { name: "isActive", label: "Visible", type: "bool", half: true },
  { name: "sortOrder", label: "Order", type: "number", half: true, help: "Lower numbers come first." },
];

const HERO_FIELDS: FieldDef[] = [
  { name: "headline", label: "Headline", type: "text", required: true, maxLength: 120 },
  { name: "eyebrow", label: "Small line above", type: "text", nullable: true, half: true, placeholder: "e.g. Autumn / Winter 26" },
  { name: "layout", label: "Layout", type: "select", required: true, half: true, options: [["SPLIT_RIGHT", "Text left, image right"], ["SPLIT_LEFT", "Image left, text right"], ["FULL_BLEED", "Full-width image"]] },
  { name: "body", label: "Text", type: "textarea", nullable: true, rows: 3, maxLength: 400 },
  { name: "primaryCtaLabel", label: "Main button", type: "text", required: true, half: true },
  { name: "primaryCtaUrl", label: "Main button link", type: "text", required: true, half: true, help: linkHelp },
  { name: "secondaryCtaLabel", label: "Second button (optional)", type: "text", nullable: true, half: true },
  { name: "secondaryCtaUrl", label: "Second button link", type: "text", nullable: true, half: true },
  { name: "imageKey", label: "Campaign image", type: "image", nullable: true, help: "Portrait or landscape, at least 1200px. Until an image is uploaded a clearly marked placeholder is shown." },
  { name: "imageAlt", label: "Image description", type: "text", nullable: true, help: "For screen readers, e.g. “Model in a camel wool coat on a pier”." },
  { name: "panelColor", label: "Background colour", type: "color", half: true },
  { name: "imageIsPlaceholder", label: "Image is a placeholder", type: "bool", half: true, help: "Cleared automatically when you upload an image." },
  ...schedule,
  ...visibility,
];

const ANNOUNCEMENT_FIELDS: FieldDef[] = [
  { name: "message", label: "Message", type: "text", required: true, maxLength: 200 },
  { name: "linkLabel", label: "Link text", type: "text", nullable: true, half: true },
  { name: "linkUrl", label: "Link", type: "text", nullable: true, half: true, help: linkHelp },
  ...schedule,
  ...visibility,
];

const BLOCK_FIELDS: FieldDef[] = [
  { name: "placement", label: "Where", type: "select", required: true, options: [["HOME_EDITORIAL", "Homepage — editorial story"], ["HOME_SERVICE_STRIP", "Homepage — service strip (delivery, returns…)"]] },
  { name: "title", label: "Title", type: "text", required: true },
  { name: "eyebrow", label: "Small line above", type: "text", nullable: true },
  { name: "body", label: "Text", type: "textarea", nullable: true, rows: 4 },
  { name: "ctaLabel", label: "Link text", type: "text", nullable: true, half: true },
  { name: "ctaUrl", label: "Link", type: "text", nullable: true, half: true, help: linkHelp },
  { name: "imageKey", label: "Image", type: "image", nullable: true, show: (v) => v.placement === "HOME_EDITORIAL" },
  { name: "imageAlt", label: "Image description", type: "text", nullable: true, show: (v) => v.placement === "HOME_EDITORIAL" },
  { name: "imageIsPlaceholder", label: "Image is a placeholder", type: "bool", show: (v) => v.placement === "HOME_EDITORIAL" },
  ...visibility,
];

const COLLECTION_FIELDS: FieldDef[] = [
  { name: "title", label: "Title", type: "text", required: true, half: true },
  { name: "slug", label: "URL", type: "slug", half: true, help: "/collections/…  Leave empty to generate." },
  { name: "eyebrow", label: "Small line above", type: "text", nullable: true },
  { name: "description", label: "Intro text", type: "textarea", nullable: true, rows: 3 },
  { name: "imageKey", label: "Cover image", type: "image", nullable: true },
  { name: "featuredOnHome", label: "Feature on the homepage", type: "bool" },
  { name: "seoTitle", label: "Search title", type: "text", nullable: true },
  { name: "seoDescription", label: "Search description", type: "textarea", nullable: true, rows: 2 },
  ...visibility,
];

const PAGE_FIELDS = (row: InfoPage | null): FieldDef[] => [
  { name: "title", label: "Title", type: "text", required: true, maxLength: 160 },
  { name: "slug", label: "Address", type: "text", required: true, half: true, help: "e.g. help/returns or about — the page lives at /help/returns (and /me/help/returns).", placeholder: "help/…" },
  { name: "kind", label: "Adds automatically", type: "select", required: true, half: true, disabled: !!row, options: [["STANDARD", "Nothing — text only"], ["CONTACT", "Contact details from Settings"], ["SHIPPING", "Delivery prices and times"], ["SIZE_GUIDE", "All size guides"], ["LEGAL", "“Last updated” date"]] },
  { name: "intro", label: "Intro", type: "textarea", nullable: true, rows: 2, maxLength: 500 },
  {
    name: "body", label: "Text", type: "textarea", nullable: true, rows: 18,
    help: <>Formatting: a line starting with <code>## </code> is a heading, <code>- </code> a list item, <code>**bold**</code>, links as <code>[label](/help/returns)</code>. Empty line = new paragraph. These fill in from Settings: <code>{"{{storeName}} {{supportEmail}} {{supportPhone}} {{returnDays}} {{companyName}} {{companyAddress}} {{companyTaxId}} {{companyRegistrationNo}}"}</code></>,
  },
  { name: "seoTitle", label: "Search title", type: "text", nullable: true },
  { name: "seoDescription", label: "Search description", type: "textarea", nullable: true, rows: 2 },
  { name: "isPublished", label: "Published", type: "bool", half: true },
  { name: "needsReview", label: "Draft text — show “being finalised” note", type: "bool", half: true, help: "Untick once the text is final (legal pages: after your lawyer has checked them)." },
];

const TABS = [["hero", "Hero slides"], ["announcements", "Announcement bar"], ["blocks", "Homepage blocks"], ["collections", "Collections"], ["pages", "Pages"]] as const;

function Thumb({ url, placeholder, bg }: { url: string | null; placeholder?: boolean; bg?: string }) {
  return (
    <div className="flex h-14 w-11 items-center justify-center overflow-hidden" style={{ background: bg ?? "var(--color-sand)" }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : <span className="px-0.5 text-center text-[8px] uppercase leading-tight tracking-wide text-ink">{placeholder ? "Place­holder" : "No image"}</span>}
    </div>
  );
}

const scheduleLabel = (s: { startsAt: string | null; endsAt: string | null }) =>
  s.startsAt || s.endsAt ? `${s.startsAt ? when(s.startsAt, false) : "now"} – ${s.endsAt ? when(s.endsAt, false) : "open"}` : "Always";

export default function ContentPage() {
  return <Suspense><Content /></Suspense>;
}

function Content() {
  const lp = useListParams();
  const tab = (lp.get("tab") || "hero") as (typeof TABS)[number][0];
  return (
    <>
      <PageHeader title="Homepage & content" subtitle="Campaign slides, the announcement bar, homepage stories and collections. Every item has English and Montenegrin text." actions={<a href="/" target="_blank" rel="noopener" className={btn.secondary}>Preview homepage ↗</a>} />
      <nav aria-label="Sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => lp.set({ tab: k === "hero" ? null : k })} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-small ${tab === k ? "border-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}</button>
        ))}
      </nav>
      {tab === "hero" && <HeroTab />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "blocks" && <BlocksTab />}
      {tab === "collections" && <CollectionsTab />}
      {tab === "pages" && <PagesTab />}
    </>
  );
}

function HeroTab() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Hero[] }>("/api/admin/hero-slides");
  return (
    <ResourceManager<Hero>
      noun="slide"
      rows={data?.items ?? null}
      canWrite={can("content:write")}
      onChanged={reload}
      fields={HERO_FIELDS}
      newDefaults={{ layout: "SPLIT_RIGHT", panelColor: "#EEECE7", isActive: false, sortOrder: (data?.items.length ?? 0), primaryCtaLabel: "Shop now", primaryCtaUrl: "/new" }}
      createPath="/api/admin/hero-slides"
      patchPath={(r) => `/api/admin/hero-slides/${r.id}`}
      deletePath={(r) => `/api/admin/hero-slides/${r.id}`}
      translation={{ entity: "heroSlide", fields: [{ name: "headline", label: "Headline", required: true }, { name: "eyebrow", label: "Small line above" }, { name: "body", label: "Text", multiline: true }, { name: "primaryCtaLabel", label: "Main button" }, { name: "secondaryCtaLabel", label: "Second button" }, { name: "imageAlt", label: "Image description" }] }}
      columns={[
        { header: "", render: (h) => <Thumb url={h.imageUrl} placeholder={h.imageIsPlaceholder} bg={h.panelColor} /> },
        { header: "Slide", render: (h) => <>{h.headline}<div className="text-micro text-mute">{h.eyebrow ?? ""}{h.eyebrow ? " · " : ""}{h.primaryCtaLabel} → {h.primaryCtaUrl}</div></> },
        { header: "Shown", render: (h) => <span className="text-mute">{scheduleLabel(h)}</span> },
        { header: "Order", render: (h) => <span className="tabular-nums">{h.sortOrder}</span> },
        { header: "Status", render: (h) => <Badge value={h.isActive ? "Visible" : "Hidden"} tone={h.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function AnnouncementsTab() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Announcement[] }>("/api/admin/announcements");
  return (
    <ResourceManager<Announcement>
      noun="message"
      rows={data?.items ?? null}
      canWrite={can("content:write")}
      onChanged={reload}
      fields={ANNOUNCEMENT_FIELDS}
      newDefaults={{ isActive: true, sortOrder: data?.items.length ?? 0 }}
      createPath="/api/admin/announcements"
      patchPath={(r) => `/api/admin/announcements/${r.id}`}
      deletePath={(r) => `/api/admin/announcements/${r.id}`}
      translation={{ entity: "announcement", fields: [{ name: "message", label: "Message", required: true }, { name: "linkLabel", label: "Link text" }] }}
      columns={[
        { header: "Message", render: (a) => <>{a.message}{a.linkUrl && <div className="text-micro text-mute">{a.linkLabel ?? "Link"} → {a.linkUrl}</div>}</> },
        { header: "Shown", render: (a) => <span className="text-mute">{scheduleLabel(a)}</span> },
        { header: "Status", render: (a) => <Badge value={a.isActive ? "Visible" : "Hidden"} tone={a.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function BlocksTab() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Block[] }>("/api/admin/content-blocks");
  return (
    <ResourceManager<Block>
      noun="block"
      rows={data?.items ?? null}
      canWrite={can("content:write")}
      onChanged={reload}
      fields={BLOCK_FIELDS}
      newDefaults={{ placement: "HOME_EDITORIAL", isActive: true, sortOrder: 0 }}
      createPath="/api/admin/content-blocks"
      patchPath={(r) => `/api/admin/content-blocks/${r.id}`}
      deletePath={(r) => `/api/admin/content-blocks/${r.id}`}
      translation={{ entity: "contentBlock", fields: [{ name: "title", label: "Title", required: true }, { name: "eyebrow", label: "Small line above" }, { name: "body", label: "Text", multiline: true }, { name: "ctaLabel", label: "Link text" }, { name: "imageAlt", label: "Image description" }] }}
      columns={[
        { header: "Where", render: (b) => <span className="text-mute">{b.placement === "HOME_EDITORIAL" ? "Editorial" : "Service strip"}</span> },
        { header: "Title", render: (b) => <>{b.title}{b.body && <div className="line-clamp-1 max-w-md text-micro text-mute">{b.body}</div>}</> },
        { header: "Order", render: (b) => <span className="tabular-nums">{b.sortOrder}</span> },
        { header: "Status", render: (b) => <Badge value={b.isActive ? "Visible" : "Hidden"} tone={b.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function CollectionsTab() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: Collection[] }>("/api/admin/collections");
  return (
    <ResourceManager<Collection>
      noun="collection"
      rows={data?.items ?? null}
      canWrite={can("content:write")}
      onChanged={reload}
      fields={COLLECTION_FIELDS}
      newDefaults={{ isActive: true, featuredOnHome: false, sortOrder: data?.items.length ?? 0 }}
      createPath="/api/admin/collections"
      patchPath={(r) => `/api/admin/collections/${r.id}`}
      deletePath={(r) => `/api/admin/collections/${r.id}`}
      deleteHint="Products stay in the catalogue; only the grouping is removed."
      translation={{ entity: "collection", fields: [{ name: "title", label: "Title", required: true }, { name: "eyebrow", label: "Small line above" }, { name: "description", label: "Intro text", multiline: true }, { name: "seoTitle", label: "Search title" }, { name: "seoDescription", label: "Search description", multiline: true }] }}
      rowActions={(c) => <Link href={`/admin/content/collections/${c.id}`} className={btn.link}>Products ({c._count.products})</Link>}
      columns={[
        { header: "", render: (c) => <Thumb url={c.imageUrl} /> },
        { header: "Collection", render: (c) => <>{c.title}<div className="font-mono text-micro text-mute">/collections/{c.slug}</div></> },
        { header: "On homepage", render: (c) => <YesNo value={c.featuredOnHome} /> },
        { header: "Status", render: (c) => <Badge value={c.isActive ? "Visible" : "Hidden"} tone={c.isActive ? "good" : "neutral"} /> },
      ]}
    />
  );
}

function PagesTab() {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<{ items: InfoPage[] }>("/api/admin/pages");
  const review = data?.items.filter((p) => p.needsReview && p.isPublished).length ?? 0;
  return (
    <>
      {review > 0 && (
        <p className="mb-4 max-w-3xl border-l-2 border-[#6B4A00] bg-[#FBF6EA] px-4 py-3 text-small">
          {review} page{review === 1 ? " has" : "s have"} starter text written for you. Read and adjust {review === 1 ? "it" : "them"}, have the privacy policy and terms checked by a lawyer, then untick “Draft text”.
        </p>
      )}
      <ResourceManager<InfoPage>
        noun="page"
        rows={data?.items ?? null}
        canWrite={can("content:write")}
        onChanged={reload}
        fields={PAGE_FIELDS}
        newDefaults={{ kind: "STANDARD", isPublished: true, needsReview: false, slug: "help/" }}
        createPath="/api/admin/pages"
        patchPath={(r) => `/api/admin/pages/${r.id}`}
        deletePath={(r) => `/api/admin/pages/${r.id}`}
        deleteHint="Links to it in the footer will show “page not found”. Unpublishing is usually better."
        translation={{ entity: "page", fields: [{ name: "title", label: "Title", required: true }, { name: "intro", label: "Intro", multiline: true }, { name: "body", label: "Text", multiline: true }, { name: "seoTitle", label: "Search title" }, { name: "seoDescription", label: "Search description", multiline: true }] }}
        rowActions={(p) => p.isPublished ? <a href={`/${p.slug}`} target="_blank" rel="noopener" className={btn.link}>View ↗</a> : null}
        columns={[
          { header: "Page", render: (p) => <>{p.title}<div className="font-mono text-micro text-mute">/{p.slug}</div></> },
          { header: "Montenegrin", render: (p) => (p.translations.some((t) => t.locale === "me") ? "Yes" : <span className="text-claret">Missing</span>) },
          { header: "Updated", render: (p) => <span className="text-mute">{when(p.updatedAt, false)}</span> },
          { header: "Status", render: (p) => <span className="flex gap-1.5"><Badge value={p.isPublished ? "Published" : "Hidden"} tone={p.isPublished ? "good" : "neutral"} />{p.needsReview && <Badge value="Draft text" tone="warn" />}</span> },
        ]}
      />
    </>
  );
}
