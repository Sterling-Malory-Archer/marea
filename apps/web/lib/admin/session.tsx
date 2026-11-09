"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../store";

export type Permission =
  | "dashboard:read" | "catalog:read" | "catalog:write" | "inventory:write" | "orders:read" | "orders:write" | "refunds:write"
  | "customers:read" | "customers:write" | "content:write" | "coupons:write" | "settings:write" | "admins:manage" | "audit:read";

export interface AdminUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface Session {
  user: AdminUser | null;
  permissions: Permission[];
  ready: boolean;
  can: (p: Permission) => boolean;
  setSession: (u: AdminUser | null, p: Permission[]) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

/** Loads the admin session once; every admin page is gated by it (the API enforces it again). */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api<{ user: AdminUser; permissions: Permission[] }>("/api/admin/auth/me")
      .then((r) => {
        setUser(r.user);
        setPermissions(r.permissions);
      })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && !user && pathname !== "/admin/login") router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, pathname, router]);

  const setSession = useCallback((u: AdminUser | null, p: Permission[]) => {
    setUser(u);
    setPermissions(p);
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setPermissions([]);
    router.replace("/admin/login");
  }, [router]);

  return <Ctx.Provider value={{ user, permissions, ready, can: (p) => permissions.includes(p), setSession, signOut }}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useAdmin outside AdminSessionProvider");
  return s;
}

/** Fetch an admin endpoint; re-runs when `path` changes. */
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export const eur = (minor: number | null | undefined, currency = "EUR") =>
  minor == null ? "—" : new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(minor / 100);

export const when = (iso: string | Date | null | undefined, withTime = true) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Europe/Podgorica" }).format(new Date(iso)) : "—";
