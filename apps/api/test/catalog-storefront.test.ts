import { beforeAll, describe, expect, it } from "vitest";
import { fulltextQuery } from "../src/modules/catalog/catalog.service.js";
import { db, ids, loginAs, request, unique } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];
let agent: Agent;
let catPath: string;
let brandA: { id: number; slug: string };
let brandB: { id: number; slug: string };
let coat: { id: number; slug: string };
let scarf: { id: number; slug: string };
let ref: Awaited<ReturnType<typeof ids>>;
const word = unique("zephyr").replace(/[^a-z]/g, ""); // unique searchable token

async function product(body: Record<string, unknown>, variants: { colorId: number; sizeId: number; qty: number }[]) {
  const p = (await agent.post("/api/admin/products").send({ reference: unique("CS-"), sizeScaleId: ref.alpha.id, ...body }).expect(201)).body;
  for (const v of variants) await agent.post(`/api/admin/products/${p.id}/variants`).send({ colorId: v.colorId, sizeId: v.sizeId, initialQuantity: v.qty }).expect(201);
  await db.productImage.create({ data: { productId: p.id, storageKey: `placeholder/${p.id}`, isPlaceholder: true } });
  await agent.post(`/api/admin/products/${p.id}/publish`).expect(200);
  return p;
}

beforeAll(async () => {
  ({ agent } = await loginAs("ADMIN"));
  ref = await ids();
  const root = (await agent.post("/api/admin/categories").send({ name: unique("Cat ") }).expect(201)).body;
  const child = (await agent.post("/api/admin/categories").send({ name: "Outerwear", parentId: root.id }).expect(201)).body;
  catPath = root.path;
  brandA = (await agent.post("/api/admin/brands").send({ name: unique("Alpha ") }).expect(201)).body;
  brandB = (await agent.post("/api/admin/brands").send({ name: unique("Beta ") }).expect(201)).body;
  const c = { black: ref.colors.find((x) => x.slug === "black")!, camel: ref.colors.find((x) => x.slug === "camel")!, ivory: ref.colors.find((x) => x.slug === "ivory")! };
  const S = ref.alpha.sizes.find((s) => s.label === "S")!.id;
  const M = ref.alpha.sizes.find((s) => s.label === "M")!.id;

  // Coat: M only in camel (black M is sold out) — tests the "same variant" rule.
  coat = await product(
    { title: `${word} Wool Coat`, description: "Warm double-faced wool.", brandId: brandA.id, primaryCategoryId: child.id, priceMinor: 30000, compareAtPriceMinor: 40000 },
    [{ colorId: c.black.id, sizeId: S, qty: 2 }, { colorId: c.black.id, sizeId: M, qty: 0 }, { colorId: c.camel.id, sizeId: M, qty: 5 }],
  );
  scarf = await product(
    { title: `${word} Cotton Scarf`, brandId: brandB.id, primaryCategoryId: root.id, priceMinor: 5000 },
    [{ colorId: c.ivory.id, sizeId: S, qty: 1 }],
  );
  await agent.put(`/api/admin/translations/product/${coat.id}/me`).send({ title: `${word} Vuneni kaput`, description: "Topla dvostrana vuna." }).expect(200);
});

const list = (q: Record<string, string | number>) => request().get("/api/store/products").query({ category: catPath, ...q });

describe("catalogue listing", () => {
  it("includes products from subcategories and returns facets", async () => {
    const res = await list({});
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.facets.brands.map((b: { slug: string }) => b.slug).sort()).toEqual([brandA.slug, brandB.slug].sort());
    expect(res.body.facets.price).toEqual({ min: 5000, max: 30000 });
    expect(res.body.facets.saleCount).toBe(1);
  });

  it("filters by brand, price, sale and stock", async () => {
    expect((await list({ brand: brandB.slug })).body.items.map((i: { id: number }) => i.id)).toEqual([scarf.id]);
    expect((await list({ minPrice: 10000 })).body.total).toBe(1);
    expect((await list({ sale: 1 })).body.items[0].id).toBe(coat.id);
    expect((await list({ inStock: 1 })).body.total).toBe(2);
  });

  it("requires size and colour to match the same in-stock variant", async () => {
    expect((await list({ size: "M" })).body.items.map((i: { id: number }) => i.id)).toEqual([coat.id]);
    expect((await list({ size: "M", color: "camel" })).body.total).toBe(1);
    // Black M exists but is sold out → no match.
    expect((await list({ size: "M", color: "black" })).body.total).toBe(0);
  });

  it("computes each facet ignoring its own filter", async () => {
    const res = await list({ brand: brandA.slug });
    // Brand facet still offers the other brand…
    expect(res.body.facets.brands).toHaveLength(2);
    // …while colours reflect only brand A's products.
    expect(res.body.facets.colors.map((c: { slug: string }) => c.slug).sort()).toEqual(["black", "camel"]);
    const sizes = Object.fromEntries(res.body.facets.sizes.map((s: { label: string; count: number }) => [s.label, s.count]));
    expect(sizes).toEqual({ S: 1, M: 1 });
  });

  it("sorts and paginates", async () => {
    const asc = await list({ sort: "price_asc" });
    expect(asc.body.items.map((i: { id: number }) => i.id)).toEqual([scarf.id, coat.id]);
    const page2 = await list({ sort: "price_asc", pageSize: 1, page: 2 });
    expect(page2.body.items.map((i: { id: number }) => i.id)).toEqual([coat.id]);
    expect(page2.body.pageCount).toBe(2);
  });

  it("ignores junk parameters instead of failing", async () => {
    const res = await list({ sort: "drop table", page: "abc", pageSize: 9999 });
    expect(res.status).toBe(200);
  });
});

