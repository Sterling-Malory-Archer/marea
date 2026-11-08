"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n-client";
import type { Cart, Customer } from "./types";

/**
 * Client-side session state: the signed-in customer, the bag and the wishlist.
 * The server is always the source of truth — every mutation returns the
 * re-priced bag, which replaces local state.
 */

export class ApiError extends Error {
  constructor(public status: number, public code: string | undefined, public details: Record<string, unknown> | undefined, message: string, public fields?: { path: string; message: string }[]) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.details?.code ?? e.code, e.details, e.message ?? "Request failed", e.fields);
  }
  return body as T;
}

const WL_KEY = "marea.wishlist.v1";
const readLocal = (): number[] => {
  try {
    const v = JSON.parse(localStorage.getItem(WL_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
};
const writeLocal = (ids: number[]) => {
  try {
    localStorage.setItem(WL_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
};

interface Store {
  ready: boolean;
  user: Customer | null;
  setUser: (u: Customer | null) => void;
  signOut: () => Promise<void>;
  cart: Cart | null;
  setCart: (c: Cart) => void;
  refreshCart: () => Promise<void>;
  addToBag: (variantId: number, quantity: number) => Promise<Cart>;
  drawerOpen: boolean;
  setDrawerOpen: (o: boolean) => void;
  wishlist: number[];
  toggleWishlist: (productId: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const [ready, setReady] = useState(false);
  const [user, setUserState] = useState<Customer | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const userRef = useRef<Customer | null>(null);

  const refreshCart = useCallback(async () => {
    setCart(await api<Cart>(`/api/cart?locale=${locale}`));
  }, [locale]);

  const loadWishlist = useCallback(async (u: Customer | null) => {
    if (!u) return setWishlist(readLocal());
    const local = readLocal();
    // First load after sign-in: move this browser's guest wishlist into the account.
    const res = local.length
      ? await api<{ productIds: number[] }>("/api/account/wishlist/merge", { method: "POST", json: { productIds: local } })
      : await api<{ productIds: number[] }>(`/api/account/wishlist?locale=${locale}`);
    if (local.length) writeLocal([]);
    setWishlist(res.productIds);
  }, [locale]);

  const setUser = useCallback((u: Customer | null) => {
    userRef.current = u;
    setUserState(u);
    void loadWishlist(u).catch(() => undefined);
    void refreshCart().catch(() => undefined);
  }, [loadWishlist, refreshCart]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user: u } = await api<{ user: Customer | null }>("/api/auth/me");
        if (!alive) return;
        userRef.current = u;
        setUserState(u);
        await Promise.all([loadWishlist(u), refreshCart()]);
      } catch {
        /* storefront still works without session state */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadWishlist, refreshCart]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, [setUser]);

  const addToBag = useCallback(async (variantId: number, quantity: number) => {
    const c = await api<Cart>(`/api/cart/items?locale=${locale}`, { method: "POST", json: { variantId, quantity } });
    setCart(c);
    setDrawerOpen(true);
    return c;
  }, [locale]);

  const toggleWishlist = useCallback((productId: number) => {
    setWishlist((cur) => {
      const has = cur.includes(productId);
      const next = has ? cur.filter((x) => x !== productId) : [...cur, productId];
      if (userRef.current) {
        void api(`/api/account/wishlist/${productId}`, { method: has ? "DELETE" : "PUT" }).catch(() => setWishlist(cur));
      } else writeLocal(next);
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({ ready, user, setUser, signOut, cart, setCart, refreshCart, addToBag, drawerOpen, setDrawerOpen, wishlist, toggleWishlist }),
    [ready, user, setUser, signOut, cart, refreshCart, addToBag, drawerOpen, wishlist, toggleWishlist],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
