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

```bash
pnpm install --frozen-lockfile
pnpm build                                    # db client, API, storefront
pnpm db:deploy                                # prisma migrate deploy — non-destructive, run once per release
node apps/api/dist/server.js                  # API (private network only)
pnpm --filter @marea/web start                # storefront (public, behind HTTPS)
```

`prisma migrate deploy` only applies new migrations; it never resets data. Never run `migrate dev` or
`migrate reset` against staging or production.

## 3. Required production environment

See `.env.example`. In production the API refuses to boot unless `STORAGE_DRIVER=s3` and `COOKIE_SECURE=true`.

## 4. Note about the development sandbox

The sandbox used to build Phases 1–3 blocks `binaries.prisma.sh`, so the Prisma schema engine was compiled from
Prisma's official source at the exact commit the CLI expects and supplied via `PRISMA_SCHEMA_ENGINE_BINARY`. This
affects nothing in the repository: on a normal machine or in CI, `pnpm install` downloads the engine as usual.
