import { z } from "zod";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes"].includes(v.toLowerCase())));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().startsWith("mysql://", "DATABASE_URL must be a MySQL connection string"),
    API_PORT: z.coerce.number().int().positive().default(4000),
    PUBLIC_WEB_URL: z.url(),
    TRUSTED_ORIGINS: z.string().default(""),
    COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
    COOKIE_SECURE: bool.default(false),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(336),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default("./storage"),
    MEDIA_PUBLIC_BASE_URL: z.url(),
    S3_ENDPOINT: z.string().default(""),
    S3_REGION: z.string().default("eu-central-1"),
    S3_BUCKET: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} is required when STORAGE_DRIVER=s3` });
      }
    }
    if (env.NODE_ENV === "production") {
      if (env.STORAGE_DRIVER === "local")
        ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Use S3-compatible storage in production" });
      if (!env.COOKIE_SECURE)
        ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "COOKIE_SECURE must be true in production (HTTPS)" });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    // Fail fast at boot rather than at the first request.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export function trustedOrigins(env: Env): Set<string> {
  const list = [env.PUBLIC_WEB_URL, ...env.TRUSTED_ORIGINS.split(",")]
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => new URL(o).origin);
  return new Set(list);
}
