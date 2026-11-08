import type { EmailTokenType } from "@marea/db";
import type { AppContext } from "../../context.js";
import { randomToken, sha256 } from "../../lib/util.js";

const TTL: Record<EmailTokenType, number> = { VERIFY_EMAIL: 48 * 3600_000, RESET_PASSWORD: 3600_000 };

/** Issue a single-use token; earlier unused tokens of the same type are revoked. Only the hash is stored. */
export async function issueToken(ctx: AppContext, userId: number, type: EmailTokenType) {
  const token = randomToken(32);
  await ctx.db.$transaction([
    ctx.db.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    ctx.db.emailToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[type]) } }),
  ]);
  return token;
}

/** Atomically mark a token used; returns the user id or null if invalid, expired or already used. */
export async function consumeToken(ctx: AppContext, token: string, type: EmailTokenType): Promise<number | null> {
  if (token.length < 20 || token.length > 100) return null;
  const row = await ctx.db.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const claimed = await ctx.db.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1 ? row.userId : null;
}
