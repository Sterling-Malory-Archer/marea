import { z } from "zod";
import { patchSchema } from "../../lib/schema.js";
import type { Db } from "@marea/db";

/** Typed store settings with safe defaults; stored as JSON rows in `store_settings`. */
export const settingsSchema = z.object({
  "store.name": z.string().default("MAREA"),
  "store.tagline": z.string().default("Contemporary wardrobe, considered."),
  "store.tagline.me": z.string().default("Savremena garderoba, promišljeno."),
  "store.currency": z.string().length(3).default("EUR"),
  "store.locale": z.string().default("en-ME"),
  "store.supportEmail": z.string().default(""),
  "store.supportPhone": z.string().default(""),
  "store.instagramUrl": z.string().default(""),
  "shipping.freeOverMinor": z.number().int().nullable().default(10000),
  "checkout.codEnabled": z.boolean().default(true),
  "tax.vatRateBps": z.number().int().min(0).max(10000).default(2100),
  "returns.days": z.number().int().min(0).default(14),
  /// Legal details printed on order documents and packing slips.
  "company.name": z.string().default(""),
  "company.address": z.string().default(""),
  "company.taxId": z.string().default(""),
  "company.registrationNo": z.string().default(""),
  /// Staff inbox notified of every new order (empty = off).
  "notifications.orderEmail": z.string().default(""),
  /// Minutes an unpaid online-payment order holds its stock before it is released.
  "inventory.reservationMinutes": z.number().int().min(5).max(24 * 60).default(30),
  /// Cash-on-delivery orders: deduct stock when the order is placed, or only when it ships.
  "inventory.codStockCommit": z.enum(["order", "shipment"]).default("order"),
  /// Payment methods offered at checkout (card only takes effect once a provider is configured).
  "checkout.cardEnabled": z.boolean().default(true),
});

export type StoreSettings = z.infer<typeof settingsSchema>;

export async function getSettings(db: Db): Promise<StoreSettings> {
  const rows = await db.storeSetting.findMany();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.safeParse(raw);
  // A malformed value must never take the storefront down: fall back per key.
  if (parsed.success) return parsed.data;
  const out: Record<string, unknown> = settingsSchema.parse({});
  for (const [k, v] of Object.entries(raw)) {
    const field = settingsSchema.shape[k as keyof StoreSettings];
    if (field?.safeParse(v).success) out[k] = v;
  }
  return out as StoreSettings;
}

/** Validate and persist a partial settings update; unknown keys are rejected. */
export const settingsUpdateSchema = patchSchema(settingsSchema).strict();

export async function updateSettings(db: Db, patch: Partial<StoreSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db.storeSetting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
  }
}
