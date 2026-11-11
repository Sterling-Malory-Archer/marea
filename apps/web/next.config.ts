import path from "node:path";
import type { NextConfig } from "next";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
const mediaHosts = (process.env.NEXT_PUBLIC_MEDIA_HOSTS ?? "localhost")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const config: NextConfig = {
  poweredByHeader: false,
  // Container builds (infra/web.Dockerfile) ship a self-contained server; local `next start` doesn't need it.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const, outputFileTracingRoot: path.join(import.meta.dirname, "../..") } : {}),
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Media keys are unique per upload, so optimised copies never go stale.
    minimumCacheTTL: 31 * 24 * 3600,
    remotePatterns: mediaHosts.map((hostname) => ({ protocol: hostname === "localhost" ? "http" : "https", hostname })),
  },
  // The browser only ever talks to this origin; Next.js forwards API and media
  // requests to Express. Same-origin means SameSite cookies + no CORS surface.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/media/:path*", destination: `${apiUrl}/media/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
