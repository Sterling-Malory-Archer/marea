import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { reserve } from "../src/modules/inventory/inventory.service.js";
import { releaseExpiredReservations } from "../src/modules/orders/order.service.js";
import { app, db, env, ids, loginAs, mailer, ORIGIN, storage, unique } from "./helpers.js";
import { createLogger } from "../src/lib/logger.js";

const visitor = () => supertest.agent(app).set("Origin", ORIGIN);
const key = () => `k-${unique("idem")}-${Math.random().toString(36).slice(2, 10)}`.slice(0, 60);
let make: (priceMinor: number, qty: number) => Promise<number>;
let admin: Awaited<ReturnType<typeof loginAs>>["agent"];

const address = { firstName: "Ana", lastName: "Petrović", line1: "Njegoševa 12", city: "Podgorica", postalCode: "81000", countryCode: "ME" };

async function checkout(a: ReturnType<typeof visitor>, over: Record<string, unknown> = {}) {
  const q = (await a.get("/api/checkout/quote").query({ country: (over.country as string) ?? "ME", email: over.email as string })).body;
  const body = {
    idempotencyKey: key(),
    email: `${unique("buyer")}@test.local`,
    phone: "+382 67 123 456",
    shippingAddress: { ...address, countryCode: (over.country as string) ?? "ME" },
    shippingMethodCode: q.selectedMethod,
    paymentMethod: "CASH_ON_DELIVERY",
    acceptTerms: true,
    expectedTotalMinor: q.cart?.totalMinor ?? 0,
    locale: "en",
    ...over,
  };
  delete (body as Record<string, unknown>).country;
  return { res: await a.post("/api/checkout/orders").send(body), body, quote: q };
}

const inv = (variantId: number) => db.inventory.findUniqueOrThrow({ where: { variantId } });

beforeAll(async () => {
  ({ agent: admin } = await loginAs("ADMIN"));
  const ref = await ids();
  const M = ref.alpha.sizes.find((s) => s.label === "M")!.id;
  make = async (priceMinor, qty) => {
    const p = (await admin.post("/api/admin/products").send({ reference: unique("CO-"), title: "Checkout item", sizeScaleId: ref.alpha.id, primaryCategoryId: ref.coats.id, priceMinor }).expect(201)).body;
    const v = (await admin.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: M, initialQuantity: qty }).expect(201)).body;
    await db.productImage.create({ data: { productId: p.id, storageKey: `placeholder/${p.id}`, isPlaceholder: true } });
    await admin.post(`/api/admin/products/${p.id}/publish`).expect(200);
    return v.id;
  };
});

describe("checkout quote", () => {
  it("offers zone delivery methods and only available payment methods", async () => {
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: await make(3000, 5), quantity: 1 }).expect(201);
    const me = (await a.get("/api/checkout/quote").query({ country: "ME" })).body;
    expect(me.countries).toEqual(expect.arrayContaining(["ME", "RS"]));
    expect(me.shippingMethods.map((m: { code: string }) => m.code)).toEqual(["standard", "express"]);
    expect(me.paymentMethods.map((p: { method: string }) => p.method)).toEqual(["CASH_ON_DELIVERY"]); // no card until a provider is connected
    const rs = (await a.get("/api/checkout/quote").query({ country: "RS" })).body;
    expect(rs.shippingMethods.map((m: { code: string }) => m.code)).toEqual(["regional"]);
    expect(rs.paymentMethods).toEqual([]); // regional delivery has no cash on delivery
    expect(rs.cart.shipping.estimateMinor).toBe(1200);
  });
});

