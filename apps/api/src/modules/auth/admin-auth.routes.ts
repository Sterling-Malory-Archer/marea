import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { HttpError, unauthorized } from "../../lib/errors.js";
import { validated } from "../../middleware/http.js";
import { requireAdmin } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";
import { dummyVerify, verifyPassword } from "./password.js";
import { isStaffRole, permissionsFor } from "./permissions.js";
import { createSession, destroySession } from "./sessions.js";
import { limitFor } from "../../lib/rate-limit.js";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginBody = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(256),
});

export function adminAuthRouter(ctx: AppContext) {
  const r = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: limitFor(ctx.env, 20),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } },
  });

  r.post(
    "/login",
    loginLimiter,
    validated({ body: loginBody }, async (req, res, { body }) => {
      const user = await ctx.db.user.findUnique({ where: { email: body.email } });
      const generic = unauthorized("Incorrect e-mail or password");

      if (!user || !isStaffRole(user.role)) {
        await dummyVerify(body.password);
        throw generic;
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new HttpError(423, "LOCKED", "Account temporarily locked after repeated failed attempts. Try again later.");
      }
      if (user.status !== "ACTIVE") throw generic;

      const ok = await verifyPassword(user.passwordHash, body.password);
      if (!ok) {
        const failed = user.failedLoginCount + 1;
        await ctx.db.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
            lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          },
        });
        throw generic;
      }

      await ctx.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await createSession(ctx, res, req, user.id, { admin: true });
      req.admin = { sessionId: 0, user };
      await audit(ctx.db, req, { action: "admin.login", entityType: "user", entityId: user.id });
      res.json({
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        permissions: permissionsFor(user.role),
      });
    }),
  );

  r.post("/logout", async (req, res, next) => {
    try {
      await destroySession(ctx, req, res, { admin: true });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  r.get("/me", requireAdmin(ctx), (req, res) => {
    const u = req.admin!.user;
    res.json({ user: u, permissions: permissionsFor(u.role) });
  });

  return r;
}
