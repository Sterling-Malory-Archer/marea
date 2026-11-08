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

/** Imperative permission check for handlers whose required permission depends on input. */
export function assertCan(req: Express.Request, permission: Permission) {
  if (!req.admin) throw unauthorized();
  if (!can(req.admin.user.role, permission)) throw forbidden();
}

/** Attaches the customer session when present; never rejects. */
export function loadCustomer(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    try {
      const session = await readSession(ctx, req, { admin: false });
      if (session && session.user.status === "ACTIVE") req.customer = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireCustomer: RequestHandler = (req, _res, next) => (req.customer ? next() : next(unauthorized("Sign in to continue")));
