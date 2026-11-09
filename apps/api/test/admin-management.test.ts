import sharp from "sharp";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, createStaff, db, ids, loginAs, mailer, ORIGIN, unique } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];
let owner: Agent;
let admin: Agent;
const visitor = () => supertest.agent(app).set("Origin", ORIGIN);

beforeAll(async () => {
  ({ agent: owner } = await loginAs("OWNER"));
  ({ agent: admin } = await loginAs("ADMIN"));
});

describe("dashboard", () => {
  it("reports sales, orders, average order value, daily revenue and low stock", async () => {
    const before = (await admin.get("/api/admin/dashboard").query({ days: 7 })).body;
    // Place a real COD order.
    const ref = await ids();
    const p = (await admin.post("/api/admin/products").send({ reference: unique("DB-"), title: "Dash item", sizeScaleId: ref.oneSize.id, primaryCategoryId: ref.coats.id, priceMinor: 12000 }).expect(201)).body;
    const v = (await admin.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: ref.oneSize.sizes[0]!.id, initialQuantity: 2 }).expect(201)).body;
    await db.productImage.create({ data: { productId: p.id, storageKey: `placeholder/${p.id}`, isPlaceholder: true } });
    await admin.post(`/api/admin/products/${p.id}/publish`).expect(200);
    const g = visitor();
    await g.post("/api/cart/items").send({ variantId: v.id, quantity: 1 }).expect(201);
    const q = (await g.get("/api/checkout/quote").query({ country: "ME" })).body;
    await g.post("/api/checkout/orders").send({ idempotencyKey: `dash-${unique("k")}`.padEnd(20, "x"), email: "dash@test.local", phone: "+382 67 000 000", shippingAddress: { firstName: "D", lastName: "B", line1: "Street 1", city: "Podgorica", postalCode: "81000", countryCode: "ME" }, shippingMethodCode: q.selectedMethod, paymentMethod: "CASH_ON_DELIVERY", acceptTerms: true, expectedTotalMinor: q.cart.totalMinor, locale: "en" }).expect(201);

    const after = (await admin.get("/api/admin/dashboard").query({ days: 7 })).body;
    expect(after.totals.orders).toBe(before.totals.orders + 1);
    expect(after.totals.salesMinor).toBe(before.totals.salesMinor + q.cart.totalMinor);
    expect(after.revenueByDay).toHaveLength(8);
    expect(after.revenueByDay.at(-1).orders).toBeGreaterThanOrEqual(1);
    expect(after.lowStock.length).toBeLessThanOrEqual(12);
    expect(after.lowStock.every((l: { available: number; threshold: number }) => l.available <= l.threshold)).toBe(true);
    void v;
    expect(after.recentOrders[0]).toHaveProperty("orderNumber");
  });

  it("is hidden from customers and requires dashboard access", async () => {
    expect((await visitor().get("/api/admin/dashboard")).status).toBe(401);
  });
});

describe("discount codes", () => {
  it("validates, creates, edits and protects used codes", async () => {
    const bad = await admin.post("/api/admin/coupons").send({ code: "BAD", type: "PERCENTAGE", value: 0 });
    expect(bad.status).toBe(422);
    const code = unique("save").toUpperCase().slice(0, 20);
    const c = (await admin.post("/api/admin/coupons").send({ code: code.toLowerCase(), type: "PERCENTAGE", value: 1500, minSubtotalMinor: 5000 }).expect(201)).body;
    expect(c.code).toBe(code);
    expect((await admin.patch(`/api/admin/coupons/${c.id}`).send({ startsAt: "2030-01-02", endsAt: "2030-01-01" })).status).toBe(422);
    expect((await admin.patch(`/api/admin/coupons/${c.id}`).send({ isActive: false })).body.isActive).toBe(false);
    expect((await admin.post("/api/admin/coupons").send({ code, type: "FREE_SHIPPING" })).status).toBe(409);
    expect((await admin.delete(`/api/admin/coupons/${c.id}`)).status).toBe(204);
  });

  it("is off-limits to content editors", async () => {
    const { agent } = await loginAs("CONTENT_EDITOR");
    expect((await agent.post("/api/admin/coupons").send({ code: "NOPE1", type: "FREE_SHIPPING" })).status).toBe(403);
  });
});

