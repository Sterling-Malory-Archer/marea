import type { Request, Response } from "express";
import type { User } from "@marea/db";
import type { AppContext } from "../../context.js";
import { randomToken, sha256 } from "../../lib/util.js";

export const CUSTOMER_COOKIE = "marea_sid";
export const ADMIN_COOKIE = "marea_admin";

export interface SessionUser {
  sessionId: number;
  user: Pick<User, "id" | "email" | "firstName" | "lastName" | "role" | "status">;
}

export async function createSession(
  ctx: AppContext,
  res: Response,
  req: Request,
  userId: number,
  opts: { admin: boolean },
) {
  const token = randomToken(32);
  const ttlHours = opts.admin ? ctx.env.ADMIN_SESSION_TTL_HOURS : ctx.env.SESSION_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await ctx.db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      isAdmin: opts.admin,
      ipAddress: req.ip?.slice(0, 45) ?? null,
      userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
      expiresAt,
    },
  });
  res.cookie(opts.admin ? ADMIN_COOKIE : CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: ctx.env.COOKIE_SECURE,
    // Admin cookie is never sent on cross-site navigations at all.
    sameSite: opts.admin ? "strict" : "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSession(ctx: AppContext, req: Request, opts: { admin: boolean }): Promise<SessionUser | null> {
  const token: unknown = req.cookies?.[opts.admin ? ADMIN_COOKIE : CUSTOMER_COOKIE];
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const session = await ctx.db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true } } },
  });
  if (!session || session.isAdmin !== opts.admin) return null;
  if (session.expiresAt.getTime() < Date.now() || session.user.status === "DISABLED") {
    await ctx.db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Touch at most once per 5 minutes to avoid a write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await ctx.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return { sessionId: session.id, user: session.user };
}

export async function destroySession(ctx: AppContext, req: Request, res: Response, opts: { admin: boolean }) {
  const name = opts.admin ? ADMIN_COOKIE : CUSTOMER_COOKIE;
  const token: unknown = req.cookies?.[name];
  if (typeof token === "string") {
    await ctx.db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  res.clearCookie(name, { path: "/", httpOnly: true, secure: ctx.env.COOKIE_SECURE, sameSite: opts.admin ? "strict" : "lax" });
}
