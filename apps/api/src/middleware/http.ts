import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, ZodError, type ZodType } from "zod";
import { Prisma } from "@marea/db";
import { forbidden, HttpError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";

/**
 * CSRF defence for cookie-authenticated endpoints: state-changing requests must
 * come from one of our own origins. Combined with SameSite cookies and the fact
 * that the API only accepts JSON / multipart, this blocks cross-site forgery.
 */
export function originCheck(trusted: Set<string>, opts: { exemptPrefixes?: string[] } = {}): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (opts.exemptPrefixes?.some((p) => req.path.startsWith(p))) return next();
    const origin = req.get("origin") ?? (req.get("referer") ? safeOrigin(req.get("referer")!) : undefined);
    if (!origin || !trusted.has(origin)) return next(forbidden("Request origin not allowed"));
    next();
  };
}

const safeOrigin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

type Parsed<B, Q, P> = { body: B; query: Q; params: P };

/** Validate body/query/params with zod and hand typed values to the handler. */
export function validated<B extends ZodType = ZodType<unknown>, Q extends ZodType = ZodType<unknown>, P extends ZodType = ZodType<unknown>>(
  schemas: { body?: B; query?: Q; params?: P },
  handler: (req: Request, res: Response, input: Parsed<z.infer<B>, z.infer<Q>, z.infer<P>>) => Promise<unknown>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const input = {
        body: schemas.body ? schemas.body.parse(req.body ?? {}) : req.body,
        query: schemas.query ? schemas.query.parse(req.query) : req.query,
        params: schemas.params ? schemas.params.parse(req.params) : req.params,
      } as Parsed<z.infer<B>, z.infer<Q>, z.infer<P>>;
      await handler(req, res, input);
    } catch (err) {
      next(err);
    }
  };
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(log: Logger): (err: unknown, req: Request, res: Response, next: NextFunction) => void {
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields are invalid",
          fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // Only the field names — not index names or other schema internals.
        const target = (err.meta as { target?: unknown } | undefined)?.target;
        res.status(409).json({ error: { code: "CONFLICT", message: "A record with these unique values already exists", details: Array.isArray(target) ? { fields: target } : undefined } });
        return;
      }
      if (err.code === "P2025") {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
        return;
      }
      if (err.code === "P2003") {
        res.status(409).json({ error: { code: "CONFLICT", message: "This record is referenced by other data" } });
        return;
      }
    }
    // body-parser / multer client errors
    const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: { code: "BAD_REQUEST", message: (err as Error).message } });
      return;
    }
    log.error({ err, requestId: req.requestId, path: req.path }, "Unhandled error");
    // Never leak internals to the client.
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong", requestId: req.requestId } });
  };
}

export { patchSchema } from "../lib/schema.js";