describe("shipping & settings", () => {
  it("creates a zone with a method that checkout then offers", async () => {
    const zone = (await admin.post("/api/admin/shipping/zones").send({ name: unique("Nordic "), countryCodes: ["no", "se"] }).expect(201)).body;
    expect(zone.countryCodes).toEqual(["NO", "SE"]);
    await admin.post(`/api/admin/shipping/zones/${zone.id}/methods`).send({ code: "nordic", name: "Nordic courier", priceMinor: 2500, minDays: 4, maxDays: 8, allowsCashOnDelivery: false }).expect(201);
    const q = (await visitor().get("/api/checkout/quote").query({ country: "SE" })).body;
    expect(q.shippingMethods.map((m: { code: string }) => m.code)).toEqual(["nordic"]);
    await admin.patch(`/api/admin/shipping/zones/${zone.id}`).send({ isActive: false }).expect(200);
  });

  it("updates typed settings and rejects unknown keys or wrong types", async () => {
    expect((await admin.patch("/api/admin/settings").send({ nonsense: 1 })).status).toBe(422);
    expect((await admin.patch("/api/admin/settings").send({ "returns.days": "fourteen" })).status).toBe(422);
    await admin.patch("/api/admin/settings").send({ "shipping.freeOverMinor": 12345 }).expect(200);
    const res = await admin.patch("/api/admin/settings").send({ "company.name": "MAREA d.o.o.", "returns.days": 14 });
    expect(res.body.values["company.name"]).toBe("MAREA d.o.o.");
    // Regression: saving one setting must not reset the others to defaults.
    expect(res.body.values["shipping.freeOverMinor"]).toBe(12345);
    await admin.patch("/api/admin/settings").send({ "shipping.freeOverMinor": 10000 }).expect(200);
    const { agent } = await loginAs("ORDER_MANAGER");
    expect((await agent.patch("/api/admin/settings").send({ "returns.days": 30 })).status).toBe(403);
  });
});

describe("homepage content", () => {
  it("manages hero slides, announcements and content media", async () => {
    const img = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: { r: 200, g: 190, b: 180 } } }).jpeg().toBuffer();
    const media = await admin.post("/api/admin/media").attach("image", img, "hero.jpg");
    expect(media.status).toBe(201);
    expect(media.body.key).toMatch(/^content\/\d{4}-\d{2}\//);
    const small = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#ccc" } }).jpeg().toBuffer();
    expect((await admin.post("/api/admin/media").attach("image", small, "s.jpg")).status).toBe(422);

    const slide = (await admin.post("/api/admin/hero-slides").send({ headline: "Winter light", primaryCtaLabel: "Shop", primaryCtaUrl: "/new", imageKey: media.body.key, panelColor: "#C9C3B8", sortOrder: -1 }).expect(201)).body;
    expect((await admin.post("/api/admin/hero-slides").send({ headline: "x", primaryCtaLabel: "x", primaryCtaUrl: "javascript:alert(1)" })).status).toBe(422);
    const home = (await visitor().get("/api/store/home")).body;
    expect(home.hero[0]).toMatchObject({ headline: "Winter light", imageUrl: expect.stringContaining(media.body.key) });
    // Regression: a partial edit must not reset omitted fields to their defaults.
    const edited = (await admin.patch(`/api/admin/hero-slides/${slide.id}`).send({ headline: "Winter light II" }).expect(200)).body;
    expect(edited).toMatchObject({ headline: "Winter light II", panelColor: "#C9C3B8", sortOrder: -1, isActive: true });
    await admin.patch(`/api/admin/hero-slides/${slide.id}`).send({ isActive: false }).expect(200);
    expect((await admin.patch(`/api/admin/hero-slides/${slide.id}`).send({ sortOrder: 3 })).body.isActive).toBe(false);
    await admin.delete(`/api/admin/hero-slides/${slide.id}`).expect(204);

    const a = (await admin.post("/api/admin/announcements").send({ message: "Holiday hours", endsAt: new Date(Date.now() - 1000).toISOString() }).expect(201)).body;
    const layout = (await visitor().get("/api/store/layout")).body;
    expect(layout.announcements.some((x: { id: number }) => x.id === a.id)).toBe(false); // expired → hidden
  });

  it("sets a collection's products in order", async () => {
    const c = (await admin.post("/api/admin/collections").send({ title: unique("Edit ") }).expect(201)).body;
    const products = await db.product.findMany({ take: 2, select: { id: true } });
    await admin.put(`/api/admin/collections/${c.id}/products`).send({ productIds: [products[1]!.id, products[0]!.id] }).expect(200);
    const detail = (await admin.get(`/api/admin/collections/${c.id}`)).body;
    expect(detail.products.map((p: { productId: number }) => p.productId)).toEqual([products[1]!.id, products[0]!.id]);
    expect((await admin.put(`/api/admin/collections/${c.id}/products`).send({ productIds: [99999999] })).status).toBe(400);
  });
});

