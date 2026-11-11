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
    /// CDN/bucket URL in production; "/media" in development (served same-origin through the web app).
    MEDIA_PUBLIC_BASE_URL: z.union([z.url(), z.string().regex(/^\/[A-Za-z0-9/_-]*$/, "Use an absolute URL or a path like /media")]),
    S3_ENDPOINT: z.string().default(""),
    S3_REGION: z.string().default("eu-central-1"),
    S3_BUCKET: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: bool.default(true),
    MAIL_DRIVER: z.enum(["log", "smtp"]).default("log"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    /// Raises every per-visitor rate limit — only for staging/CI end-to-end runs. Must be 1 in production.
    /// Optional chat webhook for server-error alerts (Slack/Discord-compatible JSON).
    ALERT_WEBHOOK_URL: z.url().startsWith("https://").optional().or(z.literal("").transform(() => undefined)),
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),
    /// Shared with the storefront server (web) so its page renders aren't rate-limited as one visitor.
    INTERNAL_API_KEY: z.string().min(32).optional(),
    MAIL_FROM: z.string().default("MAREA <no-reply@example.com>"),
    SMTP_HOST: z.string().default(""),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().default(""),
    SMTP_PASSWORD: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "s3") {
      for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: `${k} is required when STORAGE_DRIVER=s3` });
      }
    }
    if (env.MAIL_DRIVER === "smtp" && !env.SMTP_HOST) ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP_HOST is required when MAIL_DRIVER=smtp" });
    if (env.NODE_ENV === "production") {
      if (env.STORAGE_DRIVER === "local")
        ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Use S3-compatible storage in production" });
      if (env.MAIL_DRIVER !== "smtp")
        ctx.addIssue({ code: "custom", path: ["MAIL_DRIVER"], message: "Configure SMTP in production so verification and password-reset e-mails are delivered" });
      if (env.RATE_LIMIT_MULTIPLIER !== 1)
        ctx.addIssue({ code: "custom", path: ["RATE_LIMIT_MULTIPLIER"], message: "Rate limits can't be raised in production" });
      if (!env.INTERNAL_API_KEY)
        ctx.addIssue({ code: "custom", path: ["INTERNAL_API_KEY"], message: "Set INTERNAL_API_KEY (same value in the web app) so page renders aren't rate-limited as a single visitor" });
      if (!env.COOKIE_SECURE)
        ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "COOKIE_SECURE must be true in production (HTTPS)" });
      if (!env.MEDIA_PUBLIC_BASE_URL.startsWith("https://"))
        ctx.addIssue({ code: "custom", path: ["MEDIA_PUBLIC_BASE_URL"], message: "Use the https:// CDN or bucket URL in production" });
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
