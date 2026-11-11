import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { conflict, HttpError, unauthorized, unprocessable } from "../../lib/errors.js";
import { DEFAULT_LOCALE, localeSchema, type Locale } from "../../lib/i18n.js";
import { validated } from "../../middleware/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { dummyVerify, hashPassword, passwordPolicyIssues, verifyPassword } from "../auth/password.js";
import { createSession, destroySession, CUSTOMER_COOKIE } from "../auth/sessions.js";
import { mergeGuestCartInto } from "../cart/cart.service.js";
import { renderEmail } from "../mail/templates.js";
import { consumeToken, issueToken } from "./email-tokens.js";
import { limitFor } from "../../lib/rate-limit.js";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

const email = z.email("Enter a valid e-mail address").max(254).transform((e) => e.toLowerCase().trim());
const newPassword = z.string().max(128).superRefine((pw, c) => {
  for (const msg of passwordPolicyIssues(pw)) c.addIssue({ code: "custom", message: msg });
});
const name = z.string().trim().min(1, "Required").max(100);

export function customerView(u: { id: number; email: string; firstName: string | null; lastName: string | null; phone?: string | null; emailVerifiedAt?: Date | null; marketingOptIn?: boolean; locale?: string; createdAt?: Date }) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone ?? null,
    emailVerified: !!u.emailVerifiedAt,
    marketingOptIn: u.marketingOptIn ?? false,
    locale: (u.locale ?? DEFAULT_LOCALE) as Locale,
    createdAt: u.createdAt,
  };
}

/** Absolute storefront URL in the user's language. */
export function storefrontUrl(ctx: AppContext, locale: Locale, path: string) {
  const base = ctx.env.PUBLIC_WEB_URL.replace(/\/$/, "");
  return `${base}${locale === DEFAULT_LOCALE ? "" : `/${locale}`}${path}`;
}

export async function sendVerification(ctx: AppContext, user: { id: number; email: string; locale: string }) {
  const token = await issueToken(ctx, user.id, "VERIFY_EMAIL");
  const locale = user.locale as Locale;
  await ctx.mailer.send({ to: user.email, ...renderEmail("verify", locale, storefrontUrl(ctx, locale, `/account/verify?token=${token}`)) });
}

export function customerAuthRouter(ctx: AppContext) {
  const r = Router();
  const strict = rateLimit({
    windowMs: 15 * 60_000,
    limit: limitFor(ctx.env, 20),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a few minutes." } },
  });

  async function signIn(req: Request, res: Response, userId: number) {
    // Rotate: drop any session the browser already had before issuing a new one.
    await destroySession(ctx, req, res, { admin: false });
    await createSession(ctx, res, req, userId, { admin: false });
    await mergeGuestCartInto(ctx, req, res, userId);
  }

  r.get("/me", async (req, res) => {
    if (!req.customer) {
      res.json({ user: null });
      return;
    }
    const u = await ctx.db.user.findUniqueOrThrow({ where: { id: req.customer.user.id } });
    res.json({ user: customerView(u) });
  });

  r.post(
    "/register",
    strict,
    validated(
      {
        body: z.object({
          email,
          password: newPassword,
          firstName: name,
          lastName: name,
          marketingOptIn: z.boolean().default(false),
          acceptTerms: z.literal(true, "Please accept the terms to create an account"),
          locale: localeSchema.default(DEFAULT_LOCALE),
        }),
      },
      async (req, res, { body }) => {
        if (await ctx.db.user.findUnique({ where: { email: body.email }, select: { id: true } })) {
          // Registration necessarily reveals existence; keep the message helpful but generic.
          throw conflict("An account with this e-mail already exists. Sign in or reset your password.");
        }
        const user = await ctx.db.user.create({
          data: {
            email: body.email,
            passwordHash: await hashPassword(body.password),
            firstName: body.firstName,
            lastName: body.lastName,
            marketingOptIn: body.marketingOptIn,
            locale: body.locale,
          },
        });
        await signIn(req, res, user.id);
        await sendVerification(ctx, user).catch((err) => ctx.log.error({ err }, "Verification e-mail failed"));
        res.status(201).json({ user: customerView(user) });
      },
    ),
  );

  r.post(
    "/login",
    strict,
    validated({ body: z.object({ email, password: z.string().min(1).max(256) }) }, async (req, res, { body }) => {
      const user = await ctx.db.user.findUnique({ where: { email: body.email } });
      const generic = unauthorized("Incorrect e-mail or password");
      if (!user) {
        await dummyVerify(body.password);
        throw generic;
      }
      if (user.lockedUntil && user.lockedUntil > new Date())
        throw new HttpError(423, "LOCKED", "Too many failed attempts. Try again in 15 minutes or reset your password.");
      if (user.status !== "ACTIVE") throw generic;
      if (!(await verifyPassword(user.passwordHash, body.password))) {
        const failed = user.failedLoginCount + 1;
        await ctx.db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
        });
        throw generic;
      }
      const updated = await ctx.db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await signIn(req, res, user.id);
      res.json({ user: customerView(updated) });
    }),
  );

  r.post("/logout", async (req, res, next) => {
    try {
      await destroySession(ctx, req, res, { admin: false });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  r.post("/verify-email", strict, validated({ body: z.object({ token: z.string().max(100) }) }, async (_req, res, { body }) => {
    const userId = await consumeToken(ctx, body.token, "VERIFY_EMAIL");
    if (!userId) throw unprocessable("This confirmation link is invalid or has expired. Request a new one from your account.");
    await ctx.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    res.json({ ok: true });
  }));

  r.post("/verify-email/resend", strict, requireCustomer, async (req, res, next) => {
    try {
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: req.customer!.user.id } });
      if (!user.emailVerifiedAt) await sendVerification(ctx, user);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post("/password/forgot", strict, validated({ body: z.object({ email, locale: localeSchema.optional() }) }, async (_req, res, { body }) => {
    const user = await ctx.db.user.findUnique({ where: { email: body.email } });
    if (user && user.status === "ACTIVE") {
      const token = await issueToken(ctx, user.id, "RESET_PASSWORD");
      const locale = (body.locale ?? user.locale) as Locale;
      await ctx.mailer.send({ to: user.email, ...renderEmail("reset", locale, storefrontUrl(ctx, locale, `/account/reset-password?token=${token}`)) });
    }
    // Identical response whether or not the address exists.
    res.json({ ok: true });
  }));

  r.post("/password/reset", strict, validated({ body: z.object({ token: z.string().max(100), password: newPassword }) }, async (_req, res, { body }) => {
    const userId = await consumeToken(ctx, body.token, "RESET_PASSWORD");
    if (!userId) throw unprocessable("This reset link is invalid or has expired. Request a new one.");
    const user = await ctx.db.user.update({
      where: { id: userId },
      // Proving control of the inbox also verifies the address and lifts any lockout.
      data: { passwordHash: await hashPassword(body.password), failedLoginCount: 0, lockedUntil: null, emailVerifiedAt: new Date() },
    });
    await ctx.db.session.deleteMany({ where: { userId } });
    res.clearCookie(CUSTOMER_COOKIE, { path: "/" });
    await ctx.mailer.send({ to: user.email, ...renderEmail("changed", user.locale as Locale) }).catch(() => undefined);
    res.json({ ok: true });
  }));

  return r;
}