describe("placing an order (cash on delivery)", () => {
  it("creates the order, deducts stock, converts the bag, e-mails the buyer, and protects the confirmation page", async () => {
    const v = await make(4500, 5);
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: v, quantity: 2 }).expect(201);
    const { res, body } = await checkout(a);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ status: "PROCESSING", paymentMethod: "CASH_ON_DELIVERY", next: "confirmation" });
    expect(res.body.orderNumber).toMatch(/^MR-\d{2}-[A-HJ-NP-Z2-9]{6}$/);

    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: res.body.orderNumber }, include: { items: true, payments: true } });
    expect(order).toMatchObject({ paymentStatus: "COD_PENDING", subtotalMinor: 9000, shippingMinor: 350, totalMinor: 9350, shippingCountry: "ME" });
    expect(order.taxMinor).toBe(Math.round((9350 * 2100) / 12100));
    expect(order.items[0]).toMatchObject({ quantity: 2, unitPriceMinor: 4500, sizeLabel: "M" });
    expect(order.payments[0]).toMatchObject({ provider: "CASH_ON_DELIVERY", status: "COD_PENDING", amountMinor: 9350 });

    expect(await inv(v)).toMatchObject({ quantityOnHand: 3, quantityReserved: 0 });
    const moves = await db.inventoryMovement.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
    expect(moves.map((m) => m.reason)).toEqual(["RESERVATION", "SALE"]);

    expect((await a.get("/api/cart")).body.itemCount).toBe(0);
    const mail = [...mailer.sent].reverse().find((m) => m.to === body.email)!;
    expect(mail.subject).toBe(`Order ${order.orderNumber} confirmed`);
    expect(mail.text).toContain("Cash on delivery");

    const conf = `/api/checkout/orders/${order.orderNumber}`;
    expect((await visitor().get(conf)).status).toBe(404);
    expect((await visitor().get(conf).query({ token: "wrong-token-wrong-token" })).status).toBe(404);
    const ok = await visitor().get(conf).query({ token: res.body.accessToken });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ totalMinor: 9350, items: [expect.objectContaining({ quantity: 2 })] });
  });

  it("is idempotent: a repeated submit returns the same order and deducts stock once", async () => {
    const v = await make(2000, 5);
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: v, quantity: 1 }).expect(201);
    const { res, body } = await checkout(a);
    const again = await a.post("/api/checkout/orders").send(body);
    expect(again.status).toBe(200);
    expect(again.body.orderNumber).toBe(res.body.orderNumber);
    expect(again.body.accessToken).toBeNull();
    expect((await inv(v)).quantityOnHand).toBe(4);
  });

  it("refuses a total the buyer didn't see", async () => {
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: await make(2000, 5), quantity: 1 }).expect(201);
    const { res } = await checkout(a, { expectedTotalMinor: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("PRICE_CHANGED");
    expect(res.body.error.details.cart.totalMinor).toBeGreaterThan(1);
  });

  it("refuses cash on delivery where the delivery method doesn't allow it", async () => {
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: await make(2000, 5), quantity: 1 }).expect(201);
    const { res } = await checkout(a, { country: "RS" });
    expect(res.status).toBe(422);
    expect(res.body.error.details.code).toBe("PAYMENT_UNAVAILABLE");
  });

  it("never oversells: two buyers race for the last unit", async () => {
    const v = await make(5000, 1);
    const [a, b] = [visitor(), visitor()];
    await a.post("/api/cart/items").send({ variantId: v, quantity: 1 }).expect(201);
    await b.post("/api/cart/items").send({ variantId: v, quantity: 1 }).expect(201);
    const results = await Promise.all([checkout(a), checkout(b)]);
    const codes = results.map((r) => r.res.status).sort();
    expect(codes).toEqual([201, 409]);
    const loser = results.find((r) => r.res.status === 409)!;
    expect(["OUT_OF_STOCK", "CART_ISSUES"]).toContain(loser.res.body.error.details.code);
    expect(await inv(v)).toMatchObject({ quantityOnHand: 0, quantityReserved: 0 });
    expect(await db.order.count({ where: { items: { some: { variantId: v } } } })).toBe(1);
  });

  it("redeems a limited code exactly once under concurrency, and enforces once-per-customer by e-mail", async () => {
    const code = unique("ONCE").toUpperCase().slice(0, 30);
    await db.coupon.create({ data: { code, type: "FIXED_AMOUNT", value: 500, usageLimit: 1 } });
    const v = await make(3000, 10);
    const [a, b] = [visitor(), visitor()];
    for (const x of [a, b]) {
      await x.post("/api/cart/items").send({ variantId: v, quantity: 1 }).expect(201);
      await x.post("/api/cart/coupon").send({ code }).expect(200);
    }
    const results = await Promise.all([checkout(a), checkout(b)]);
    expect(results.map((r) => r.res.status).sort()).toEqual([201, 409]);
    expect((await db.coupon.findUniqueOrThrow({ where: { code } })).timesRedeemed).toBe(1);

    const per = unique("PER").toUpperCase().slice(0, 30);
    await db.coupon.create({ data: { code: per, type: "PERCENTAGE", value: 1000, usageLimitPerCustomer: 1 } });
    const email = `${unique("repeat")}@test.local`;
    const first = visitor();
    await first.post("/api/cart/items").send({ variantId: v, quantity: 1 });
    await first.post("/api/cart/coupon").send({ code: per });
    expect((await checkout(first, { email })).res.status).toBe(201);
    const second = visitor();
    await second.post("/api/cart/items").send({ variantId: v, quantity: 1 });
    await second.post("/api/cart/coupon").send({ code: per });
    const q = (await second.get("/api/checkout/quote").query({ country: "ME", email })).body;
    expect(q.cart.coupon).toMatchObject({ valid: false, error: "COUPON_ALREADY_USED" });
    const res = (await checkout(second, { email, expectedTotalMinor: q.cart.totalMinor })).res;
    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe("COUPON_ALREADY_USED");
  });

  it("links orders to signed-in customers and can save the address", async () => {
    const a = visitor();
    const email = `${unique("member")}@test.local`;
    await a.post("/api/auth/register").send({ email, password: "Member-pass-2026", firstName: "Ana", lastName: "P", acceptTerms: true }).expect(201);
    await a.post("/api/cart/items").send({ variantId: await make(2500, 5), quantity: 1 }).expect(201);
    const { res } = await checkout(a, { email, saveAddress: true });
    expect(res.status).toBe(201);
    expect((await a.get("/api/account/orders")).body.items[0].orderNumber).toBe(res.body.orderNumber);
    expect((await a.get("/api/account/addresses")).body.items[0]).toMatchObject({ line1: "Njegoševa 12", isDefaultShipping: true });
    expect((await a.get(`/api/checkout/orders/${res.body.orderNumber}`)).status).toBe(200); // owner, no token needed
  });

  it("can hold COD stock until shipment instead of deducting at order time", async () => {
    await db.storeSetting.upsert({ where: { key: "inventory.codStockCommit" }, update: { value: "shipment" }, create: { key: "inventory.codStockCommit", value: "shipment" } });
    try {
      const v = await make(2000, 5);
      const a = visitor();
      await a.post("/api/cart/items").send({ variantId: v, quantity: 2 }).expect(201);
      const { res } = await checkout(a);
      expect(await inv(v)).toMatchObject({ quantityOnHand: 5, quantityReserved: 2 });
      await admin.post(`/api/admin/orders/${res.body.orderNumber}/shipments`).send({ carrier: "Pošta CG", trackingNumber: "RR123", trackingUrl: "https://track.example/RR123" }).expect(201);
      expect(await inv(v)).toMatchObject({ quantityOnHand: 3, quantityReserved: 0 });
    } finally {
      await db.storeSetting.update({ where: { key: "inventory.codStockCommit" }, data: { value: "order" } });
    }
  });
});

