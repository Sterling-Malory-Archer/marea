# Architecture

## Shape: a modular monolith

```
 Browser ──HTTPS──▶ Next.js (apps/web) ──rewrite /api/*, /media/*──▶ Express API (apps/api) ──▶ MySQL 8 (InnoDB)
                     │ server components fetch                         │
                     └── API_INTERNAL_URL (private network) ───────────┘── S3-compatible object storage
```

* **One origin for the browser.** Next.js proxies `/api/*` to Express, so cookies are first-party and
  `SameSite`, and the API needs no CORS. Express is never exposed publicly in production.
* **Logical modules inside the API** (`apps/api/src/modules/*`): `auth`, `catalog` (admin + product cards),
  `inventory`, `storefront`, `storage`, `settings`, `audit`. Phase 5–8 add `customers`, `cart`,
  `checkout`, `orders`, `payments`, `shipping`, `notifications` as siblings. Modules share one
  `AppContext` (env, db, logger, storage) injected at startup — no global singletons.
* **Database access only through `@marea/db`** (Prisma client + MariaDB/MySQL driver adapter).

## Data model highlights (`packages/db/prisma/schema.prisma`)

| Concern | Design |
|---|---|
| Money | Integer minor units (`priceMinor`, cents) + ISO currency. No floats. Prices are VAT-inclusive; orders store the VAT portion. |
| Variants | `product_variants` = one colour × one size, own SKU, own `inventory` row. Unique `(productId, colorId, sizeId)`. |
| Size systems | `size_scales` + `sizes` (XS–XXL, IT numeric, jeans waist, EU footwear, one-size, or any custom scale). A product uses exactly one scale. |
| Inventory | `quantityOnHand` and `quantityReserved`; all changes are single guarded `UPDATE`s inside transactions (no overselling under concurrency — tested with 10 parallel reservations for 3 units) and an append-only `inventory_movements` ledger. |
| Order history | `orders` / `order_items` snapshot titles, SKUs, colour, size, prices and addresses at purchase time. Catalogue FKs become `NULL` if a product is ever deleted; history is unaffected. Products referenced by orders can only be archived. |
| Payments | `payments` (one per attempt, idempotency key), `payment_events` (every webhook stored before processing, unique per provider event id → idempotent), `refunds`. No card data or CVV is ever stored. |
| Media | Binaries in S3-compatible storage under content-unique keys; MySQL stores key, dimensions, MIME, alt text, colourway, and an `isPlaceholder` flag. |
| Content | `hero_slides`, `announcement_messages`, `content_blocks`, `collections`, `store_settings` — the homepage is entirely database-driven. |
| Audit | `admin_audit_log` records actor, action, entity, before/after snapshots, IP and user agent for every admin write. |

All 39 application tables use InnoDB, utf8mb4, 46 foreign keys, and indexes for every storefront filter path.

## Security model (implemented so far)

* **Sessions:** opaque 256-bit tokens in `httpOnly` cookies; only SHA-256 hashes stored. Separate admin cookie
  (`SameSite=Strict`, 12 h TTL) and customer cookie (`SameSite=Lax`).
* **Passwords:** Argon2id (OWASP parameters), constant-time handling for unknown e-mails, lockout after 5 failures.
* **CSRF:** state-changing requests must carry a trusted `Origin`/`Referer`; payment webhooks are exempt and
  authenticate by signature instead (Phase 7).
* **RBAC:** roles `OWNER`, `ADMIN`, `CATALOG_MANAGER`, `ORDER_MANAGER`, `CONTENT_EDITOR`, mapped to
  fine-grained permissions in `modules/auth/permissions.ts`.
* **Input:** every body/query/param validated with Zod; Prisma parameterises all SQL (raw inventory SQL uses
  tagged templates — still parameterised).
* **Uploads:** type sniffed by decoding (not by extension), minimum resolution enforced, EXIF/GPS stripped.
* **Headers:** Helmet on the API; HSTS, frame-deny, nosniff, referrer and permissions policies on the web app.
* **Rate limiting:** global API limit plus stricter limits on login and newsletter.
* **Secrets:** environment only; boot fails fast on invalid configuration; production refuses local storage
  or insecure cookies.
