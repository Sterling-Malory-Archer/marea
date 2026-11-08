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


// ── Montenegrin ("me") translations of base content ─────────────────────────
// Only inserts missing rows: never overwrites text an administrator has edited.
const ME = "me";
async function translations() {
  await db.storeSetting.upsert({ where: { key: "store.tagline.me" }, update: {}, create: { key: "store.tagline.me", value: "Savremena garderoba, promišljeno." } });

  const categories: Record<string, [string, string?]> = {
    women: ["Žene", "Odjeća za ovu sezonu, od lepršavih haljina do krojenih kaputa."],
    "women/dresses": ["Haljine"], "women/tops": ["Topovi"], "women/shirts": ["Košulje"], "women/trousers": ["Pantalone"],
    "women/jeans": ["Farmerke"], "women/skirts": ["Suknje"], "women/jackets": ["Jakne"], "women/coats": ["Kaputi"], "women/knitwear": ["Trikotaža"],
    men: ["Muškarci", "Promišljeni osnovni komadi i gornja odjeća koja traje."],
    "men/t-shirts": ["Majice"], "men/shirts": ["Košulje"], "men/trousers": ["Pantalone"], "men/jeans": ["Farmerke"],
    "men/jackets": ["Jakne"], "men/coats": ["Kaputi"], "men/knitwear": ["Trikotaža"],
    shoes: ["Obuća", "Obuća za svaki dan i svaku priliku."],
    "shoes/sneakers": ["Patike"], "shoes/boots": ["Čizme"], "shoes/heels": ["Cipele na štiklu"], "shoes/flats": ["Ravne cipele"], "shoes/sandals": ["Sandale"],
    bags: ["Torbe", "Kožne i tekstilne torbe bezvremenskih oblika."],
    "bags/shoulder-bags": ["Torbe na rame"], "bags/tote-bags": ["Tote torbe"], "bags/crossbody-bags": ["Crossbody torbe"], "bags/clutches": ["Pismo torbice"],
    accessories: ["Aksesoari", "Završni detalji."],
    "accessories/belts": ["Kaiševi"], "accessories/wallets": ["Novčanici"], "accessories/jewellery": ["Nakit"], "accessories/other-accessories": ["Ostali aksesoari"],
  };
  for (const [path, [name, description]] of Object.entries(categories)) {
    const c = await db.category.findUnique({ where: { path } });
    if (c) await db.categoryTranslation.upsert({ where: { categoryId_locale: { categoryId: c.id, locale: ME } }, update: {}, create: { categoryId: c.id, locale: ME, name, description: description ?? null } });
  }

  const colors: Record<string, string> = {
    black: "Crna", ivory: "Slonovača", white: "Bijela", stone: "Kamen", camel: "Kamel", tan: "Konjak", chocolate: "Čokoladna",
    burgundy: "Bordo", navy: "Teget", sky: "Nebesko plava", olive: "Maslinasta", sage: "Žalfija", "grey-melange": "Siva melanž",
    charcoal: "Antracit", taupe: "Sivo-smeđa", gold: "Zlatna", silver: "Srebrna",
  };
  for (const [slug, name] of Object.entries(colors)) {
    const c = await db.color.findUnique({ where: { slug } });
    if (c) await db.colorTranslation.upsert({ where: { colorId_locale: { colorId: c.id, locale: ME } }, update: {}, create: { colorId: c.id, locale: ME, name } });
  }

  const collections: Record<string, { title: string; eyebrow?: string; description: string }> = {
    "new-season": { title: "Nova sezona", eyebrow: "JZ26", description: "Najnoviji komadi za jesen i zimu." },
    "everyday-essentials": { title: "Osnove za svaki dan", eyebrow: "Garderoba", description: "Temelji kojima ćete se vraćati svakog jutra." },
    "contemporary-classics": { title: "Savremeni klasici", eyebrow: "Krojenje", description: "Poznati oblici, iznova promišljeni." },
    bestsellers: { title: "Najtraženije", description: "Komadi koje naši kupci najčešće biraju." },
  };
  for (const [slug, t] of Object.entries(collections)) {
    const c = await db.collection.findUnique({ where: { slug } });
    if (c) await db.collectionTranslation.upsert({ where: { collectionId_locale: { collectionId: c.id, locale: ME } }, update: {}, create: { collectionId: c.id, locale: ME, title: t.title, eyebrow: t.eyebrow ?? null, description: t.description } });
  }

  const heroByHeadline: Record<string, { eyebrow: string; headline: string; body: string; imageAlt: string; secondary?: string }> = {
    "The Quiet Season": { eyebrow: "Jesen / zima 2026", headline: "Tiha sezona", body: "Mekano krojenje, češljana vuna i paleta pozajmljena od zimske obale. Komadi stvoreni da se nose, pa ponovo nose.", imageAlt: "Fotografija kampanje — model u kaputu od kamel vune", secondary: "Pogledajte lookbook" },
    "Tailoring, Unhurried": { eyebrow: "Izbor", headline: "Krojenje bez žurbe", body: "Opušteni kostimi i lepršave košulje za dane koji se kreću između kancelarije i večeri.", imageAlt: "Fotografija kampanje — opušteno odijelo boje kamena" },
  };
  for (const h of await db.heroSlide.findMany()) {
    const t = heroByHeadline[h.headline];
    if (t) await db.heroSlideTranslation.upsert({ where: { heroSlideId_locale: { heroSlideId: h.id, locale: ME } }, update: {}, create: { heroSlideId: h.id, locale: ME, eyebrow: t.eyebrow, headline: t.headline, body: t.body, primaryCtaLabel: "Pogledajte kolekciju", secondaryCtaLabel: t.secondary ?? null, imageAlt: t.imageAlt } });
  }

  const announcements: Record<string, [string, string?]> = {
    "Complimentary delivery on orders over €100": ["Besplatna dostava za porudžbine preko 100 €"],
    "Autumn / Winter 2026 is now online": ["Kolekcija jesen / zima 2026 je sada online", "Otkrijte"],
    "Free exchanges within 14 days": ["Besplatna zamjena u roku od 14 dana", "Detalji"],
  };
  for (const a of await db.announcementMessage.findMany()) {
    const t = announcements[a.message];
    if (t) await db.announcementTranslation.upsert({ where: { announcementId_locale: { announcementId: a.id, locale: ME } }, update: {}, create: { announcementId: a.id, locale: ME, message: t[0], linkLabel: t[1] ?? null } });
  }

  const blocks: Record<string, { eyebrow?: string; title: string; body: string; ctaLabel?: string; imageAlt?: string }> = {
    "Dressing for the Adriatic winter": { eyebrow: "Iz žurnala", title: "Oblačenje za jadransku zimu", body: "Blagi dani, oštre večeri i vjetar sa zaliva. Kratak vodič kroz slojevito oblačenje vune, kože i pamuka za obalu od novembra do marta — i kroz kupovinu manje, ali boljih komada.", ctaLabel: "Pročitajte priču", imageAlt: "Editorijalna fotografija — žena šeta kamenim šetalištem uz more" },
    "Free exchanges": { title: "Besplatna zamjena", body: "U roku od 14 dana od isporuke" },
    "Fast delivery": { title: "Brza dostava", body: "1–3 radna dana širom Crne Gore" },
    "Free delivery": { title: "Besplatna dostava", body: "Za porudžbine preko 100 €" },
    "Cash on delivery": { title: "Plaćanje pouzećem", body: "Platite kuriru prilikom preuzimanja" },
  };
  for (const b of await db.contentBlock.findMany()) {
    const t = blocks[b.title];
    if (t) await db.contentBlockTranslation.upsert({ where: { contentBlockId_locale: { contentBlockId: b.id, locale: ME } }, update: {}, create: { contentBlockId: b.id, locale: ME, eyebrow: t.eyebrow ?? null, title: t.title, body: t.body, ctaLabel: t.ctaLabel ?? null, imageAlt: t.imageAlt ?? null } });
  }
}

