import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, db, ids, loginAs, ORIGIN, unique } from "./helpers.js";

const guest = () => supertest.agent(app).set("Origin", ORIGIN);
let v: { roomy: number; scarce: number; sale: number; draft: number };

beforeAll(async () => {
  const { agent } = await loginAs("ADMIN");
  const ref = await ids();
  const M = ref.alpha.sizes.find((s) => s.label === "M")!.id;
  const make = async (over: Record<string, unknown>, qty: number, publish = true) => {
    const p = (await agent.post("/api/admin/products").send({ reference: unique("CT-"), title: "Cart item", sizeScaleId: ref.alpha.id, primaryCategoryId: ref.coats.id, ...over }).expect(201)).body;
    const variant = (await agent.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: M, initialQuantity: qty }).expect(201)).body;
    await db.productImage.create({ data: { productId: p.id, storageKey: `placeholder/${p.id}`, isPlaceholder: true } });
    if (publish) await agent.post(`/api/admin/products/${p.id}/publish`).expect(200);
    return variant.id as number;
  };
  v = {
    roomy: await make({ priceMinor: 10000 }, 50),
    scarce: await make({ priceMinor: 5000 }, 2),
    sale: await make({ priceMinor: 8000, compareAtPriceMinor: 12000 }, 10),
    draft: await make({ priceMinor: 100 }, 5, false),
  };
  await db.coupon.createMany({
    data: [
      { code: "TEST10", type: "PERCENTAGE", value: 1000 },
      { code: "TESTMIN", type: "FIXED_AMOUNT", value: 2000, minSubtotalMinor: 50000 },
      { code: "TESTOLD", type: "PERCENTAGE", value: 1000, endsAt: new Date(Date.now() - 1000) },
      { code: "TESTSHIP", type: "FREE_SHIPPING" },
    ],
    skipDuplicates: true,
  });
});

describe("guest bag", () => {
  it("returns an empty bag without creating one or setting cookies", async () => {
    const res = await guest().get("/api/cart");
    expect(res.body).toMatchObject({ id: null, itemCount: 0 });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("adds items via a signed httpOnly cookie and prices them on the server", async () => {
    const g = guest();
    const add = await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 2 });
    expect(add.status).toBe(201);
    expect(String(add.headers["set-cookie"])).toMatch(/marea_cart=s%3A.*HttpOnly/i);
    expect(add.body).toMatchObject({ itemCount: 2, subtotalMinor: 20000, canCheckout: true });
    expect(add.body.lines[0]).toMatchObject({ unitPriceMinor: 10000, quantity: 2, size: "M" });
    // Free delivery threshold is €100 → 200 € qualifies.
    expect(add.body.shipping.estimateMinor).toBe(0);
    expect(add.body.vatMinor).toBe(Math.round((20000 * 2100) / 12100));
    expect((await g.get("/api/cart")).body.itemCount).toBe(2);
  });

  it("ignores any client-sent price and rejects tampered cookies", async () => {
    const g = guest();
    const res = await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 1, priceMinor: 1 });
    expect(res.body.subtotalMinor).toBe(10000);
    const forged = await supertest(app).get("/api/cart").set("Cookie", "marea_cart=s%3Aforged.invalidsig");
    expect(forged.body.id).toBeNull();
  });

  it("enforces stock and per-line limits", async () => {
    const g = guest();
    const over = await g.post("/api/cart/items").send({ variantId: v.scarce, quantity: 3 });
    expect(over.status).toBe(409);
    expect(over.body.error.details).toMatchObject({ code: "INSUFFICIENT_STOCK", available: 2 });
    await g.post("/api/cart/items").send({ variantId: v.scarce, quantity: 2 }).expect(201);
    expect((await g.post("/api/cart/items").send({ variantId: v.scarce, quantity: 1 })).status).toBe(409);
    expect((await g.post("/api/cart/items").send({ variantId: v.draft, quantity: 1 })).status).toBe(404);
    expect((await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 11 })).status).toBe(422);
  });

  it("flags lines whose stock dropped after adding", async () => {
    const g = guest();
    await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 3 }).expect(201);
    await db.inventory.update({ where: { variantId: v.roomy }, data: { quantityOnHand: 1 } });
    const res = await g.get("/api/cart");
    expect(res.body.lines[0]).toMatchObject({ issue: "INSUFFICIENT_STOCK", maxQuantity: 1 });
    expect(res.body.canCheckout).toBe(false);
    await db.inventory.update({ where: { variantId: v.roomy }, data: { quantityOnHand: 50 } });
  });

  it("updates and removes lines", async () => {
    const g = guest();
    const line = (await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 1 })).body.lines[0];
    expect((await g.patch(`/api/cart/items/${line.id}`).send({ quantity: 4 })).body.itemCount).toBe(4);
    expect((await g.delete(`/api/cart/items/${line.id}`)).body.itemCount).toBe(0);
    // Another visitor can't touch this line.
    const other = guest();
    await other.post("/api/cart/items").send({ variantId: v.roomy, quantity: 1 });
    const theirs = (await other.get("/api/cart")).body.lines[0];
    expect((await g.patch(`/api/cart/items/${theirs.id}`).send({ quantity: 2 })).status).toBe(404);
  });
});

