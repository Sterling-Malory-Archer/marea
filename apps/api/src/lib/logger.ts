import { pino } from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    // Never let credentials or personal data reach the logs.
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        'res.headers["set-cookie"]',
        "*.password",
        "*.passwordHash",
        "*.token",
      ],
      censor: "[redacted]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