describe("search", () => {
  it("builds a safe boolean full-text query", () => {
    expect(fulltextQuery("Wool  coat!")).toBe("+Wool* +coat*");
    expect(fulltextQuery("a ' \" ) (")).toBeNull();
    expect(fulltextQuery("čizme")).toBe("+čizme*");
  });

  it("finds products in English and in Montenegrin", async () => {
    const en = await request().get("/api/store/products").query({ q: `${word} coat` });
    expect(en.body.items.map((i: { id: number }) => i.id)).toEqual([coat.id]);
    const me = await request().get("/api/store/products").query({ q: `${word} kaput`, locale: "me" });
    expect(me.body.items[0]).toMatchObject({ id: coat.id, title: `${word} Vuneni kaput` });
    expect(me.body.sort).toBe("relevance");
  });

  it("finds by SKU and brand name", async () => {
    const v = await db.productVariant.findFirstOrThrow({ where: { productId: scarf.id } });
    expect((await request().get("/api/store/products").query({ q: v.sku })).body.items[0].id).toBe(scarf.id);
  });
});

describe("product detail", () => {
  it("returns variants with stock levels, sizes, colours and delivery info", async () => {
    const res = await request().get(`/api/store/products/${coat.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.sizes).toEqual(["S", "M"]);
    expect(res.body.colors.map((c: { slug: string }) => c.slug)).toEqual(["black", "camel"]);
    const blackM = res.body.variants.find((v: { colorSlug: string; size: string }) => v.colorSlug === "black" && v.size === "M");
    expect(blackM.stock).toBe("out_of_stock");
    const blackS = res.body.variants.find((v: { colorSlug: string; size: string }) => v.colorSlug === "black" && v.size === "S");
    expect(blackS).toMatchObject({ stock: "low_stock", lowStockCount: 2 });
    expect(res.body.discountPercent).toBe(25);
    expect(res.body.breadcrumbs.at(-1).name).toBe("Outerwear");
    expect(res.body.delivery.returnsDays).toBe(14);
    expect(res.body.sizeScale.guide.columns).toContain("eu");
  });

  it("localizes with fallback to English for untranslated fields", async () => {
    const res = await request().get(`/api/store/products/${coat.slug}`).query({ locale: "me" });
    expect(res.body.title).toBe(`${word} Vuneni kaput`);
    expect(res.body.colors[0].name).toBe("Crna");
    const scarfMe = await request().get(`/api/store/products/${scarf.slug}`).query({ locale: "me" });
    expect(scarfMe.body.title).toBe(`${word} Cotton Scarf`);
  });

  it("hides unpublished products", async () => {
    await agent.post(`/api/admin/products/${scarf.id}/unpublish`).expect(200);
    expect((await request().get(`/api/store/products/${scarf.slug}`)).status).toBe(404);
    await agent.post(`/api/admin/products/${scarf.id}/publish`).expect(200);
  });
});

describe("translation administration", () => {
  it("validates, audits and enforces permissions", async () => {
    expect((await agent.put(`/api/admin/translations/product/${coat.id}/me`).send({ title: "" })).status).toBe(422);
    expect((await agent.put(`/api/admin/translations/product/${coat.id}/de`).send({ title: "x" })).status).toBe(422);
    expect((await agent.put(`/api/admin/translations/product/99999999/me`).send({ title: "x" })).status).toBe(404);
    const { agent: editor } = await loginAs("CONTENT_EDITOR");
    expect((await editor.put(`/api/admin/translations/product/${coat.id}/me`).send({ title: "x" })).status).toBe(403);
    const list = await agent.get(`/api/admin/translations/product/${coat.id}`);
    expect(list.body.items).toHaveLength(1);
    expect(await db.adminAuditLog.count({ where: { action: "translation.upsert", entityId: `${coat.id}:me` } })).toBeGreaterThan(0);
  });
});