describe("discount codes", () => {
  it("applies a percentage code to full-price items only", async () => {
    const g = guest();
    await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 1 });
    await g.post("/api/cart/items").send({ variantId: v.sale, quantity: 1 });
    const res = await g.post("/api/cart/coupon").send({ code: "test10" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subtotalMinor: 18000, discountMinor: 1000, coupon: { code: "TEST10", valid: true } });
  });

  it("rejects invalid and expired codes, and keeps a below-minimum code pending", async () => {
    const g = guest();
    await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 1 });
    expect((await g.post("/api/cart/coupon").send({ code: "NOPE" })).body.error.details.code).toBe("COUPON_INVALID");
    expect((await g.post("/api/cart/coupon").send({ code: "TESTOLD" })).body.error.details.code).toBe("COUPON_EXPIRED");
    const min = await g.post("/api/cart/coupon").send({ code: "TESTMIN" });
    expect(min.body.coupon).toMatchObject({ valid: false, error: "COUPON_MIN_SUBTOTAL", minSubtotalMinor: 50000 });
    expect(min.body.discountMinor).toBe(0);
    const line = min.body.lines[0];
    const more = await g.patch(`/api/cart/items/${line.id}`).send({ quantity: 5 });
    expect(more.body).toMatchObject({ discountMinor: 2000, coupon: { valid: true } });
  });

  it("free-shipping code zeroes the delivery estimate", async () => {
    const g = guest();
    await g.post("/api/cart/items").send({ variantId: v.scarce, quantity: 1 }); // €50, below free threshold
    expect((await g.get("/api/cart")).body.shipping.estimateMinor).toBeGreaterThan(0);
    expect((await g.post("/api/cart/coupon").send({ code: "TESTSHIP" })).body.shipping.estimateMinor).toBe(0);
    expect((await g.delete("/api/cart/coupon")).body.coupon).toBeNull();
  });
});

describe("guest → customer merge", () => {
  it("merges the guest bag into the account on sign-in and persists across sessions", async () => {
    const email = `${unique("merge")}@test.local`;
    const g = guest();
    await g.post("/api/cart/items").send({ variantId: v.roomy, quantity: 2 }).expect(201);
    await g.post("/api/auth/register").send({ email, password: "Merge-pass-2026", firstName: "M", lastName: "G", acceptTerms: true }).expect(201);
    expect((await g.get("/api/cart")).body.itemCount).toBe(2);

    // Second device: a separate guest bag with the same item, merged and capped.
    const phone = guest();
    await phone.post("/api/cart/items").send({ variantId: v.roomy, quantity: 9 });
    await phone.post("/api/auth/login").send({ email, password: "Merge-pass-2026" }).expect(200);
    const merged = (await phone.get("/api/cart")).body;
    expect(merged.lines).toHaveLength(1);
    expect(merged.itemCount).toBe(10); // 2 + 9 capped at the per-line limit

    await phone.post("/api/auth/logout").expect(204);
    expect((await phone.get("/api/cart")).body.itemCount).toBe(0);
    const later = guest();
    await later.post("/api/auth/login").send({ email, password: "Merge-pass-2026" }).expect(200);
    expect((await later.get("/api/cart")).body.itemCount).toBe(10);
  });
});
