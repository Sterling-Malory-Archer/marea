import { NextResponse, type NextRequest } from "next/server";

/**
 * Locale routing.
 *   /…      → English (rewritten internally to /en/…)
 *   /me/…   → Montenegrin
 *   /en/…   → 308 to the unprefixed URL (one canonical address per page)
 * The bare homepage honours a language the visitor chose earlier (cookie). No
 * other redirects: a shared link always opens in the language it was shared in.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/me" || pathname.startsWith("/me/")) return NextResponse.next();

  if (pathname === "/" && req.cookies.get("marea_locale")?.value === "me") {
    const url = req.nextUrl.clone();
    url.pathname = "/me";
    return NextResponse.redirect(url, 307);
  }

  const url = req.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API/media proxies, Next internals and files with an extension.
  matcher: ["/((?!api/|media/|_next/|admin(?:/|$)|.*\\.[a-zA-Z0-9]+$).*)"],
};
