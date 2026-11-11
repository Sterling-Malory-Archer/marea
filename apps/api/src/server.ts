import { createPrismaClient } from "@marea/db";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createStorage } from "./modules/storage/storage.js";
import { createMailer } from "./modules/mail/mailer.js";
import { releaseExpiredReservations } from "./modules/orders/order.service.js";
import { createAlerter } from "./lib/alerts.js";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL);
const db = createPrismaClient(env.DATABASE_URL);
const storage = createStorage(env);

const mailer = createMailer(env, log);
const alert = createAlerter(env.ALERT_WEBHOOK_URL, log, "API");
const app = createApp({ env, db, log, storage, mailer });
const server = app.listen(env.API_PORT, () => {
  log.info({ port: env.API_PORT, storage: storage.driver, mail: mailer.driver, env: env.NODE_ENV }, "MAREA API listening");
});

async function shutdown(signal: string) {
  log.info({ signal }, "Shutting down");
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
// Release stock held by unpaid online-payment orders. Safe with several API
// instances (each order is re-checked under a row lock). Disable with JOBS_ENABLED=false
// when an external scheduler runs `pnpm --filter @marea/api job:release-reservations`.
if (process.env.JOBS_ENABLED !== "false") {
  const timer = setInterval(() => {
    releaseExpiredReservations({ env, db, log, storage, mailer })
      .then((n) => n && log.info({ released: n }, "Expired reservations released"))
      .catch((err) => {
        log.error({ err }, "Reservation job failed");
        alert("stock reservation job failed — see server logs");
      });
  }, 60_000);
  timer.unref();
}

process.on("unhandledRejection", (err) => {
  log.error({ err }, "Unhandled promise rejection");
  alert("unhandled promise rejection — see server logs");
});
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
