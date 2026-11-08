/**
 * Base seed — idempotent. Creates the configuration a real store needs:
 * settings, size systems, colours, category tree, shipping, homepage content
 * scaffolding and the first OWNER account (from SEED_ADMIN_* env vars).
 * It creates NO products. For development sample products run `seed:demo`.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { hash } from "@node-rs/argon2";
import { createPrismaClient } from "../src/index.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const db = createPrismaClient(process.env.DATABASE_URL!);

const slug = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function settings() {
  const values: Record<string, unknown> = {
    "store.name": "MAREA",
    "store.tagline": "Contemporary wardrobe, considered.",
    "store.currency": "EUR",
    "store.locale": "en-ME",
    "shipping.freeOverMinor": 10000,
    "checkout.codEnabled": true,
    "tax.vatRateBps": 2100,
    "returns.days": 14,
  };
  for (const [key, value] of Object.entries(values)) {
    // Never overwrite a value an administrator has already changed.
    await db.storeSetting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }
}

async function sizeScales() {
  const scales: [string, string, string[]][] = [
    ["Clothing (XS–XXL)", "alpha", ["XS", "S", "M", "L", "XL", "XXL"]],
    ["Clothing numeric (IT)", "it-numeric", ["36", "38", "40", "42", "44", "46", "48", "50", "52", "54"]],
    ["Jeans waist (W)", "waist", ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38"]],
    ["Footwear (EU)", "eu-shoe", ["35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "42", "43", "44", "45", "46"]],
    ["One size", "one-size", ["ONE SIZE"]],
  ];
  for (const [name, code, labels] of scales) {
    const scale = await db.sizeScale.upsert({ where: { code }, update: {}, create: { name, code } });
    for (const [i, label] of labels.entries()) {
      await db.size.upsert({
        where: { sizeScaleId_label: { sizeScaleId: scale.id, label } },
        update: {},
        create: { sizeScaleId: scale.id, label, sortOrder: i },
      });
    }
  }
}

async function colors() {
  const list: [string, string][] = [
    ["Black", "#1C1C1C"], ["Ivory", "#F2EDE3"], ["White", "#FFFFFF"], ["Stone", "#CFC6B6"],
    ["Camel", "#B8875A"], ["Tan", "#A87A52"], ["Chocolate", "#4A3328"], ["Burgundy", "#713B43"],
    ["Navy", "#1F2A44"], ["Sky", "#A9C1D9"], ["Olive", "#6B6B47"], ["Sage", "#A3AE95"],
    ["Grey Melange", "#9A9A97"], ["Charcoal", "#3C3C3C"], ["Taupe", "#8B7D6F"], ["Gold", "#C2A25A"], ["Silver", "#BFC1C2"],
  ];
  for (const [i, [name, hex]] of list.entries()) {
    await db.color.upsert({ where: { slug: slug(name) }, update: {}, create: { name, slug: slug(name), hex, sortOrder: i } });
  }
}

async function categories() {
  const tree: [string, string, string[]][] = [
    ["Women", "Clothing, edited for the season — from fluid dresses to tailored outerwear.", ["Dresses", "Tops", "Shirts", "Trousers", "Jeans", "Skirts", "Jackets", "Coats", "Knitwear"]],
    ["Men", "Considered essentials and outerwear built to last.", ["T-shirts", "Shirts", "Trousers", "Jeans", "Jackets", "Coats", "Knitwear"]],
    ["Shoes", "Footwear for every day and every occasion.", ["Sneakers", "Boots", "Heels", "Flats", "Sandals"]],
    ["Bags", "Leather and textile bags in timeless shapes.", ["Shoulder Bags", "Tote Bags", "Crossbody Bags", "Clutches"]],
    ["Accessories", "The finishing details.", ["Belts", "Wallets", "Jewellery", "Other Accessories"]],
  ];
  for (const [i, [name, description, children]] of tree.entries()) {
    const rootSlug = slug(name);
    const root = await db.category.upsert({
      where: { path: rootSlug },
      update: {},
      create: { name, slug: rootSlug, path: rootSlug, depth: 0, description, sortOrder: i },
    });
    for (const [j, child] of children.entries()) {
      const s = slug(child);
      await db.category.upsert({
        where: { path: `${rootSlug}/${s}` },
        update: {},
        create: { name: child, slug: s, path: `${rootSlug}/${s}`, depth: 1, parentId: root.id, sortOrder: j },
      });
    }
  }
}

async function shipping() {
  // Starting values only — edit in the admin dashboard once carrier contracts are agreed.
  const me = await db.shippingZone.upsert({
    where: { name: "Montenegro" },
    update: {},
    create: { name: "Montenegro", countryCodes: ["ME"] },
  });
  const region = await db.shippingZone.upsert({
    where: { name: "Western Balkans" },
    update: {},
    create: { name: "Western Balkans", countryCodes: ["RS", "BA", "HR", "AL", "MK", "XK", "SI"] },
  });
  const methods = [
    { zoneId: me.id, code: "standard", name: "Standard delivery", description: "Courier delivery, 1–3 working days", priceMinor: 350, freeOverMinor: 10000, minDays: 1, maxDays: 3, allowsCashOnDelivery: true, sortOrder: 0 },
    { zoneId: me.id, code: "express", name: "Express delivery", description: "Next working day in Podgorica, Budva, Kotor and Tivat", priceMinor: 700, freeOverMinor: null, minDays: 1, maxDays: 1, allowsCashOnDelivery: true, sortOrder: 1 },
    { zoneId: region.id, code: "regional", name: "Regional delivery", description: "Courier delivery, 3–7 working days", priceMinor: 1200, freeOverMinor: 25000, minDays: 3, maxDays: 7, allowsCashOnDelivery: false, sortOrder: 0 },
  ];
  for (const m of methods) {
    await db.shippingMethod.upsert({ where: { zoneId_code: { zoneId: m.zoneId, code: m.code } }, update: {}, create: m });
  }
}

async function content() {
  if ((await db.announcementMessage.count()) === 0) {
    await db.announcementMessage.createMany({
      data: [
        { message: "Complimentary delivery on orders over €100", sortOrder: 0 },
        { message: "Autumn / Winter 2026 is now online", linkLabel: "Discover", linkUrl: "/collections/new-season", sortOrder: 1 },
        { message: "Free exchanges within 14 days", linkLabel: "Details", linkUrl: "/help/returns", sortOrder: 2 },
      ],
    });
  }
  if ((await db.heroSlide.count()) === 0) {
    await db.heroSlide.createMany({
      data: [
        {
          layout: "SPLIT_RIGHT",
          eyebrow: "Autumn / Winter 2026",
          headline: "The Quiet Season",
          body: "Soft tailoring, brushed wool and a palette borrowed from the coast in winter. Pieces made to be worn, then worn again.",
          primaryCtaLabel: "Shop collection",
          primaryCtaUrl: "/collections/new-season",
          secondaryCtaLabel: "View lookbook",
          secondaryCtaUrl: "/collections/contemporary-classics",
          imageAlt: "Campaign photograph — model in a camel wool coat",
          imageIsPlaceholder: true,
          panelColor: "#D8C8B6",
          sortOrder: 0,
        },
        {
          layout: "SPLIT_RIGHT",
          eyebrow: "The Edit",
          headline: "Tailoring, Unhurried",
          body: "Relaxed suiting and fluid shirting for days that move between the office and the evening.",
          primaryCtaLabel: "Shop collection",
          primaryCtaUrl: "/collections/contemporary-classics",
          imageAlt: "Campaign photograph — relaxed suit in stone",
          imageIsPlaceholder: true,
          panelColor: "#C9C3B8",
          sortOrder: 1,
        },
      ],
    });
  }
  const cols = [
    { slug: "new-season", title: "New Season", eyebrow: "AW26", description: "The latest arrivals for autumn and winter.", featuredOnHome: true, sortOrder: 0 },
    { slug: "everyday-essentials", title: "Everyday Essentials", eyebrow: "Wardrobe", description: "Foundations you will reach for every morning.", featuredOnHome: true, sortOrder: 1 },
    { slug: "contemporary-classics", title: "Contemporary Classics", eyebrow: "Tailoring", description: "Familiar shapes, reconsidered.", featuredOnHome: true, sortOrder: 2 },
    { slug: "bestsellers", title: "Bestsellers", eyebrow: null, description: "Curated fallback used until there is enough sales history.", featuredOnHome: false, sortOrder: 9 },
  ];
  for (const c of cols) await db.collection.upsert({ where: { slug: c.slug }, update: {}, create: c });

  if ((await db.contentBlock.count()) === 0) {
    await db.contentBlock.createMany({
      data: [
        {
          placement: "HOME_EDITORIAL",
          eyebrow: "From the journal",
          title: "Dressing for the Adriatic winter",
          body: "Mild days, sharp evenings and the wind off the bay. A short guide to layering wool, leather and cotton for the coast between November and March — and to buying fewer, better pieces.",
          ctaLabel: "Read the story",
          ctaUrl: "/journal/adriatic-winter",
          imageAlt: "Editorial photograph — woman walking along a stone seafront",
          imageIsPlaceholder: true,
        },
        { placement: "HOME_SERVICE_STRIP", title: "Free exchanges", body: "Within 14 days of delivery", sortOrder: 0 },
        { placement: "HOME_SERVICE_STRIP", title: "Fast delivery", body: "1–3 working days across Montenegro", sortOrder: 1 },
        { placement: "HOME_SERVICE_STRIP", title: "Free delivery", body: "On orders over €100", sortOrder: 2 },
        { placement: "HOME_SERVICE_STRIP", title: "Cash on delivery", body: "Pay the courier when it arrives", sortOrder: 3 },
      ],
    });
  }
}

async function owner() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("  ! SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping owner account");
    return;
  }
  if (password.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return;
  await db.user.create({
    data: {
      email,
      passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      role: "OWNER",
      firstName: "Store",
      lastName: "Owner",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`  ✓ owner account ${email}`);
}

async function main() {
  console.log("Seeding base configuration…");
  await settings();
  await sizeScales();
  await colors();
  await categories();
  await shipping();
  await content();
  await owner();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
