"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Guest wishlist kept in the browser. Phase 5 merges it into the customer's
 * MySQL-backed wishlist on sign-in; until then it works fully for guests.
 */
const KEY = "marea.wishlist.v1";
const listeners = new Set<() => void>();
let cache: number[] | null = null;

function read(): number[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ids: number[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage full or blocked — keep in memory */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
};

const EMPTY: number[] = [];

export function useWishlist() {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((id: number) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);
  return { ids, has: (id: number) => ids.includes(id), toggle, count: ids.length };
}
