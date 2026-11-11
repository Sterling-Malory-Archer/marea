# Launch runbook

Everything needed to put MAREA on a staging address, then live on the shop's domain — and to keep it
running. Commands assume the single-server bundle in `infra/deploy/` (Docker + Caddy). On a platform
that runs containers for you (e.g. Abacus, if it does), the same images, environment variables and
release commands apply; only "how to start a container" changes.

---

## 0. What has to exist first (owner)

| Item | Why | Status |
|---|---|---|
| **Hosting** — a Linux server (2 vCPU / 4 GB RAM is plenty to start) or a container platform | Runs the shop | ☐ |
| **MySQL 8** — managed, with automated backups + point-in-time recovery | Orders and customers live here | ☐ |
| **S3-compatible storage** for product photos (+ a public URL / CDN for it) | Photos must survive server rebuilds | ☐ |
| **Domain** with DNS access (e.g. `www.yourshop.me`) and a staging name (`staging.yourshop.me`) | HTTPS certificates are issued automatically once DNS points at the server | ☐ |
| **SMTP** sending service (Postmark, Mailgun, Amazon SES, Brevo…) with SPF/DKIM set on the domain | Order and password e-mails | ☐ |
| **Company details** (legal name, PIB, registration no., address) | Order documents and legal pages | ☐ |
| **Lawyer-checked** privacy policy and terms of sale | Legal requirement | ☐ |
| **Fiscalisation** approach agreed with your accountant | Fiscal receipts for every sale | ☐ |
| Real products and photos | — | ☐ |
| *(Later)* card payment provider contract | Phase 7 | ☐ |

---

## 1. Staging (a private copy on the real hosting)

1. **Server**: install Docker, clone the repository, `cd infra/deploy`.
2. **DNS**: point `staging.yourshop.me` at the server.
3. **Secrets**: `cp api.env.example api.env && cp web.env.example web.env`, then fill in. Generate secrets with
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`:
   - `COOKIE_SECRET` and `INTERNAL_API_KEY` (same key in both files) — different values from production.
   - In `web.env`: `SITE_INDEXING=off` (keeps staging out of Google).
   - Use a **separate database and bucket** from production.
4. **Start**: `SITE_DOMAIN=staging.yourshop.me MEDIA_HOST=media-staging.yourshop.me docker compose up -d --build`
5. **Database**: `docker compose run --rm api npm run release:migrate`, then
   `docker compose run --rm api npm run release:seed` (creates the base data, information pages and the owner
   account from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — then delete the password from `api.env`).
   Optional demo catalogue for testing: `docker compose run --rm api sh -c "cd node_modules/@marea/db && ./node_modules/.bin/tsx prisma/seed-demo.ts"`.
6. **Smoke test** from your computer: `node scripts/smoke.mjs https://staging.yourshop.me --staging`
7. **Full journey test** (creates test orders and customers — staging only, never production):
   ```bash
   E2E_BASE_URL=https://staging.yourshop.me SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… pnpm e2e
   ```
