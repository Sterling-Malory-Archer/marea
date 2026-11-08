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

## Run it on your computer

You need **Node.js 22+**, **pnpm** (`corepack enable`) and **Docker Desktop** (running).

```bash
git clone https://github.com/Sterling-Malory-Archer/marea.git
cd marea
pnpm setup:local     # creates .env, starts MySQL 8 in Docker, migrates, seeds demo products
pnpm dev             # storefront on http://localhost:3000 (Montenegrin: /me), API on :4000
```

`setup:local` prints the admin login it created. Remove demo data at any time with
`pnpm --filter @marea/db seed:demo --purge`.

Manual alternative: copy `.env.example` to `.env`, point `DATABASE_URL` at any MySQL 8 server, then run
`pnpm install && pnpm --filter @marea/db build && pnpm db:deploy && pnpm db:seed && pnpm dev`.

## Quality gates

```bash
pnpm typecheck   # all packages
pnpm test        # API integration tests against a real MySQL test database (TEST_DATABASE_URL)
pnpm build
```

CI (`.github/workflows/ci.yml`) runs the same steps against a MySQL 8 service container and fails if the
committed migrations ever drift from `schema.prisma`.

## Status

See [docs/PHASES.md](docs/PHASES.md). Phases 1–4 are complete; accounts, cart and checkout come next.
