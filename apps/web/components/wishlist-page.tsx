"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n-client";
import { api, useStore } from "@/lib/store";
import type { ProductCard as Card } from "@/lib/types";
import { ProductCard } from "./product-card";

export function WishlistPage() {
  const { t, href, locale } = useI18n();
  const W = t.wishlistPage;
  const { ready, user, wishlist } = useStore();
  const [items, setItems] = useState<Card[] | null>(null);
  const key = wishlist.join(",");

  useEffect(() => {
    if (!ready) return;
    if (!wishlist.length) return setItems([]);
    // Keep cards for removed items until the next load so the grid doesn't jump.
    api<{ items: Card[] }>(`/api/store/product-cards?locale=${locale}&ids=${key}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [ready, key, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell pb-24 pt-10 lg:pt-14">
      <h1 className="display text-[clamp(2.25rem,5vw,4.25rem)]">{W.title}</h1>
      {ready && !user && wishlist.length > 0 && (
        <p className="mt-4 text-small text-ink/70">
          {W.guestNote} <Link href={`${href("/account/login")}?next=/wishlist`} className="link-underline">{t.auth.signIn}</Link>
        </p>
      )}
      {items && items.length === 0 && (
        <div className="py-20">
          <p className="display text-3xl">{W.empty}</p>
          <p className="mt-3 text-body text-ink/70">{W.emptyText}</p>
          <Link href={href("/new")} className="btn btn-solid mt-8">{t.bag.continue}</Link>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="mt-10 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {items.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
        </ul>
      )}
    </div>
  );
}
