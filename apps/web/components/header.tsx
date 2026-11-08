"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { categoryHref } from "@/lib/format";
import type { NavCategory } from "@/lib/types";
import { useWishlist } from "@/lib/wishlist";
import { BagIcon, ChevronIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";

type NavItem = { label: string; href: string; children?: NavCategory["children"]; accent?: boolean; path?: string };

export function Header({ storeName, navigation }: { storeName: string; navigation: NavCategory[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { count: wishCount } = useWishlist();
  const pathname = usePathname();

  const items: NavItem[] = [
    { label: "New Arrivals", href: "/new" },
    ...navigation.map((c) => ({ label: c.name, href: categoryHref(c.path), children: c.children, path: c.path })),
    { label: "Sale", href: "/sale", accent: true },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <header
      className={`sticky top-0 z-40 bg-paper/95 backdrop-blur-sm transition-[border-color] duration-300 ${
        scrolled ? "border-b border-line" : "border-b border-transparent"
      }`}
    >
      <div className="shell grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-[4.5rem]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="-ml-2 p-2 lg:hidden"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>
          <Link href="/" className="wordmark hidden text-[1.375rem] lg:block" aria-label={`${storeName} — home`}>
            {storeName}
          </Link>
        </div>

        {/* On small screens the wordmark takes the centre column. */}
        <Link href="/" className="wordmark text-[1.2rem] lg:hidden" aria-label={`${storeName} — home`}>
          {storeName}
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-7 xl:gap-9">
            {items.map((item) => (
              <li key={item.href} className="group relative">
                <Link
                  href={item.href}
                  className={`relative block py-6 text-small tracking-[0.02em] transition-colors ${
                    item.accent ? "text-claret" : "text-ink hover:text-ink/70"
                  } ${pathname.startsWith(item.href) ? "after:absolute after:inset-x-0 after:bottom-4 after:h-px after:bg-current" : ""}`}
                >
                  {item.label}
                </Link>
                {item.children && item.children.length > 0 && (
                  <div className="invisible absolute left-1/2 top-full -translate-x-1/2 pt-px opacity-0 transition-opacity duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <div className="min-w-[15rem] border border-line bg-paper px-6 py-5">
                      <ul className="space-y-2.5">
                        <li>
                          <Link href={item.href} className="text-small font-medium hover:text-claret">
                            All {item.label.toLowerCase()}
                          </Link>
                        </li>
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <Link href={categoryHref(child.path)} className="text-small text-ink/75 hover:text-ink">
                              {child.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center justify-end gap-0.5 sm:gap-1.5">
          <Link href="/search" className="p-2" aria-label="Search">
            <SearchIcon />
          </Link>
          <Link href="/account" className="hidden p-2 sm:block" aria-label="Account">
            <UserIcon />
          </Link>
          <Link href="/wishlist" className="relative p-2" aria-label={`Wishlist, ${wishCount} item${wishCount === 1 ? "" : "s"}`}>
            <HeartIcon />
            {wishCount > 0 && <CountBadge n={wishCount} />}
          </Link>
          {/* Bag count is wired to the MySQL cart in Phase 5. */}
          <Link href="/bag" className="relative -mr-2 p-2" aria-label="Shopping bag">
            <BagIcon />
          </Link>
        </div>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={items} storeName={storeName} />
    </header>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[0.625rem] leading-none text-paper">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function MobileDrawer({ open, onClose, items, storeName }: { open: boolean; onClose: () => void; items: NavItem[]; storeName: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        // Keep keyboard focus inside the open drawer.
        const f = panelRef.current.querySelectorAll<HTMLElement>("a, button");
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-ink/30 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-[min(88vw,24rem)] flex-col bg-paper transition-transform duration-300 ease-out-soft ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <span className="wordmark text-lg">{storeName}</span>
          <button type="button" className="-mr-2 p-2" onClick={onClose} aria-label="Close menu" tabIndex={open ? 0 : -1}>
            <CloseIcon />
          </button>
        </div>
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-4">
          <ul>
            {items.map((item) => (
              <li key={item.href} className="border-b border-line">
                {item.children?.length ? (
                  <>
                    <button
                      type="button"
                      tabIndex={open ? 0 : -1}
                      className="flex min-h-14 w-full items-center justify-between text-left text-lead"
                      aria-expanded={expanded === item.href}
                      onClick={() => setExpanded(expanded === item.href ? null : item.href)}
                    >
                      {item.label}
                      <ChevronIcon className={`transition-transform ${expanded === item.href ? "rotate-90" : ""}`} />
                    </button>
                    {expanded === item.href && (
                      <ul className="pb-4 pl-1">
                        <li>
                          <Link href={item.href} className="block py-2 text-body font-medium" tabIndex={open ? 0 : -1}>
                            All {item.label.toLowerCase()}
                          </Link>
                        </li>
                        {item.children.map((c) => (
                          <li key={c.id}>
                            <Link href={categoryHref(c.path)} className="block py-2 text-body text-ink/75" tabIndex={open ? 0 : -1}>
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    tabIndex={open ? 0 : -1}
                    className={`flex min-h-14 items-center text-lead ${item.accent ? "text-claret" : ""}`}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid grid-cols-2 gap-3 border-t border-line p-5">
          <Link href="/account" className="btn btn-outline" tabIndex={open ? 0 : -1}>Account</Link>
          <Link href="/wishlist" className="btn btn-outline" tabIndex={open ? 0 : -1}>Wishlist</Link>
        </div>
      </div>
    </div>
  );
}
