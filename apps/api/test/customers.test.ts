import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { app, db, mailer, ORIGIN, unique } from "./helpers.js";

const agent = () => supertest.agent(app).set("Origin", ORIGIN);
const newEmail = () => `${unique("cust")}@test.local`;
const PW = "Solid-pass-2026";

async function register(a = agent(), email = newEmail(), extra: Record<string, unknown> = {}) {
  const res = await a.post("/api/auth/register").send({ email, password: PW, firstName: "Ana", lastName: "Petrović", acceptTerms: true, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { a, email, user: res.body.user };
}

const lastMailTo = (email: string) => [...mailer.sent].reverse().find((m) => m.to === email);
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;

describe("registration & sign-in", () => {
  it("registers, signs in and sends a verification e-mail in the chosen language", async () => {
    const { a, email, user } = await register(agent(), newEmail(), { locale: "me" });
    expect(user).toMatchObject({ email, emailVerified: false, locale: "me" });
    expect((await a.get("/api/auth/me")).body.user.email).toBe(email);
    const mail = lastMailTo(email)!;
    expect(mail.subject).toBe("Potvrdite e-mail adresu");
    expect(mail.text).toContain("http://localhost:3000/me/account/verify?token=");
    const stored = await db.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects weak passwords, duplicates and missing consent", async () => {
    const weak = await agent().post("/api/auth/register").send({ email: newEmail(), password: "short", firstName: "A", lastName: "B", acceptTerms: true });
    expect(weak.status).toBe(422);
    const { email } = await register();
    expect((await agent().post("/api/auth/register").send({ email, password: PW, firstName: "A", lastName: "B", acceptTerms: true })).status).toBe(409);
    expect((await agent().post("/api/auth/register").send({ email: newEmail(), password: PW, firstName: "A", lastName: "B" })).status).toBe(422);
  });

  it("verifies e-mail with a single-use token", async () => {
    const { a, email } = await register();
    const token = tokenFrom(lastMailTo(email)!.text);
    expect((await a.post("/api/auth/verify-email").send({ token })).status).toBe(200);
    expect((await a.post("/api/auth/verify-email").send({ token })).status).toBe(422);
    expect((await a.get("/api/auth/me")).body.user.emailVerified).toBe(true);
  });

  it("logs in and out; session cookie is hardened", async () => {
    const { email } = await register();
    const a = agent();
    const res = await a.post("/api/auth/login").send({ email, password: PW });
    expect(res.status).toBe(200);
    expect(String(res.headers["set-cookie"])).toMatch(/marea_sid=.*HttpOnly.*SameSite=Lax/i);
    expect((await a.post("/api/auth/logout")).status).toBe(204);
    expect((await a.get("/api/auth/me")).body.user).toBeNull();
  });

  it("uses one generic error for wrong passwords and unknown accounts", async () => {
    const { email } = await register();
    const wrong = await agent().post("/api/auth/login").send({ email, password: "Wrong-pass-1" });
    const ghost = await agent().post("/api/auth/login").send({ email: "nobody@test.local", password: "Wrong-pass-1" });
    expect(wrong.status).toBe(401);
    expect(ghost.body.error.message).toBe(wrong.body.error.message);
  });

  it("customer sessions do not grant admin access", async () => {
    const { a } = await register();
    expect((await a.get("/api/admin/products")).status).toBe(401);
  });
});

describe("password reset", () => {
  it("resets with an e-mailed token, signs out all sessions, and never reveals unknown e-mails", async () => {
    const { a, email } = await register();
    const before = mailer.sent.length;
    expect((await agent().post("/api/auth/password/forgot").send({ email: "nobody@test.local" })).status).toBe(200);
    expect(mailer.sent.length).toBe(before);

    await agent().post("/api/auth/password/forgot").send({ email }).expect(200);
    const token = tokenFrom(lastMailTo(email)!.text);
    expect((await agent().post("/api/auth/password/reset").send({ token, password: "weak" })).status).toBe(422);
    expect((await agent().post("/api/auth/password/reset").send({ token, password: "Brand-new-pass-9" })).status).toBe(200);
    expect((await agent().post("/api/auth/password/reset").send({ token, password: "Brand-new-pass-9" })).status).toBe(422);

    expect((await a.get("/api/auth/me")).body.user).toBeNull(); // old session revoked
    expect((await agent().post("/api/auth/login").send({ email, password: "Brand-new-pass-9" })).status).toBe(200);
    expect(lastMailTo(email)!.subject).toBe("Your password was changed");
  });
});

describe("account", () => {
  it("requires sign-in", async () => {
    expect((await agent().get("/api/account/addresses")).status).toBe(401);
  });

  it("updates profile and changes password (current password required)", async () => {
    const { a } = await register();
    const p = await a.patch("/api/account/profile").send({ firstName: "Mila", phone: "+382 67 123 456", marketingOptIn: true });
    expect(p.body.user).toMatchObject({ firstName: "Mila", phone: "+382 67 123 456", marketingOptIn: true });
    expect((await a.post("/api/account/password").send({ currentPassword: "nope", newPassword: "Another-pass-7" })).status).toBe(422);
    expect((await a.post("/api/account/password").send({ currentPassword: PW, newPassword: "Another-pass-7" })).status).toBe(200);
    expect((await a.get("/api/auth/me")).body.user).not.toBeNull(); // current session kept
  });

  it("manages addresses with a single default, and isolates them per customer", async () => {
    const { a } = await register();
    const base = { firstName: "Ana", lastName: "P", line1: "Njegoševa 12", city: "Podgorica", postalCode: "81000", countryCode: "me", phone: "+382 67 000 111" };
    const first = (await a.post("/api/account/addresses").send(base)).body;
    expect(first).toMatchObject({ countryCode: "ME", isDefaultShipping: true });
    const second = (await a.post("/api/account/addresses").send({ ...base, line1: "Obala bb", city: "Budva", isDefaultShipping: true })).body;
    const list = (await a.get("/api/account/addresses")).body.items;
    expect(list.filter((x: { isDefaultShipping: boolean }) => x.isDefaultShipping).map((x: { id: number }) => x.id)).toEqual([second.id]);

    const { a: other } = await register();
    expect((await other.patch(`/api/account/addresses/${first.id}`).send({ city: "Kotor" })).status).toBe(404);
    expect((await other.delete(`/api/account/addresses/${first.id}`)).status).toBe(404);
    expect((await a.delete(`/api/account/addresses/${first.id}`)).status).toBe(204);
  });

  it("only shows a customer their own orders", async () => {
    const { a, user } = await register();
    const { a: other } = await register();
    const order = await db.order.create({
      data: { orderNumber: unique("MR-T"), userId: user.id, email: user.email, customerFirstName: "Ana", customerLastName: "P", shippingAddress: {}, paymentMethod: "CASH_ON_DELIVERY", subtotalMinor: 1000, totalMinor: 1000, shippingMethodName: "Standard", idempotencyKey: unique("k") },
    });
    expect((await a.get("/api/account/orders")).body.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([order.orderNumber]);
    const detail = await a.get(`/api/account/orders/${order.orderNumber}`);
    expect(detail.status).toBe(200);
    expect(detail.body.idempotencyKey).toBeUndefined();
    expect((await other.get(`/api/account/orders/${order.orderNumber}`)).status).toBe(404);
  });

  it("handles account deletion requests", async () => {
    const { a, email } = await register();
    expect((await a.post("/api/account/delete-request").send({ password: "wrong" })).status).toBe(422);
    expect((await a.post("/api/account/delete-request").send({ password: PW })).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).status).toBe("DELETION_REQUESTED");
    expect((await a.get("/api/auth/me")).body.user).toBeNull();
    expect((await agent().post("/api/auth/login").send({ email, password: PW })).status).toBe(401);
  });
});

describe("wishlist", () => {
  it("saves, merges and removes products", async () => {
    const { a } = await register();
    const products = await db.product.findMany({ where: { status: "ACTIVE" }, take: 3, select: { id: true } });
    expect(products.length).toBeGreaterThanOrEqual(2);
    expect((await a.put(`/api/account/wishlist/${products[0]!.id}`)).status).toBe(204);
    const merged = await a.post("/api/account/wishlist/merge").send({ productIds: [products[0]!.id, products[1]!.id, 99999999] });
    expect(merged.body.productIds.sort()).toEqual([products[0]!.id, products[1]!.id].sort());
    await a.delete(`/api/account/wishlist/${products[0]!.id}`).expect(204);
    const list = await a.get("/api/account/wishlist");
    expect(list.body.productIds).toEqual([products[1]!.id]);
    expect(list.body.items[0]).toHaveProperty("priceMinor");
  });
});
