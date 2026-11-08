/** One-shot job for external schedulers (cron, Abacus scheduled task). */
import { createPrismaClient } from "@marea/db";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createMailer } from "../modules/mail/mailer.js";
import { releaseExpiredReservations } from "../modules/orders/order.service.js";
import { createStorage } from "../modules/storage/storage.js";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL);
const db = createPrismaClient(env.DATABASE_URL);
const released = await releaseExpiredReservations({ env, db, log, storage: createStorage(env), mailer: createMailer(env, log) });
log.info({ released }, "Done");
await db.$disconnect();
