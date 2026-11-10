import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { localePath, type Locale } from "@/lib/i18n";

/*
 * A deliberately small Markdown subset for admin-edited pages:
 *   ## Heading   ### Subheading   - list item   1. numbered item
 *   **bold**   [label](/path or https://…)   blank line = new paragraph
 * Everything is rendered as React text — no HTML from the database ever
 * reaches the page, so the editor can't inject markup or scripts.
 */

type Block = { type: "h2" | "h3" | "p"; text: string } | { type: "ul" | "ol"; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) { flush(); blocks.push({ type: m[1]!.length === 2 ? "h2" : "h3", text: m[2]! }); continue; }
    if ((m = line.match(/^[-*]\s+(.+)$/))) { flush(); if (last?.type === "ul" && !para.length) last.items.push(m[1]!); else blocks.push({ type: "ul", items: [m[1]!] }); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.+)$/))) { flush(); if (last?.type === "ol") last.items.push(m[1]!); else blocks.push({ type: "ol", items: [m[1]!] }); continue; }
    para.push(line);
  }
  flush();
  return blocks;
}

function safeHref(href: string, locale: Locale): { href: string; external: boolean } | null {
  if (/^https:\/\/[^\s]+$/i.test(href)) return { href, external: true };
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return { href, external: true };
  if (/^\/[a-z0-9/_#?=&.-]*$/i.test(href)) return { href: localePath(locale, href), external: false };
  return null; // javascript:, data:, protocol-relative, etc. are shown as plain text
}

const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** **bold**, [links](…) and bare e-mail addresses inside a line of text. */
export function inline(text: string, locale: Locale): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0, m: RegExpExecArray | null, k = 0;
  const plain = (s: string) => {
    s.split(EMAIL).forEach((part, j) => {
      if (j % 2) out.push(<a key={`e${k++}`} href={`mailto:${part}`} className="link-underline">{part}</a>);
      else if (part) out.push(<Fragment key={`t${k++}`}>{part}</Fragment>);
    });
  };
  while ((m = re.exec(text))) {
    plain(text.slice(i, m.index));
    if (m[1] !== undefined) out.push(<strong key={`b${k++}`} className="font-medium">{m[1]}</strong>);
    else {
      const h = safeHref(m[3]!, locale);
      if (!h) out.push(<Fragment key={`l${k++}`}>{m[2]}</Fragment>);
      else if (h.external) out.push(<a key={`l${k++}`} href={h.href} className="link-underline" rel="noopener noreferrer" {...(h.href.startsWith("https") ? { target: "_blank" } : {})}>{m[2]}</a>);
      else out.push(<Link key={`l${k++}`} href={h.href} className="link-underline">{m[2]}</Link>);
    }
    i = re.lastIndex;
  }
  plain(text.slice(i));
  return out;
}

export function RichText({ source, locale }: { source: string; locale: Locale }) {
  return (
    <div className="space-y-4 text-body leading-7 text-ink/85">
      {parseBlocks(source).map((b, i) => {
        switch (b.type) {
          case "h2": return <h2 key={i} className="pt-6 text-lead font-medium text-ink first:pt-0">{inline(b.text, locale)}</h2>;
          case "h3": return <h3 key={i} className="pt-2 font-medium text-ink">{inline(b.text, locale)}</h3>;
          case "ul": return <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-mute">{b.items.map((t, j) => <li key={j}>{inline(t, locale)}</li>)}</ul>;
          case "ol": return <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-mute">{b.items.map((t, j) => <li key={j}>{inline(t, locale)}</li>)}</ol>;
          default: return <p key={i}>{inline(b.text, locale)}</p>;
        }
      })}
    </div>
  );
}
