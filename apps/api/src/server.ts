import { createPrismaClient } from "@marea/db";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createStorage } from "./modules/storage/storage.js";

const env = loadEnv();
const log = createLogger(env.LOG_LEVEL);
const db = createPrismaClient(env.DATABASE_URL);
const storage = createStorage(env);

const app = createApp({ env, db, log, storage });
const server = app.listen(env.API_PORT, () => {
  log.info({ port: env.API_PORT, storage: storage.driver, env: env.NODE_ENV }, "MAREA API listening");
});

async function shutdown(signal: string) {
  log.info({ signal }, "Shutting down");
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
