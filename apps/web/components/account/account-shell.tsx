"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stripLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-client";
import { api, useStore } from "@/lib/store";

/** Guards account pages (redirects to sign-in) and renders the account navigation. */
export function AccountShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t, href } = useI18n();
  const A = t.account;
  const { ready, user, signOut } = useStore();
  const router = useRouter();
  const pathname = stripLocale(usePathname());

  useEffect(() => {
    if (ready && !user) router.replace(`${href("/account/login")}?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, href, pathname]);

  if (!ready || !user) return <div className="shell min-h-[60svh] py-24" aria-busy="true" />;

  const nav = [
    ["/account", A.overview],
    ["/account/orders", A.orders],
    ["/account/details", A.details],
    ["/account/addresses", A.addresses],
    ["/wishlist", A.wishlist],
  ] as const;

  return (
    <div className="shell pb-24 pt-10 lg:pt-14">
      <p className="text-small text-mute">{A.title}</p>
      <h1 className="display mt-2 text-[clamp(2.25rem,5vw,4.25rem)]">{title}</h1>
      {!user.emailVerified && <VerifyBanner />}
      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <nav aria-label={A.title} className="-mx-5 overflow-x-auto px-5 lg:col-span-3 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 whitespace-nowrap border-b border-line lg:flex-col lg:border-b-0">
            {nav.map(([path, label]) => {
              const on = pathname === path || (path !== "/account" && pathname.startsWith(path));
              return (
                <li key={path}>
                  <Link
                    href={href(path)}
                    aria-current={on ? "page" : undefined}
                    className={`block px-3 py-3 text-small lg:border-l-2 lg:px-4 lg:py-2.5 ${on ? "border-b-2 border-ink text-ink lg:border-b-0 lg:border-l-ink" : "border-transparent text-ink/65 hover:text-ink lg:border-l-transparent"}`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
            <li className="lg:mt-6">
              <button type="button" onClick={() => signOut().then(() => router.push(href("/")))} className="block border-transparent px-3 py-3 text-small text-ink/65 hover:text-ink lg:border-l-2 lg:px-4 lg:py-2.5">
                {t.auth.signOut}
              </button>
            </li>
          </ul>
        </nav>
        <div className="lg:col-span-9">{children}</div>
      </div>
    </div>
  );
}

function VerifyBanner() {
  const { t } = useI18n();
  const [sent, setSent] = useState<"idle" | "sent" | "error">("idle");
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 bg-sand px-5 py-4 text-small">
      <p>{t.account.verifyBanner}</p>
      {sent !== "idle" ? (
        <p role="status" className={sent === "sent" ? "text-ink/70" : "text-claret"}>{sent === "sent" ? t.account.resent : t.auth.errors.generic}</p>
      ) : (
        <button type="button" className="link-underline" onClick={() => api("/api/auth/verify-email/resend", { method: "POST" }).then(() => setSent("sent")).catch(() => setSent("error"))}>
          {t.account.resend}
        </button>
      )}
    </div>
  );
}
