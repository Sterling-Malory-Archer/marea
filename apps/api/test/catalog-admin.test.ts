import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { db, ids, loginAs, storageDir, unique } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];
let agent: Agent;
let ref: Awaited<ReturnType<typeof ids>>;

const jpeg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 180, b: 160 } } }).jpeg().toBuffer();

beforeAll(async () => {
  ({ agent } = await loginAs("CATALOG_MANAGER"));
  ref = await ids();
});

async function createProduct(over: Record<string, unknown> = {}) {
  const res = await agent.post("/api/admin/products").send({
    reference: unique("T-"),
    title: "Wool Coat",
    sizeScaleId: ref.alpha.id,
    primaryCategoryId: ref.coats.id,
    priceMinor: 24900,
    ...over,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe("brands & categories", () => {
  it("creates a brand with an auto slug and audits it", async () => {
    const name = unique("Brand ");
    const res = await agent.post("/api/admin/brands").send({ name });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(name.toLowerCase().replace(/ /g, "-"));
    expect(await db.adminAuditLog.count({ where: { action: "brand.create", entityId: String(res.body.id) } })).toBe(1);
  });

  it("rejects duplicate brand names with 409", async () => {
    const name = unique("Dup ");
    await agent.post("/api/admin/brands").send({ name });
    expect((await agent.post("/api/admin/brands").send({ name })).status).toBe(409);
  });

  it("keeps category paths in sync and prevents cycles", async () => {
    const root = (await agent.post("/api/admin/categories").send({ name: unique("Root ") })).body;
    const child = (await agent.post("/api/admin/categories").send({ name: "Capes", parentId: root.id })).body;
    expect(child.path).toBe(`${root.slug}/capes`);
    expect(child.depth).toBe(1);

    await agent.patch(`/api/admin/categories/${root.id}`).send({ slug: `${root.slug}-x` });
    const moved = await db.category.findUniqueOrThrow({ where: { id: child.id } });
    expect(moved.path).toBe(`${root.slug}-x/capes`);

    const cycle = await agent.patch(`/api/admin/categories/${root.id}`).send({ parentId: child.id });
    expect(cycle.status).toBe(400);
    expect((await agent.delete(`/api/admin/categories/${root.id}`)).status).toBe(409);
  });

  it("supports custom size systems", async () => {
    const res = await agent.post("/api/admin/size-scales").send({ name: unique("Kids "), code: unique("kids-").toLowerCase(), sizes: ["2Y", "4Y", "6Y"] });
    expect(res.status).toBe(201);
    expect(res.body.sizes.map((s: { label: string }) => s.label)).toEqual(["2Y", "4Y", "6Y"]);
  });
});

describe("products", () => {
  it("creates drafts and validates prices", async () => {
    const p = await createProduct();
    expect(p.status).toBe("DRAFT");
    expect(p.slug).toMatch(/^wool-coat/);
    expect(p.categories).toHaveLength(1);

    const bad = await agent.patch(`/api/admin/products/${p.id}`).send({ compareAtPriceMinor: 20000 });
    expect(bad.status).toBe(422);

    const sale = await agent.patch(`/api/admin/products/${p.id}`).send({ compareAtPriceMinor: 34900 });
    expect(sale.body.isOnSale).toBe(true);
    expect(sale.body.discountPercent).toBe(28);

    expect((await agent.post("/api/admin/products").send({ reference: "X", title: "", priceMinor: -1, sizeScaleId: 1 })).status).toBe(422);
  });

  it("refuses to publish an incomplete product and explains why", async () => {
    const p = await createProduct();
    const res = await agent.post(`/api/admin/products/${p.id}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.error.details.problems).toHaveLength(2);
  });

  it("generates the colour × size matrix with unique SKUs and inventory rows", async () => {
    const p = await createProduct();
    const sizes = ref.alpha.sizes.slice(1, 4).map((s) => s.id);
    const colorIds = ref.colors.slice(0, 2).map((c) => c.id);
    const res = await agent.post(`/api/admin/products/${p.id}/variants/generate`).send({ colorIds, sizeIds: sizes, initialQuantity: 4 });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(6);
    const variants = res.body.product.variants;
    expect(new Set(variants.map((v: { sku: string }) => v.sku)).size).toBe(6);
    expect(variants[0].sku.startsWith(p.reference)).toBe(true);
    expect(variants.every((v: { available: number }) => v.available === 4)).toBe(true);

    // Idempotent: running again creates nothing.
    const again = await agent.post(`/api/admin/products/${p.id}/variants/generate`).send({ colorIds, sizeIds: sizes });
    expect(again.body.created).toBe(0);

    // Initial stock is recorded in the ledger.
    expect(await db.inventoryMovement.count({ where: { variantId: variants[0].id, reason: "INITIAL" } })).toBe(1);
  });

  it("rejects sizes from a different size system", async () => {
    const p = await createProduct();
    const res = await agent.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: ref.eu.sizes[0]!.id });
    expect(res.status).toBe(400);
  });

  it("uploads, validates, strips and stores images, then publishes", async () => {
    const p = await createProduct();
    await agent.post(`/api/admin/products/${p.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: ref.alpha.sizes[2]!.id, initialQuantity: 1 });

    const tooSmall = await agent.post(`/api/admin/products/${p.id}/images`).attach("images", await jpeg(300, 400), "small.jpg");
    expect(tooSmall.status).toBe(422);
    const notImage = await agent.post(`/api/admin/products/${p.id}/images`).attach("images", Buffer.from("hello"), "x.jpg");
    expect(notImage.status).toBe(422);

    const ok = await agent
      .post(`/api/admin/products/${p.id}/images`)
      .attach("images", await jpeg(900, 1200), "front.jpg")
      .attach("images", await jpeg(900, 1200), "back.jpg");
    expect(ok.status).toBe(201);
    expect(ok.body.items).toHaveLength(2);
    const [first, second] = ok.body.items;
    expect(first.url).toMatch(/^http:\/\/localhost:4000\/media\/products\//);
    expect(first.width).toBe(900);
    expect(fs.existsSync(path.join(storageDir, first.storageKey))).toBe(true);

    const reorder = await agent.put(`/api/admin/products/${p.id}/images/order`).send({ imageIds: [second.id, first.id] });
    expect(reorder.body.items[0].id).toBe(second.id);

    const pub = await agent.post(`/api/admin/products/${p.id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe("ACTIVE");
    expect(pub.body.publishedAt).toBeTruthy();

    expect((await agent.delete(`/api/admin/images/${first.id}`)).status).toBe(204);
    expect(fs.existsSync(path.join(storageDir, first.storageKey))).toBe(false);
  });

  it("keeps products that appear in orders (archive instead of delete)", async () => {
    const p = await createProduct();
    await db.order.create({
      data: {
        orderNumber: unique("T"),
        email: "c@test.local",
        customerFirstName: "A",
        customerLastName: "B",
        shippingAddress: {},
        paymentMethod: "CASH_ON_DELIVERY",
        subtotalMinor: 100,
        totalMinor: 100,
        shippingMethodName: "Standard",
        idempotencyKey: unique("k"),
        items: { create: { productId: p.id, sku: "X", productTitle: p.title, colorName: "Black", sizeLabel: "M", unitPriceMinor: 100, quantity: 1, lineTotalMinor: 100 } },
      },
    });
    expect((await agent.delete(`/api/admin/products/${p.id}`)).status).toBe(409);
    expect((await agent.post(`/api/admin/products/${p.id}/archive`)).body.status).toBe("ARCHIVED");

    const fresh = await createProduct();
    expect((await agent.delete(`/api/admin/products/${fresh.id}`)).status).toBe(204);
  });

  it("lists and searches products by title, reference and SKU", async () => {
    const p = await createProduct({ title: unique("Searchable Cape ") });
    const byTitle = await agent.get("/api/admin/products").query({ q: p.title.slice(0, 18) });
    expect(byTitle.body.items.some((i: { id: number }) => i.id === p.id)).toBe(true);
    const byRef = await agent.get("/api/admin/products").query({ q: p.reference });
    expect(byRef.body.total).toBe(1);
  });
});
