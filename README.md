# MAREA — fashion e-commerce

A production-grade online store for clothing, footwear, bags and accessories.
Modular monolith: **Next.js 16** storefront · **Express 5** REST API · **MySQL 8 (InnoDB)** via **Prisma 7** · S3-compatible media storage.

> "MAREA" is a working name. The store name, tagline, currency, VAT rate, delivery thresholds and every homepage text are database settings editable without code changes.

## Repository layout

```
apps/api        Express + TypeScript REST API (auth, catalogue admin, storefront, …)
apps/web        Next.js App Router storefront (Tailwind CSS 4)
packages/db     Prisma schema, migrations, seed scripts, typed client factory
e2e/            Playwright browser journeys (storefront, checkout, accounts, admin)
infra/          Dockerfiles; infra/deploy = single-server bundle (Caddy HTTPS + web + API)
scripts/        Local setup, database backup/restore, post-deploy smoke test
docs/           Architecture, deployment, launch runbook, phase log
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
pnpm e2e         # browser journeys against the running site (first time: npx playwright install chromium)
pnpm build
```

CI (`.github/workflows/ci.yml`) runs the same steps against a MySQL 8 service container, fails if the committed
migrations drift from `schema.prisma` or a production dependency has a known high/critical vulnerability, then
runs the browser journeys against the production (standalone) build with a fresh database.

## Deploying

See [docs/LAUNCH.md](docs/LAUNCH.md) (staging → go-live → backups → monitoring) and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (hosting requirements and security).

## Status

See [docs/PHASES.md](docs/PHASES.md). Phases 1–6 and 8–10 are built; card payments (Phase 7) wait for the
choice of payment provider; going live waits for the hosting.
