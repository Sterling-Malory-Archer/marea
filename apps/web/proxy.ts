import { NextResponse, type NextRequest } from "next/server";

/*
 * Runs before every page request (storefront and admin):
 *
 * 1. Content Security Policy with a fresh nonce per request. Next.js reads the
 *    nonce from the request's CSP header and stamps it on its own scripts, so
 *    only scripts the app emitted can run — injected markup can't execute code.
 *    (Pages are rendered per request, which nonces require.)
 *
 * 2. Locale routing for the storefront.
 *      /…      → English (rewritten internally to /en/…)
 *      /me/…   → Montenegrin
 *      /en/…   → 308 to the unprefixed URL (one canonical address per page)
 *    The bare homepage honours a language chosen earlier (cookie). No other
 *    redirects: a shared link always opens in the language it was shared in.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";
const MEDIA_HOSTS = (process.env.NEXT_PUBLIC_MEDIA_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => h && h !== "localhost")
  .map((h) => `https://${h}`);

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonce-approved Next.js runtime load its own chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes (colour swatches, chart sizes) need inline styles; styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...MEDIA_HOSTS].join(" "),
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Phase 7: add the payment provider's checkout origin to form-action / frame-src here.
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    ...(SITE.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const finish = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    // Staging/test deployments: keep every page out of search engines.
    if (process.env.SITE_INDEXING === "off") res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  };

  if (pathname === "/admin" || pathname.startsWith("/admin/")) return finish(NextResponse.next({ request: { headers } }));

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/me" || pathname.startsWith("/me/")) return finish(NextResponse.next({ request: { headers } }));

  if (pathname === "/" && req.cookies.get("marea_locale")?.value === "me") {
    const url = req.nextUrl.clone();
    url.pathname = "/me";
    return NextResponse.redirect(url, 307);
  }

  const url = req.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return finish(NextResponse.rewrite(url, { request: { headers } }));
}

export const config = {
  // Pages only: not the API/media proxies, Next internals or files with an extension.
  // (Router prefetches must pass through too — they need the locale rewrite.)
  matcher: ["/((?!api/|media/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