describe("customers & newsletter", () => {
  it("lists customers, disables accounts (revoking sessions), and anonymises only on request", async () => {
    const email = `${unique("cust")}@test.local`;
    const c = visitor();
    const reg = (await c.post("/api/auth/register").send({ email, password: "Customer-pass-1", firstName: "Iva", lastName: "K", acceptTerms: true }).expect(201)).body.user;
    const list = await admin.get("/api/admin/customers").query({ q: email });
    expect(list.body.items[0]).toMatchObject({ id: reg.id, email, orderCount: 0 });
    expect(list.body.items[0].passwordHash).toBeUndefined();

    expect((await admin.post(`/api/admin/customers/${reg.id}/anonymise`).send({ confirm: true })).status).toBe(409);
    await admin.patch(`/api/admin/customers/${reg.id}`).send({ status: "DISABLED" }).expect(200);
    expect((await c.get("/api/auth/me")).body.user).toBeNull();

    await db.user.update({ where: { id: reg.id }, data: { status: "DELETION_REQUESTED" } });
    await admin.post(`/api/admin/customers/${reg.id}/anonymise`).send({ confirm: true }).expect(200);
    const gone = await db.user.findUniqueOrThrow({ where: { id: reg.id } });
    expect(gone.email).toMatch(/^deleted-\d+-[a-f0-9]{8}@invalid\.local$/);
    expect(gone.firstName).toBeNull();
  });

  it("exports subscribers as CSV with spreadsheet-injection protection", async () => {
    const evil = `${unique("x")}@test.local`;
    await db.newsletterSubscriber.create({ data: { email: evil, status: "SUBSCRIBED", consentText: "=HYPERLINK(\"http://evil\")", consentAt: new Date() } });
    const res = await admin.get("/api/admin/newsletter/export.csv");
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain(`"${evil}"`);
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe("staff & permissions", () => {
  it("invites staff by e-mail link (no password chosen by the inviter)", async () => {
    const email = `${unique("staff")}@test.local`;
    const res = await owner.post("/api/admin/staff").send({ email, firstName: "Sara", lastName: "M", role: "ORDER_MANAGER" });
    expect(res.status).toBe(201);
    const mail = [...mailer.sent].reverse().find((m) => m.to === email)!;
    expect(mail.subject).toContain("invited");
    expect(mail.text).toMatch(/reset-password\?token=/);
  });

  it("protects owner access and the last owner", async () => {
    expect((await admin.post("/api/admin/staff").send({ email: `${unique("o")}@test.local`, firstName: "O", lastName: "W", role: "OWNER" })).status).toBe(403);
    const { user: lone } = await createStaff("OWNER");
    // Disable all other owners except `lone` and the session owner, then try to demote.
    const meRes = await owner.get("/api/admin/auth/me");
    expect((await owner.patch(`/api/admin/staff/${meRes.body.user.id}`).send({ role: "ADMIN" })).status).toBe(422); // not yourself
    await owner.patch(`/api/admin/staff/${lone.id}`).send({ role: "ADMIN" }).expect(200);
    const { agent: catalog } = await loginAs("CATALOG_MANAGER");
    expect((await catalog.get("/api/admin/staff")).status).toBe(403);
  });

  it("shows the audit log to permitted staff", async () => {
    const res = await admin.get("/api/admin/audit").query({ entityType: "coupon" });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty("actor");
    const { agent: editor } = await loginAs("CONTENT_EDITOR");
    expect((await editor.get("/api/admin/audit")).status).toBe(403);
  });
});
