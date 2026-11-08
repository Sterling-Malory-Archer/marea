import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

/**
 * Translate a `mysql://user:pass@host:port/db?...` URL into the options the
 * MariaDB driver adapter expects. The MariaDB connector speaks the MySQL wire
 * protocol and is Prisma's supported driver for MySQL 8.
 */
export function connectionOptionsFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new Error(`DATABASE_URL must be a mysql:// URL (got ${url.protocol})`);
  }
  const params = url.searchParams;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectionLimit: Number(params.get("connection_limit") ?? 10),
    // MySQL 8 defaults to caching_sha2_password; over a non-TLS local socket the
    // driver needs to fetch the server key. In production, enable TLS (`ssl=true`).
    allowPublicKeyRetrieval: params.get("allowPublicKeyRetrieval") !== "false",
    ssl: params.get("ssl") === "true" ? { rejectUnauthorized: true } : undefined,
    timezone: "Z",
  } as const;
}

export function createPrismaClient(databaseUrl: string, opts: { log?: boolean } = {}) {
  const adapter = new PrismaMariaDb(connectionOptionsFromUrl(databaseUrl));
  return new PrismaClient({
    adapter,
    log: opts.log ? ["warn", "error"] : ["error"],
  });
}

export type Db = ReturnType<typeof createPrismaClient>;
/** Transaction client type, for helpers that run inside `$transaction`. */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
