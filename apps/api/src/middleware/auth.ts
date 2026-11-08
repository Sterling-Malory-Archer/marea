import type { RequestHandler } from "express";
import type { AppContext } from "../context.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { can, isStaffRole, type Permission } from "../modules/auth/permissions.js";
import { readSession } from "../modules/auth/sessions.js";

/** Loads the admin session (if any). Every /api/admin route sits behind this. */
export function requireAdmin(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    try {
      const session = await readSession(ctx, req, { admin: true });
      if (!session || !isStaffRole(session.user.role)) return next(unauthorized());
      req.admin = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.admin) return next(unauthorized());
    if (!can(req.admin.user.role, permission)) return next(forbidden());
    next();
  };
}
