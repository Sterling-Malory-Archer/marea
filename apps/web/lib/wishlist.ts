"use client";

import { useStore } from "./store";

/** Wishlist: browser-local for guests, MySQL-backed (and merged on sign-in) for customers. */
export function useWishlist() {
  const { wishlist, toggleWishlist } = useStore();
  return { ids: wishlist, has: (id: number) => wishlist.includes(id), toggle: toggleWishlist, count: wishlist.length };
}
