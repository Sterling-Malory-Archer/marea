import { beforeAll, describe, expect, it } from "vitest";
import { db, ids, loginAs, ORIGIN, request, unique } from "./helpers.js";

beforeAll(async () => {
  // One published product with stock so the homepage has something to show.
  const { agent } = await loginAs("CATALOG_MANAGER");
  const ref = await ids();
  const p = await agent.post("/api/admin/products").send({
    reference: unique("SF-"),
    title: "Storefront Coat",
    sizeScaleId: ref.alpha.id,
    primaryCategoryId: ref.coats.id,
    priceMinor: 19900,
    compareAtPriceMinor: 24900,
    isNewArrival: true,
  });
  await agent.post(`/api/admin/products/${p.body.id}/variants/generate`).send({ colorIds: [ref.colors[0]!.id, ref.colors[1]!.id], sizeIds: [ref.alpha.sizes[2]!.id], initialQuantity: 2 });
  await db.productImage.create({ data: { productId: p.body.id, storageKey: "placeholder/sf", isPlaceholder: true } });
  await agent.post(`/api/admin/products/${p.body.id}/publish`).expect(200);
});

describe("storefront API", () => {
  it("serves layout: settings, announcements and the category navigation", async () => {
    const res = await request().get("/api/store/layout");
    expect(res.status).toBe(200);
    expect(res.body.settings.storeName).toBe("MAREA");
    expect(res.body.settings.currency).toBe("EUR");
    // Footer threshold comes from the Montenegro delivery methods (seeded: free over €100).
    expect(res.body.settings.freeShippingOverMinor).toBe(10000);
    expect(res.body.announcements.length).toBeGreaterThan(0);
    const women = res.body.navigation.find((n: { slug: string }) => n.slug === "women");
    expect(women.children.map((c: { name: string }) => c.name)).toContain("Dresses");
  });

  it("serves database-driven homepage content with product cards", async () => {
    const res = await request().get("/api/store/home");
    expect(res.status).toBe(200);
    expect(res.body.hero[0].headline).toBeTruthy();
    expect(res.body.featuredCollections).toHaveLength(3);
    const card = res.body.newArrivals.find((c: { title: string }) => c.title === "Storefront Coat");
    expect(card).toMatchObject({ priceMinor: 19900, compareAtPriceMinor: 24900, discountPercent: 20, isOnSale: true, inStock: true });
    expect(card.colors).toHaveLength(2);
    // Placeholders never masquerade as real photography.
    expect(card.images[0]).toMatchObject({ url: null, isPlaceholder: true });
  });

  it("hides draft products", async () => {
    const { agent } = await loginAs("CATALOG_MANAGER");
    const ref = await ids();
    const title = unique("Unreleased Draft ");
    await agent.post("/api/admin/products").send({ reference: unique("DR-"), title, sizeScaleId: ref.alpha.id, priceMinor: 100, isNewArrival: true }).expect(201);
    const res = await request().get("/api/store/home");
    expect(res.body.newArrivals.length).toBeGreaterThan(0);
    expect(res.body.newArrivals.some((c: { title: string }) => c.title === title)).toBe(false);
  });

  it("subscribes to the newsletter with recorded consent and validates input", async () => {
    const email = `${unique("nl")}@test.local`;
    const post = (body: object) => request().post("/api/store/newsletter").set("Origin", ORIGIN).send(body);
    expect((await post({ email, consent: true })).status).toBe(201);
    expect((await post({ email, consent: true })).status).toBe(201); // no enumeration
    expect((await post({ email: "not-an-email", consent: true })).status).toBe(422);
    expect((await post({ email: `${unique("x")}@test.local` })).status).toBe(422);
    const sub = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    expect(sub.status).toBe("SUBSCRIBED");
    expect(sub.consentAt).toBeTruthy();
  });
});
