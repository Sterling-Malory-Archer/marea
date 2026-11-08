import type { InventoryMovementReason, Tx } from "@marea/db";
import { conflict, notFound } from "../../lib/errors.js";

/**
 * All stock mutations are single guarded UPDATE statements, so concurrent
 * checkouts can never oversell: the WHERE clause re-checks availability
 * atomically inside InnoDB's row lock. Every change is written to the ledger.
 *
 *   available = quantityOnHand − quantityReserved
 */

interface MoveMeta {
  actorUserId?: number | null;
  orderId?: number | null;
  note?: string | null;
}

async function ledger(tx: Tx, variantId: number, reason: InventoryMovementReason, dOnHand: number, dReserved: number, meta: MoveMeta) {
  await tx.inventoryMovement.create({
    data: {
      variantId,
      reason,
      deltaOnHand: dOnHand,
      deltaReserved: dReserved,
      actorUserId: meta.actorUserId ?? null,
      orderId: meta.orderId ?? null,
      note: meta.note?.slice(0, 255) ?? null,
    },
  });
}

/** Physical stock change (restock, correction, damage, return). Cannot drop below reserved. */
export async function adjustOnHand(
  tx: Tx,
  variantId: number,
  delta: number,
  reason: Extract<InventoryMovementReason, "INITIAL" | "ADJUSTMENT" | "RESTOCK" | "DAMAGE" | "RETURN">,
  meta: MoveMeta = {},
) {
  if (!Number.isInteger(delta) || delta === 0) return;
  const changed = await tx.$executeRaw`
    UPDATE inventory
       SET quantityOnHand = quantityOnHand + ${delta}, updatedAt = NOW(3)
     WHERE variantId = ${variantId}
       AND quantityOnHand + ${delta} >= 0
       AND quantityOnHand + ${delta} >= quantityReserved`;
  if (changed === 0) {
    const inv = await tx.inventory.findUnique({ where: { variantId } });
    if (!inv) throw notFound("Inventory record");
    throw conflict(
      `Stock cannot go below the ${inv.quantityReserved} unit(s) reserved by unpaid orders (on hand: ${inv.quantityOnHand}).`,
    );
  }
  await ledger(tx, variantId, reason, delta, 0, meta);
}

/** Set an absolute on-hand count (stock-take). Locks the row to compute the delta safely. */
export async function setOnHand(tx: Tx, variantId: number, quantity: number, meta: MoveMeta = {}) {
  const rows = await tx.$queryRaw<{ quantityOnHand: number }[]>`
    SELECT quantityOnHand FROM inventory WHERE variantId = ${variantId} FOR UPDATE`;
  const current = rows[0];
  if (!current) throw notFound("Inventory record");
  await adjustOnHand(tx, variantId, quantity - Number(current.quantityOnHand), "ADJUSTMENT", meta);
}

/** Reserve stock for an unpaid order. Returns false (no change) if not enough is available. */
export async function reserve(tx: Tx, variantId: number, qty: number, meta: MoveMeta = {}): Promise<boolean> {
  const changed = await tx.$executeRaw`
    UPDATE inventory
       SET quantityReserved = quantityReserved + ${qty}, updatedAt = NOW(3)
     WHERE variantId = ${variantId}
       AND (allowBackorder = TRUE OR quantityOnHand - quantityReserved >= ${qty})`;
  if (changed === 0) return false;
  await ledger(tx, variantId, "RESERVATION", 0, qty, meta);
  return true;
}

/** Return reserved units to availability (payment failed / cancelled / reservation expired). */
export async function release(tx: Tx, variantId: number, qty: number, meta: MoveMeta = {}) {
  const changed = await tx.$executeRaw`
    UPDATE inventory
       SET quantityReserved = quantityReserved - ${qty}, updatedAt = NOW(3)
     WHERE variantId = ${variantId} AND quantityReserved >= ${qty}`;
  if (changed === 0) throw conflict(`Cannot release ${qty} unit(s) for variant ${variantId}: not reserved`);
  await ledger(tx, variantId, "RESERVATION_RELEASE", 0, -qty, meta);
}

/** Convert a reservation into a sale (payment confirmed): stock physically leaves. */
export async function commitSale(tx: Tx, variantId: number, qty: number, meta: MoveMeta = {}) {
  const changed = await tx.$executeRaw`
    UPDATE inventory
       SET quantityReserved = quantityReserved - ${qty},
           quantityOnHand  = quantityOnHand  - ${qty},
           updatedAt = NOW(3)
     WHERE variantId = ${variantId} AND quantityReserved >= ${qty}`;
  if (changed === 0) throw conflict(`Cannot commit sale of ${qty} unit(s) for variant ${variantId}: not reserved`);
  await ledger(tx, variantId, "SALE", -qty, -qty, meta);
}