8. **By hand** on staging (the things automation can't judge):
   - [ ] Place an order with your own e-mail: confirmation arrives, looks right, isn't in spam. Same for the
         staff alert, "shipped" e-mail with tracking link, password reset, account verification.
   - [ ] Print an order confirmation and packing slip from the admin (A4).
   - [ ] On a real iPhone (Safari) and Android phone (Chrome): browse, filter, bag, checkout, Montenegrin switch.
   - [ ] Upload a real product photo; check it on the product page and in a shared link preview (WhatsApp/Instagram DM).
   - [ ] Invite a second staff member; check their role only shows what it should.
   - [ ] Admin → Dashboard → "Before launch" checklist is understood.

## 2. Production go-live

**Day before**
- [ ] Production `api.env` / `web.env` filled in (new secrets, `SITE_INDEXING=on`, `NODE_ENV=production`).
      The API refuses to start if HTTPS cookies, S3, SMTP, the internal key or the media URL are missing.
- [ ] DNS for `www` lowered to a short TTL (5 min).
- [ ] Owner account created (`release:seed`), demo data **not** loaded.
- [ ] Catalogue, photos, pages, company details, delivery prices and settings entered (they can be prepared on
      staging and re-entered, or the staging database restored into production with `scripts/restore-db.sh`
      after removing test orders — ask before doing this).
- [ ] Dashboard "Before launch" checklist is complete (8/8).
- [ ] First backup taken and a restore tested (section 4).

**Launch**
1. Point DNS at the production server; `SITE_DOMAIN=www.yourshop.me MEDIA_HOST=… docker compose up -d --build`.
2. `docker compose run --rm api npm run release:migrate`
3. `node scripts/smoke.mjs https://www.yourshop.me` — all checks must pass.
4. Place one real cash-on-delivery order yourself; cancel it in the admin (stock is returned).
5. Google Search Console: verify the domain, submit `https://www.yourshop.me/sitemap.xml`.
6. Turn on the uptime monitor and alert channel (section 5).

**Rollback** — every release is a git commit and two images.
- Code problem: `git checkout <previous tag> && docker compose up -d --build` (migrations only add things; the
  previous version keeps working with the newer database schema unless a release note says otherwise).
- Data problem: restore the last good backup into a **new** database, check it, then switch `DATABASE_URL`
  (section 4). Never restore over the live database while the shop is running.

## 3. Every later release

```bash
git pull && docker compose build && docker compose run --rm api npm run release:migrate && docker compose up -d
node scripts/smoke.mjs https://www.yourshop.me
```
CI must be green on the commit (unit/API tests, browser journeys, dependency audit). Release to staging first
when a change touches checkout, orders or the database.

## 4. Backups and the restore drill

- **Database**: the managed MySQL's automated backups with point-in-time recovery are the first line. In
  addition, a nightly off-site copy:
  `DATABASE_URL=… BACKUP_S3_URI=s3://yourshop-backups/db scripts/backup-db.sh` (cron `30 2 * * *`).
  Keep 30 daily + 12 monthly copies with a bucket lifecycle rule; the backup bucket should be in a different
  account or at least have versioning and delete protection.
- **Photos**: enable versioning on the media bucket (deleted/overwritten photos can be recovered) or sync it
  nightly to the backup bucket.
- **Restore drill — monthly** (10 minutes): restore last night's file into a scratch database and compare
  counts with production:
  `TARGET_DATABASE_URL=mysql://…/marea_drill scripts/restore-db.sh backups/marea-….sql.gz`
  A backup that has never been restored is not a backup.

## 5. Monitoring

| What | How | Alert to |
|---|---|---|
| Shop is up | Uptime monitor (e.g. UptimeRobot, Better Stack) on `https://www.yourshop.me/healthz` every minute; it returns `{"api":true}` when the API is reachable | Phone/e-mail |
| Server errors | Set `ALERT_WEBHOOK_URL` (Slack/Discord/Teams-compatible) in `api.env` and `web.env`: one message per minute at most, with the failing route and request id — never customer data | Team chat |
| Logs | Both containers log JSON to stdout; keep 30 days (Docker `json-file` with rotation, or the platform's log service). Search by the `requestId` from an alert | — |
| Certificates | Caddy renews automatically; the uptime monitor catches failures | — |
| Disk / database size | Hosting dashboard; alert at 80 % | — |
| Search & sharing | Google Search Console (coverage, Core Web Vitals) | Monthly look |

## 6. Routine maintenance

- **Weekly**: Admin → Orders: nothing stuck in "processing" for long; Admin → Activity log glance.
- **Monthly**: dependency updates (`pnpm up -r --latest` on a branch → CI → staging → production); restore
  drill; review staff accounts (remove people who left).
- **When CI's dependency audit fails**: update the flagged package promptly — it means a known vulnerability.
- **Every rotation of secrets** (staff changes, suspected leak): new `COOKIE_SECRET` signs everyone out and
  empties guest bags; new `INTERNAL_API_KEY` must be set in both env files at once.
