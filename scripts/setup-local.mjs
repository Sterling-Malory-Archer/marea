#!/usr/bin/env node
/**
 * One-command local setup (macOS, Windows, Linux).
 * Requires: Node.js 22+, pnpm, Docker Desktop (running).
 *
 *   pnpm setup:local   → creates .env, starts MySQL 8 in Docker, migrates, seeds demo data
 *   pnpm dev           → storefront http://localhost:3000, API http://localhost:4000
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
const step = (msg) => console.log(`\n\x1b[1m▸ ${msg}\x1b[0m`);

function check(cmd, hint) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    console.error(`\n✗ ${hint}`);
    process.exit(1);
  }
}

check("docker info", "Docker is not running. Install Docker Desktop (https://www.docker.com/products/docker-desktop/) and start it.");
check("pnpm --version", "pnpm is missing. Run: corepack enable");

let adminPassword;
if (!fs.existsSync(envPath)) {
  step("Creating .env with fresh local secrets");
  adminPassword = crypto.randomBytes(12).toString("base64url");
  const db = "mysql://marea:marea-dev-only@127.0.0.1:3306";
  const env = fs
    .readFileSync(path.join(root, ".env.example"), "utf8")
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${db}/marea"`)
    .replace(/^TEST_DATABASE_URL=.*$/m, `TEST_DATABASE_URL="${db}/marea_test"`)
    .replace(/^COOKIE_SECRET=.*$/m, `COOKIE_SECRET="${crypto.randomBytes(48).toString("base64")}"`)
    .replace(/^SEED_ADMIN_EMAIL=.*$/m, `SEED_ADMIN_EMAIL="admin@marea.local"`)
    .replace(/^SEED_ADMIN_PASSWORD=.*$/m, `SEED_ADMIN_PASSWORD="${adminPassword}"`);
  fs.writeFileSync(envPath, `${env}\nSHADOW_DATABASE_URL="${db}/marea_shadow"\n`);
} else {
  step(".env already exists — keeping it");
}

step("Starting MySQL 8 (Docker)");
run("docker compose up -d mysql");
process.stdout.write("Waiting for MySQL");
for (let i = 0; ; i++) {
  try {
    execSync("docker compose exec -T mysql mysqladmin ping -h 127.0.0.1 --silent", { cwd: root, stdio: "ignore" });
    break;
  } catch {
    if (i > 60) throw new Error("MySQL did not start within 2 minutes");
    process.stdout.write(".");
    execSync(process.platform === "win32" ? "timeout /t 2 >NUL" : "sleep 2");
  }
}
console.log(" ready");

step("Installing dependencies");
run("pnpm install");
step("Building the database client");
run("pnpm --filter @marea/db build");
step("Applying migrations");
run("pnpm db:deploy");
step("Seeding configuration and demo products");
run("pnpm db:seed");
run("pnpm db:seed:demo");

console.log(`
\x1b[32m✓ Ready.\x1b[0m Start the site with:  \x1b[1mpnpm dev\x1b[0m

  Storefront   http://localhost:3000        (Montenegrin: http://localhost:3000/me)
  API health   http://localhost:4000/health
${adminPassword ? `  Admin login  admin@marea.local / ${adminPassword}   (also saved in .env)\n` : ""}`);
