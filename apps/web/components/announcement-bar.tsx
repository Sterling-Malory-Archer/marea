"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Announcement } from "@/lib/types";

export function AnnouncementBar({ items }: { items: Announcement[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length, paused]);

  if (items.length === 0) return null;
  const item = items[index]!;

  return (
    <div
      className="bg-ink text-paper"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="shell flex h-9 items-center justify-center text-micro tracking-[0.06em]" aria-live="polite">
        <p key={item.id} className="animate-[fade_0.6s_ease] truncate">
          {item.message}
          {item.linkUrl && (
            <Link href={item.linkUrl} className="link-underline ml-3 text-paper/80 hover:text-paper">
              {item.linkLabel ?? "Learn more"}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
