import { execSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";

/**
 * Brings the dedicated test database up to date with the committed migrations
 * (non-destructive `migrate deploy`) and applies the idempotent base seed.
 *
 * Tests never wipe data: each one creates uniquely-named records, so they pass
 * on a fresh database (CI) and on one with leftovers from earlier runs. To start
 * from scratch locally, reset the TEST database yourself:
 *   DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @marea/db exec prisma migrate reset
 */
export default function setup() {
  const root = path.resolve(import.meta.dirname, "../../..");
  loadEnv({ path: path.join(root, ".env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end in _test");

  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" };
  const cwd = path.join(root, "packages/db");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd, env, stdio: "pipe" });
}
