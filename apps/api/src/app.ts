import crypto from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { trustedOrigins } from "./config/env.js";
import { createAlerter } from "./lib/alerts.js";
import type { AppContext } from "./context.js";
import { loadCustomer, requireAdmin } from "./middleware/auth.js";
import { errorHandler, notFoundHandler, originCheck } from "./middleware/http.js";
import { adminAuthRouter } from "./modules/auth/admin-auth.routes.js";
import { productsAdminRouter } from "./modules/catalog/admin/products.routes.js";
import { taxonomyAdminRouter } from "./modules/catalog/admin/taxonomy.routes.js";
import { storefrontRouter } from "./modules/storefront/storefront.routes.js";
import { translationsAdminRouter } from "./modules/i18n/translations-admin.routes.js";
import { customerAuthRouter } from "./modules/customers/auth.routes.js";
import { accountRouter } from "./modules/customers/account.routes.js";
import { cartRouter } from "./modules/cart/cart.routes.js";
import { checkoutRouter } from "./modules/checkout/checkout.routes.js";
import { ordersAdminRouter } from "./modules/orders/orders-admin.routes.js";
import { dashboardRouter } from "./modules/admin/dashboard.routes.js";
import { peopleRouter } from "./modules/admin/people.routes.js";
import { commerceRouter } from "./modules/admin/commerce.routes.js";
import { contentRouter } from "./modules/admin/content.routes.js";
import { limitFor } from "./lib/rate-limit.js";

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable("x-powered-by");
  // How many proxies sit in front of the API and append to X-Forwarded-For. The
  // Next.js rewrite passes the header through without adding a hop, so behind a
  // load balancer that appends the client IP this stays 1. See docs/DEPLOYMENT.md.
  app.set("trust proxy", ctx.env.TRUST_PROXY_HOPS);

  app.use((req, res, next) => {
    const incoming = req.get("x-request-id");
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
  });
  if (ctx.env.NODE_ENV !== "test") {
    app.use(pinoHttp({ logger: ctx.log, genReqId: (req) => (req as express.Request).requestId! }));
  }
  app.use(
    helmet({
      // The API returns JSON only; the storefront sets its own CSP.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(cookieParser(ctx.env.COOKIE_SECRET));
  app.use(express.json({ limit: "200kb" }));

  // Development media server for the local storage driver.
  if (ctx.storage.driver === "local") {
    app.use(
      "/media",
      helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
      express.static(path.resolve(ctx.env.LOCAL_STORAGE_DIR), { immutable: true, maxAge: "365d", index: false, dotfiles: "deny" }),
    );
  }

  app.get("/health", async (_req, res) => {
    try {
      const [row] = await ctx.db.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
      res.json({ status: "ok", database: { reachable: true, version: row?.v } });
    } catch {
      res.status(503).json({ status: "degraded", database: { reachable: false } });
    }
  });

  const api = Router();
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: limitFor(ctx.env, 300),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      // The storefront server renders pages for every visitor from one address; it
      // identifies itself with a private key so it isn't throttled as one "visitor".
      // Only read-only storefront requests qualify.
      skip: (req) => req.method === "GET" && req.path.startsWith("/store/") && isInternal(req.get("x-internal-key"), ctx.env.INTERNAL_API_KEY),
    }),
  );
  // Payment webhooks (Phase 7) authenticate by signature, not by origin.
  api.use(originCheck(trustedOrigins(ctx.env), { exemptPrefixes: ["/webhooks/"] }));
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  api.use("/store", storefrontRouter(ctx));
  const customer = loadCustomer(ctx);
  api.use("/auth", customer, customerAuthRouter(ctx));
  api.use("/account", customer, accountRouter(ctx));
  api.use("/cart", customer, cartRouter(ctx));
  api.use("/checkout", customer, checkoutRouter(ctx));
  api.use("/admin/auth", adminAuthRouter(ctx));

  const admin = Router();
  admin.use(requireAdmin(ctx));
  admin.use(taxonomyAdminRouter(ctx));
  admin.use(productsAdminRouter(ctx));
  admin.use(translationsAdminRouter(ctx));
  admin.use(ordersAdminRouter(ctx));
  admin.use(dashboardRouter(ctx));
  admin.use(peopleRouter(ctx));
  admin.use(commerceRouter(ctx));
  admin.use(contentRouter(ctx));
  api.use("/admin", admin);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler(ctx.log, createAlerter(ctx.env.ALERT_WEBHOOK_URL, ctx.log, "API")));
  return app;
}

function isInternal(given: string | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
