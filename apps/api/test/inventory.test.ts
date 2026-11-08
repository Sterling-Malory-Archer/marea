import { beforeAll, describe, expect, it } from "vitest";
import { commitSale, release, reserve } from "../src/modules/inventory/inventory.service.js";
import { db, ids, loginAs, unique } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];
let agent: Agent;
let variantId: number;

beforeAll(async () => {
  ({ agent } = await loginAs("CATALOG_MANAGER"));
  const ref = await ids();
  const p = await agent.post("/api/admin/products").send({ reference: unique("INV-"), title: "Tote", sizeScaleId: ref.oneSize.id, priceMinor: 9900 });
  const v = await agent.post(`/api/admin/products/${p.body.id}/variants`).send({ colorId: ref.colors[0]!.id, sizeId: ref.oneSize.sizes[0]!.id, initialQuantity: 3 });
  variantId = v.body.id;
});

const inv = () => db.inventory.findUniqueOrThrow({ where: { variantId } });

// One stateful scenario: steps build on each other, so they must run in order.
describe("inventory", { shuffle: false }, () => {
  it("adjusts and sets stock through the admin API with a ledger entry", async () => {
    const r1 = await agent.post(`/api/admin/variants/${variantId}/inventory`).send({ delta: 5, reason: "RESTOCK", note: "Delivery 114" });
    expect(r1.status).toBe(200);
    expect(r1.body.quantityOnHand).toBe(8);
    const r2 = await agent.post(`/api/admin/variants/${variantId}/inventory`).send({ set: 3 });
    expect(r2.body.quantityOnHand).toBe(3);
    const moves = await agent.get(`/api/admin/variants/${variantId}/inventory/movements`);
    expect(moves.body.items.map((m: { reason: string; deltaOnHand: number }) => [m.reason, m.deltaOnHand]).slice(0, 2)).toEqual([
      ["ADJUSTMENT", -5],
      ["RESTOCK", 5],
    ]);
    expect((await agent.post(`/api/admin/variants/${variantId}/inventory`).send({ delta: -10, reason: "DAMAGE" })).status).toBe(409);
  });

  it("never oversells under concurrent reservations", async () => {
    expect((await inv()).quantityOnHand - (await inv()).quantityReserved).toBe(3);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => db.$transaction((tx) => reserve(tx, variantId, 1, { note: "race" }))),
    );
    expect(attempts.filter(Boolean)).toHaveLength(3);
    expect((await inv()).quantityReserved).toBe(3);
  });

  it("protects reserved stock from manual reductions", async () => {
    const r = await agent.post(`/api/admin/variants/${variantId}/inventory`).send({ set: 1 });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/reserved/);
  });

  it("releases and commits reservations", async () => {
    await db.$transaction((tx) => release(tx, variantId, 1));
    await db.$transaction((tx) => commitSale(tx, variantId, 2));
    const after = await inv();
    expect(after.quantityReserved).toBe(0);
    expect(after.quantityOnHand).toBe(1);
    await expect(db.$transaction((tx) => commitSale(tx, variantId, 1))).rejects.toThrow(/not reserved/);
  });
});
