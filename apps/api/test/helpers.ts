import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import supertest from "supertest";
import { createPrismaClient, type UserRole } from "@marea/db";
import { createApp } from "../src/app.js";
import { loadEnv as parseEnv } from "../src/config/env.js";
import { createLogger } from "../src/lib/logger.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { createStorage } from "../src/modules/storage/storage.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

export const ORIGIN = "http://localhost:3000";
export const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "marea-media-"));

export const env = parseEnv({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL!,
  PUBLIC_WEB_URL: ORIGIN,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: storageDir,
  MEDIA_PUBLIC_BASE_URL: "http://localhost:4000/media",
});
export const db = createPrismaClient(env.DATABASE_URL);
export const storage = createStorage(env);
export const app = createApp({ env, db, log: createLogger("silent"), storage });

let seq = 0;
export const unique = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createStaff(role: UserRole, password = "Correct-horse-42") {
  const email = `${unique(role.toLowerCase())}@test.local`;
  const user = await db.user.create({ data: { email, role, passwordHash: await hashPassword(password) } });
  return { user, email, password };
}

/** A supertest agent that keeps cookies and always sends our Origin header. */
export async function loginAs(role: UserRole) {
  const { email, password, user } = await createStaff(role);
  const agent = supertest.agent(app).set("Origin", ORIGIN);
  const res = await agent.post("/api/admin/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user };
}

export const request = () => supertest(app);

export async function ids() {
  const [alpha, eu, oneSize] = await Promise.all([
    db.sizeScale.findUniqueOrThrow({ where: { code: "alpha" }, include: { sizes: { orderBy: { sortOrder: "asc" } } } }),
    db.sizeScale.findUniqueOrThrow({ where: { code: "eu-shoe" }, include: { sizes: true } }),
    db.sizeScale.findUniqueOrThrow({ where: { code: "one-size" }, include: { sizes: true } }),
  ]);
  const colors = await db.color.findMany({ where: { slug: { in: ["black", "camel", "ivory"] } }, orderBy: { sortOrder: "asc" } });
  const coats = await db.category.findUniqueOrThrow({ where: { path: "women/coats" } });
  return { alpha, eu, oneSize, colors, coats };
}
