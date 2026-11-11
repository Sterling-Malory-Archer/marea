import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/lib/html.js";
import { app, db, env, ids, loginAs, mailer, ORIGIN, request, unique } from "./helpers.js";

describe("security review (Phase 9)", () => {
  it("requires a staff session for every admin read endpoint", async () => {
    const paths = [
      "/api/admin/dashboard", "/api/admin/dashboard/launch-checklist", "/api/admin/orders", "/api/admin/products", "/api/admin/customers",
      "/api/admin/newsletter", "/api/admin/newsletter/export.csv", "/api/admin/staff", "/api/admin/audit", "/api/admin/coupons",
      "/api/admin/shipping", "/api/admin/settings", "/api/admin/pages", "/api/admin/hero-slides", "/api/admin/collections",
      "/api/admin/categories", "/api/admin/translations/page/1",
    ];
    for (const p of paths) {
      const res = await request().get(p);
      expect(res.status, p).toBe(401);
    }
  });

  it("does not let a customer session into the admin API", async () => {
    const a = supertest.agent(app).set("Origin", ORIGIN);
    await a.post("/api/auth/register").send({ email: `${unique("c")}@test.local`, password: "Correct-horse-42", firstName: "C", lastName: "U", acceptTerms: true, locale: "en" }).expect(201);
    await a.get("/api/admin/settings").expect(401);
  });

  it("escapes customer-entered text in the staff new-order alert", async () => {
    const { agent: admin } = await loginAs("ADMIN");
    const before = (await admin.get("/api/admin/settings")).body.values["notifications.orderEmail"];
    await admin.patch("/api/admin/settings").send({ "notifications.orderEmail": "team@test.local" }).expect(200);
    try {
      const ref = await ids();
      const p = (await admin.post("/api/admin/products").send({ reference: unique("SEC-"), title: "Sec item", sizeScaleId: ref.oneSize.id, primaryCategoryId: ref.coats.id, priceMinor: 5000 }).expect(201)).body;
      const v = (await admin.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: ref.oneSize.sizes[0]!.id, initialQuantity: 2 }).expect(201)).body;
      await db.productImage.create({ data: { productId: p.id, storageKey: `placeholder/${p.id}`, isPlaceholder: true } });
      await admin.post(`/api/admin/products/${p.id}/publish`).expect(200);

      const g = supertest.agent(app).set("Origin", ORIGIN);
      await g.post("/api/cart/items").send({ variantId: v.id, quantity: 1 }).expect(201);
      const q = (await g.get("/api/checkout/quote").query({ country: "ME" })).body;
      const evil = `<img src=x onerror="alert(1)">`;
      await g.post("/api/checkout/orders").send({
        idempotencyKey: `sec-${unique("k")}`.padEnd(20, "x"), email: "sec@test.local", phone: "+382 67 000 000",
        shippingAddress: { firstName: evil, lastName: "<b>Bold</b>", line1: "Street 1", city: "Podgorica", postalCode: "81000", countryCode: "ME" },
        shippingMethodCode: q.selectedMethod, paymentMethod: "CASH_ON_DELIVERY", acceptTerms: true, expectedTotalMinor: q.cart.totalMinor, locale: "en",
      }).expect(201);

      const alert = [...mailer.sent].reverse().find((m) => m.to === "team@test.local");
      expect(alert?.html).toBeDefined();
      expect(alert!.html).not.toContain("<img");
      expect(alert!.html).not.toContain("<b>");
      expect(alert!.html).toContain(escapeHtml(evil));
      const confirmation = [...mailer.sent].reverse().find((m) => m.to === "sec@test.local");
      expect(confirmation!.html).not.toContain("<img src=x");
    } finally {
      await admin.patch("/api/admin/settings").send({ "notifications.orderEmail": before ?? "" }).expect(200);
    }
  });

  it("reports duplicate values without exposing database index names", async () => {
    const { agent: admin } = await loginAs("ADMIN");
    const code = unique("DUP").toUpperCase();
    await admin.post("/api/admin/coupons").send({ code, type: "PERCENTAGE", value: 500 }).expect(201);
    const res = await admin.post("/api/admin/coupons").send({ code, type: "PERCENTAGE", value: 500 }).expect(409);
    expect(JSON.stringify(res.body)).not.toMatch(/_key|constraint|modelName|driverAdapter/i);
  });

  it("rate-limits visitors but not the storefront server's keyed page renders", async () => {
    const key = env.INTERNAL_API_KEY!;
    const visitor = await request().get("/api/store/layout").query({ locale: "en" }).expect(200);
    expect(visitor.headers["ratelimit-policy"]).toBeDefined();
    const internal = await request().get("/api/store/layout").query({ locale: "en" }).set("x-internal-key", key).expect(200);
    expect(internal.headers["ratelimit-policy"]).toBeUndefined();
    // A wrong key, or a write, is limited like any visitor.
    const wrong = await request().get("/api/store/layout").query({ locale: "en" }).set("x-internal-key", key.replace(/.$/, "x")).expect(200);
    expect(wrong.headers["ratelimit-policy"]).toBeDefined();
    const write = await request().post("/api/store/newsletter").set("x-internal-key", key).send({ email: "not-an-email" });
    expect(write.headers["ratelimit-policy"]).toBeDefined();
  });

  it("sends hardened headers on API responses", async () => {
    const res = await request().get("/api/store/layout").query({ locale: "en" }).expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["ratelimit-policy"] ?? res.headers["ratelimit"]).toBeDefined();
  });
});
