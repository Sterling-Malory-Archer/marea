# MAREA — fashion e-commerce

A production-grade online store for clothing, footwear, bags and accessories.
Modular monolith: **Next.js 16** storefront · **Express 5** REST API · **MySQL 8 (InnoDB)** via **Prisma 7** · S3-compatible media storage.

> "MAREA" is a working name. The store name, tagline, currency, VAT rate, delivery thresholds and every homepage text are database settings editable without code changes.

## Repository layout

```
apps/api        Express + TypeScript REST API (auth, catalogue admin, storefront, …)
apps/web        Next.js App Router storefront (Tailwind CSS 4)
packages/db     Prisma schema, migrations, seed scripts, typed client factory
infra/          Dockerfiles, MySQL init script
docs/           Architecture, deployment (incl. Abacus checklist), phase log
```

## Quick start (local)

```bash
cp .env.example .env              # then fill in secrets — see comments inside
docker compose up -d mysql        # or use any MySQL 8.x server
pnpm install
pnpm db:deploy                    # apply migrations
pnpm db:seed                      # base configuration + first OWNER account
pnpm db:seed:demo                 # OPTIONAL: placeholder demo products (dev only)
pnpm dev                          # API on :4000, storefront on :3000
```

Remove demo data at any time with `pnpm --filter @marea/db seed:demo --purge`.

## Quality gates

```bash
pnpm typecheck   # all packages
pnpm test        # API integration tests against a real MySQL test database (TEST_DATABASE_URL)
pnpm build
```

CI (`.github/workflows/ci.yml`) runs the same steps against a MySQL 8 service container and fails if the
committed migrations ever drift from `schema.prisma`.

## Status

See [docs/PHASES.md](docs/PHASES.md). Phases 1–3 are complete; checkout, payments and the admin UI come next.
