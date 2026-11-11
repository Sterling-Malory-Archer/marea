# Deployment

## 1. Abacus SuperComputer — open checks (not yet verified)

The brief asks us to confirm the hosting environment before relying on it. **These could not be inspected
from the development sandbox**, so they remain open. Please confirm each item (or give access so it can be checked):

| # | Question | Why it matters |
|---|---|---|
| 1 | Can it run **two long-lived Node.js 22 processes** (Next.js server + Express API), or Docker containers? | The storefront is server-rendered; it is not a static export. |
| 2 | **What database engine is provisioned?** Run `SELECT VERSION();` and `SHOW ENGINES;`. | Must be **MySQL 8.x with InnoDB**. If Abacus auto-provisions PostgreSQL or anything else, use an external managed MySQL 8 (e.g. AWS RDS, DigitalOcean, Aiven, a VPS) instead. |
| 3 | Can the app reach MySQL over **TLS** on a private network? Can we create a least-privilege user? | Production URL uses `?ssl=true`; the app user should not be root. |
| 4 | Is there **outbound HTTPS** to `binaries.prisma.sh` during build, or can we ship the Prisma schema engine in the image? | `prisma migrate deploy` needs the schema engine binary. |
| 5 | Custom **domain + TLS certificates**, and can we set response headers? | HTTPS is mandatory (cookies are `Secure` in production). |
| 6 | **Environment variables / secrets** store? | No secret is ever committed. |
| 7 | **Automated database backups** with point-in-time recovery? Retention? | Required by the brief. |
| 8 | Log retention and error monitoring hook (e.g. Sentry DSN)? | Phase 9. |
| 9 | Can a **scheduled job** run every few minutes? | To release stock held by unpaid orders (Phase 6). |

If any answer is "no", the code stays the same — only the hosting target changes.

## 2. Release procedure

The step-by-step runbook (staging, go-live, rollback, backups, monitoring) is in **[LAUNCH.md](LAUNCH.md)**.
In short:

```bash
# images: infra/api.Dockerfile (API + migrations + seed) and infra/web.Dockerfile (storefront/admin, standalone)
docker compose -f infra/deploy/docker-compose.yml build
docker compose run --rm api npm run release:migrate   # prisma migrate deploy — non-destructive, every release
docker compose up -d
node scripts/smoke.mjs https://www.example.me          # read-only post-deploy checks
```

`prisma migrate deploy` only applies new migrations; it never resets data. Never run `migrate dev` or
`migrate reset` against staging or production.

## 3. Required production environment

See `.env.example`. In production the API refuses to boot unless `STORAGE_DRIVER=s3`, `COOKIE_SECURE=true`, `MAIL_DRIVER=smtp` and `MEDIA_PUBLIC_BASE_URL` is the bucket/CDN `https://` URL (add that host to `NEXT_PUBLIC_MEDIA_HOSTS` for image optimisation).

## 4. Security requirements for the hosting (Phase 9 review)

These are properties of the deployment, not the code — check each one on staging before launch.

- **Only the reverse proxy is public.** Visitors reach a load balancer / reverse proxy (HTTPS) that forwards to the
  Next.js server. The Next.js port and the API port (4000) must not be reachable from the internet; the API should
  listen on a private network only.
- **The proxy must append the visitor's IP to `X-Forwarded-For`** (nginx: `proxy_set_header X-Forwarded-For
  $proxy_add_x_forwarded_for;`). Next.js passes that header to the API unchanged and the API trusts exactly one hop
  (`TRUST_PROXY_HOPS=1`), so rate limits and sign-in lockouts apply per visitor. If there are two proxies in front
  (e.g. CDN + load balancer), set `TRUST_PROXY_HOPS=2`. Getting this wrong either lumps all visitors into one rate
  limit or lets an attacker pretend to be someone else.
- **HTTPS everywhere**: `NEXT_PUBLIC_SITE_URL` must start with `https://` (this also turns on
  `upgrade-insecure-requests` in the Content Security Policy) and `COOKIE_SECURE=true`.
- **Staging** sets `SITE_INDEXING=off`: robots.txt blocks everything and every page sends `X-Robots-Tag: noindex`.
- **Content Security Policy** is generated per request in `apps/web/proxy.ts` (nonce-based). When the card payment
  provider is added (Phase 7), add its checkout origin to `form-action` / `frame-src` there.
- **Secrets**: `COOKIE_SECRET` (32+ random bytes), database, S3 and SMTP credentials live only in the host's secret
  store. Rotate `COOKIE_SECRET` → all sessions and guest bags are invalidated (by design).
- **Dependency audit** runs in CI (`pnpm audit --prod --audit-level=high`); a new advisory fails the build until the
  package is updated.

## 5. Note about the development sandbox

The sandbox used to build Phases 1–3 blocks `binaries.prisma.sh`, so the Prisma schema engine was compiled from
Prisma's official source at the exact commit the CLI expects and supplied via `PRISMA_SCHEMA_ENGINE_BINARY`. This
affects nothing in the repository: on a normal machine or in CI, `pnpm install` downloads the engine as usual.
