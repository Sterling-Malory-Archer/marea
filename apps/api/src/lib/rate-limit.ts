import type { Env } from "../config/env.js";

/**
 * Per-visitor request limits. Production uses the base numbers; automated test
 * environments (API tests, end-to-end runs from one machine) raise them with
 * RATE_LIMIT_MULTIPLIER, which production refuses (see config/env.ts).
 */
export function limitFor(env: Env, base: number) {
  if (env.NODE_ENV === "test") return base * 100;
  return base * env.RATE_LIMIT_MULTIPLIER;
}
