"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAdmin, type Permission } from "@/lib/admin/session";

const NAV: { group: string; items: [string, string, Permission][] }[] = [
  { group: "", items: [["/admin", "Dashboard", "dashboard:read"]] },
  { group: "Sales", items: [["/admin/orders", "Orders", "orders:read"], ["/admin/customers", "Customers", "customers:read"], ["/admin/coupons", "Discount codes", "dashboard:read"]] },
  { group: "Catalogue", items: [["/admin/products", "Products", "catalog:read"], ["/admin/catalogue", "Brands & categories", "catalog:read"]] },
  { group: "Storefront", items: [["/admin/content", "Homepage & content", "content:write"], ["/admin/newsletter", "Newsletter", "customers:read"]] },
  { group: "Store", items: [["/admin/shipping", "Delivery", "dashboard:read"], ["/admin/settings", "Settings", "dashboard:read"], ["/admin/staff", "Staff", "admins:manage"], ["/admin/audit", "Activity log", "audit:read"]] },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, ready, can, signOut } = useAdmin();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/admin/login" || pathname.endsWith("/print")) return <>{children}</>;
  if (!ready || !user) return <div className="min-h-svh" aria-busy="true" />;

  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const nav = (
    <nav aria-label="Admin" className="space-y-6 text-small">
      {NAV.map((g) => {
        const items = g.items.filter(([, , p]) => can(p));
        if (!items.length) return null;
        return (
          <div key={g.group || "main"}>
            {g.group && <p className="mb-2 px-3 text-micro text-mute">{g.group}</p>}
            <ul className="space-y-0.5">
              {items.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} aria-current={active(href) ? "page" : undefined} className={`block px-3 py-1.5 ${active(href) ? "bg-sand text-ink" : "text-ink/75 hover:bg-sand/60 hover:text-ink"}`}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 overflow-y-auto border-r border-line bg-white px-3 py-5 transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/admin" className="wordmark mb-8 block px-3 text-lg">MAREA</Link>
        {nav}
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-paper/95 px-5 backdrop-blur-sm lg:px-8">
          <button type="button" className="-ml-2 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">☰</button>
          <a href="/" target="_blank" rel="noopener" className="text-small text-mute hover:text-ink">View store ↗</a>
          <div className="flex items-center gap-4 text-small">
            <span className="hidden text-mute sm:inline">{user.email} · {user.role.replace("_", " ").toLowerCase()}</span>
            <button type="button" onClick={signOut} className="underline underline-offset-2 hover:text-claret">Sign out</button>
          </div>
        </header>
        <main id="main" className="px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