// ── Size guides (indicative conversions; column keys are translated in the UI) ──
async function sizeGuides() {
  const guides: Record<string, { columns: string[]; rows: string[][]; note: string }> = {
    alpha: {
      columns: ["size", "eu", "it", "uk", "us"],
      rows: [["XS", "34", "38", "6", "2"], ["S", "36", "40", "8", "4"], ["M", "38", "42", "10", "6"], ["L", "40", "44", "12", "8"], ["XL", "42", "46", "14", "10"], ["XXL", "44", "48", "16", "12"]],
      note: "indicative",
    },
    "it-numeric": {
      columns: ["it", "eu", "uk", "us"],
      rows: ["36", "38", "40", "42", "44", "46", "48", "50", "52", "54"].map((it) => [it, String(+it - 4), String(+it - 32), String(+it - 36)]),
      note: "indicative",
    },
    waist: {
      columns: ["waistIn", "waistCm"],
      rows: ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "36", "38"].map((w) => [w, String(Math.round(+w * 2.54))]),
      note: "measureWaist",
    },
    "eu-shoe": {
      columns: ["eu", "uk", "footCm"],
      rows: [["35", "2.5", "22.5"], ["36", "3.5", "23"], ["37", "4", "23.5"], ["38", "5", "24.5"], ["39", "6", "25"], ["40", "6.5", "25.5"], ["41", "7.5", "26.5"], ["42", "8", "27"], ["43", "9", "27.5"], ["44", "9.5", "28.5"], ["45", "10.5", "29"], ["46", "11", "29.5"]],
      note: "measureFoot",
    },
  };
  for (const [code, guide] of Object.entries(guides)) {
    const scale = await db.sizeScale.findUnique({ where: { code } });
    if (scale && scale.guide == null) await db.sizeScale.update({ where: { id: scale.id }, data: { guide } });
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
  await translations();
  await sizeGuides();
  await owner();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