describe("order administration", () => {
  it("ships with tracking, delivers (cash collected), and refuses invalid transitions", async () => {
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: await make(2000, 5), quantity: 1 }).expect(201);
    const { res, body } = await checkout(a);
    const n = res.body.orderNumber;

    const list = await admin.get("/api/admin/orders").query({ q: body.email });
    expect(list.body.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([n]);

    await admin.post(`/api/admin/orders/${n}/shipments`).send({ carrier: "Pošta CG", trackingNumber: "RR987", trackingUrl: "https://track.example/RR987" }).expect(201);
    const shipped = [...mailer.sent].reverse().find((m) => m.to === body.email)!;
    expect(shipped.subject).toBe(`Order ${n} is on its way`);
    expect(shipped.text).toContain("https://track.example/RR987");

    const delivered = await admin.post(`/api/admin/orders/${n}/status`).send({ status: "DELIVERED" });
    expect(delivered.body).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID", fulfillmentStatus: "DELIVERED" });
    const bad = await admin.post(`/api/admin/orders/${n}/status`).send({ status: "PROCESSING" });
    expect(bad.status).toBe(409);
    expect(bad.body.error.details.code).toBe("INVALID_TRANSITION");

    const detail = await admin.get(`/api/admin/orders/${n}`);
    expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(["PROCESSING", "SHIPPED", "DELIVERED"]);
    expect(detail.body.accessTokenHash).toBeUndefined();
    expect(await db.adminAuditLog.count({ where: { entityType: "order", entityId: n } })).toBeGreaterThanOrEqual(2);
  });

  it("cancelling returns stock and frees the discount code", async () => {
    const code = unique("BACK").toUpperCase().slice(0, 30);
    await db.coupon.create({ data: { code, type: "FIXED_AMOUNT", value: 500, usageLimit: 1 } });
    const v = await make(3000, 4);
    const a = visitor();
    await a.post("/api/cart/items").send({ variantId: v, quantity: 2 }).expect(201);
    await a.post("/api/cart/coupon").send({ code }).expect(200);
    const { res, body } = await checkout(a);
    expect((await inv(v)).quantityOnHand).toBe(2);
    await admin.post(`/api/admin/orders/${res.body.orderNumber}/status`).send({ status: "CANCELLED", message: "Customer asked to cancel" }).expect(200);
    expect(await inv(v)).toMatchObject({ quantityOnHand: 4, quantityReserved: 0 });
    expect((await db.coupon.findUniqueOrThrow({ where: { code } })).timesRedeemed).toBe(0);
    expect([...mailer.sent].reverse().find((m) => m.to === body.email)!.subject).toContain("cancelled");
  });

  it("is restricted to staff with order permissions", async () => {
    const { agent: editor } = await loginAs("CONTENT_EDITOR");
    expect((await editor.get("/api/admin/orders")).status).toBe(403);
    const { agent: om } = await loginAs("ORDER_MANAGER");
    expect((await om.get("/api/admin/orders")).status).toBe(200);
  });
});

describe("reservation expiry", () => {
  it("cancels unpaid online orders after the window and releases their stock", async () => {
    const v = await make(2000, 3);
    const order = await db.order.create({
      data: {
        orderNumber: unique("MR-X").slice(0, 32), email: "late@test.local", customerFirstName: "L", customerLastName: "P", shippingAddress: address,
        status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentMethod: "CARD", subtotalMinor: 2000, totalMinor: 2000, shippingMethodName: "Standard",
        idempotencyKey: key(), reservationExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    await db.$transaction((tx) => reserve(tx, v, 2, { orderId: order.id }));
    expect((await inv(v)).quantityReserved).toBe(2);
    const released = await releaseExpiredReservations({ env, db, log: createLogger("silent"), storage, mailer });
    expect(released).toBeGreaterThanOrEqual(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(await inv(v)).toMatchObject({ quantityOnHand: 3, quantityReserved: 0 });
  });
});
