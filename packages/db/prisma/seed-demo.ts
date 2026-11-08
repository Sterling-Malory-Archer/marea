/**
 * DEVELOPMENT DEMO DATA — not merchandise.
 *
 * Creates sample products (references prefixed DEMO-) so the storefront can be
 * built and tested before the real assortment is entered. Every image is a
 * flagged placeholder (`isPlaceholder = true`); the storefront renders these
 * as clearly labelled placeholder tiles, never as real photography.
 *
 *   pnpm db:seed:demo           create / refresh demo products
 *   pnpm db:seed:demo --purge   delete all DEMO- products and demo brands
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createPrismaClient } from "../src/index.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const db = createPrismaClient(process.env.DATABASE_URL!);

const DEMO_BRANDS = [
  { name: "MAREA Studio", slug: "marea-studio", description: "Demo brand — replace with the real house label." },
  { name: "Atelier Nord", slug: "atelier-nord", description: "Demo brand — replace with a real brand." },
  { name: "Lanterna", slug: "lanterna", description: "Demo brand — replace with a real brand." },
];

type Demo = {
  ref: string; title: string; brand: string; cat: string; extra?: string[]; scale: string; colors: string[];
  price: number; was?: number; collections?: string[]; isNew?: boolean; description: string; composition: string;
};

const P: Demo[] = [
  { ref: "COAT-01", title: "Double-Faced Wool Coat", brand: "marea-studio", cat: "women/coats", scale: "alpha", colors: ["camel", "charcoal"], price: 34900, collections: ["new-season", "contemporary-classics", "bestsellers"], isNew: true, description: "An unlined, double-faced coat cut long and relaxed through the shoulder, with hand-finished edges and a single concealed button.", composition: "90% wool, 10% cashmere" },
  { ref: "KNIT-02", title: "Ribbed Merino Crewneck", brand: "marea-studio", cat: "women/knitwear", scale: "alpha", colors: ["ivory", "burgundy", "grey-melange"], price: 12900, collections: ["everyday-essentials", "bestsellers"], isNew: true, description: "A close-fitting crewneck in fine extra-soft merino with a deep ribbed hem.", composition: "100% merino wool" },
  { ref: "DRS-03", title: "Bias-Cut Satin Midi Dress", brand: "atelier-nord", cat: "women/dresses", scale: "it-numeric", colors: ["chocolate", "black"], price: 18900, was: 24900, collections: ["new-season"], isNew: true, description: "Cut on the bias so it moves with you, with a softly draped cowl neck and adjustable straps.", composition: "100% viscose satin" },
  { ref: "TRS-04", title: "Pleated Wide-Leg Trousers", brand: "marea-studio", cat: "women/trousers", scale: "it-numeric", colors: ["stone", "navy"], price: 13900, collections: ["contemporary-classics", "everyday-essentials"], isNew: true, description: "High-waisted trousers with double front pleats and a fluid wide leg.", composition: "68% wool, 30% polyester, 2% elastane" },
  { ref: "SHT-05", title: "Oversized Poplin Shirt", brand: "lanterna", cat: "women/shirts", extra: ["women/tops"], scale: "alpha", colors: ["white", "sky"], price: 8900, collections: ["everyday-essentials", "bestsellers"], description: "A crisp, generous shirt in organic cotton poplin with a dropped shoulder.", composition: "100% organic cotton" },
  { ref: "JNS-06", title: "Straight High-Rise Jeans", brand: "atelier-nord", cat: "women/jeans", scale: "waist", colors: ["navy", "black"], price: 11900, was: 13900, collections: ["everyday-essentials"], description: "Rigid denim with a high rise and a straight, full-length leg.", composition: "100% cotton denim, 13 oz" },
  { ref: "SKT-07", title: "Wool Wrap Midi Skirt", brand: "lanterna", cat: "women/skirts", scale: "it-numeric", colors: ["camel", "black"], price: 11500, collections: ["new-season"], isNew: true, description: "A wrap skirt in brushed wool flannel with a tie fastening at the waist.", composition: "80% wool, 20% polyamide" },
  { ref: "MCT-08", title: "Single-Breasted Overcoat", brand: "marea-studio", cat: "men/coats", scale: "it-numeric", colors: ["navy", "camel"], price: 38900, collections: ["new-season", "contemporary-classics"], isNew: true, description: "A classic overcoat in Italian wool-cashmere, half-lined with a notch lapel.", composition: "85% wool, 15% cashmere" },
  { ref: "MKN-09", title: "Chunky Wool Cardigan", brand: "atelier-nord", cat: "men/knitwear", scale: "alpha", colors: ["olive", "ivory"], price: 15900, was: 19900, description: "A heavyweight shawl-collar cardigan knitted in a textured stitch.", composition: "70% wool, 30% alpaca" },
  { ref: "MTS-10", title: "Heavyweight Cotton T-shirt", brand: "marea-studio", cat: "men/t-shirts", scale: "alpha", colors: ["white", "black", "grey-melange"], price: 4500, collections: ["everyday-essentials", "bestsellers"], description: "A boxy T-shirt in dense 240 gsm cotton jersey.", composition: "100% cotton" },
  { ref: "BOT-11", title: "Leather Chelsea Boots", brand: "lanterna", cat: "shoes/boots", scale: "eu-shoe", colors: ["black", "chocolate"], price: 21900, collections: ["new-season", "bestsellers"], isNew: true, description: "Polished calf leather Chelsea boots on a stacked leather heel with rubber inset.", composition: "Upper: calf leather. Sole: leather and rubber" },
  { ref: "SNK-12", title: "Minimal Leather Sneakers", brand: "atelier-nord", cat: "shoes/sneakers", scale: "eu-shoe", colors: ["white", "stone"], price: 14900, collections: ["everyday-essentials"], description: "Low-profile sneakers in smooth leather with a stitched cupsole.", composition: "Upper: leather. Sole: rubber" },
  { ref: "HEL-13", title: "Slingback Kitten Heels", brand: "lanterna", cat: "shoes/heels", scale: "eu-shoe", colors: ["black", "burgundy"], price: 16900, was: 21900, description: "Pointed slingbacks on a 45 mm kitten heel.", composition: "Upper: suede. Sole: leather" },
  { ref: "BAG-14", title: "Structured Leather Tote", brand: "marea-studio", cat: "bags/tote-bags", scale: "one-size", colors: ["tan", "black"], price: 27900, collections: ["new-season", "contemporary-classics", "bestsellers"], isNew: true, description: "A roomy, structured tote in vegetable-tanned leather with an internal zip pocket.", composition: "100% bovine leather" },
  { ref: "BAG-15", title: "Soft Crossbody Bag", brand: "atelier-nord", cat: "bags/crossbody-bags", scale: "one-size", colors: ["taupe", "burgundy"], price: 15900, collections: ["everyday-essentials"], description: "A slouchy crossbody with an adjustable strap and magnetic closure.", composition: "100% lamb leather" },
  { ref: "BLT-16", title: "Leather Belt with Brass Buckle", brand: "marea-studio", cat: "accessories/belts", scale: "one-size", colors: ["black", "tan"], price: 5900, description: "A 30 mm belt in full-grain leather with a solid brass buckle.", composition: "Leather, brass" },
];

async function purge() {
  const products = await db.product.findMany({ where: { reference: { startsWith: "DEMO-" } }, select: { id: true } });
  await db.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
  await db.brand.deleteMany({ where: { slug: { in: DEMO_BRANDS.map((b) => b.slug) }, products: { none: {} } } });
  console.log(`Purged ${products.length} demo products.`);
}

async function main() {
  if (process.argv.includes("--purge")) return purge();

  for (const b of DEMO_BRANDS) await db.brand.upsert({ where: { slug: b.slug }, update: {}, create: b });
  const brands = new Map((await db.brand.findMany()).map((b) => [b.slug, b.id]));
  const cats = new Map((await db.category.findMany()).map((c) => [c.path, c.id]));
  const colors = new Map((await db.color.findMany()).map((c) => [c.slug, c]));
  const scales = await db.sizeScale.findMany({ include: { sizes: { orderBy: { sortOrder: "asc" } } } });
  const collections = new Map((await db.collection.findMany()).map((c) => [c.slug, c.id]));
  if (cats.size === 0) throw new Error("Run the base seed first (pnpm db:seed)");

  let n = 0;
  for (const [idx, d] of P.entries()) {
    const reference = `DEMO-${d.ref}`;
    if (await db.product.findUnique({ where: { reference } })) continue;
    const scale = scales.find((s) => s.code === d.scale)!;
    // Use a realistic subset of each size system.
    const sizes = d.scale === "eu-shoe" ? scale.sizes.filter((s) => !s.label.includes(".")).slice(1, 10) : d.scale === "waist" ? scale.sizes.slice(0, 9) : d.scale === "it-numeric" ? scale.sizes.slice(0, 6) : scale.sizes;
    const primaryId = cats.get(d.cat)!;
    const product = await db.product.create({
      data: {
        reference,
        slug: d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title: d.title,
        description: d.description,
        composition: d.composition,
        care: "Professional dry clean or gentle hand wash. Do not tumble dry.",
        brandId: brands.get(d.brand)!,
        primaryCategoryId: primaryId,
        sizeScaleId: scale.id,
        priceMinor: d.price,
        compareAtPriceMinor: d.was ?? null,
        isOnSale: !!d.was,
        isNewArrival: !!d.isNew,
        status: "ACTIVE",
        publishedAt: new Date(Date.now() - idx * 36e5),
        categories: { create: [d.cat, ...(d.extra ?? [])].map((p) => ({ categoryId: cats.get(p)! })) },
        collections: { create: (d.collections ?? []).map((c, i) => ({ collectionId: collections.get(c)!, sortOrder: i })) },
        images: {
          create: d.colors.flatMap((c, ci) => [
            { storageKey: `placeholder/${reference}/${c}-front`, colorId: colors.get(c)!.id, kind: "PRODUCT" as const, altText: `${d.title} in ${colors.get(c)!.name} — front`, width: 1200, height: 1600, sortOrder: ci * 2, isPlaceholder: true },
            { storageKey: `placeholder/${reference}/${c}-back`, colorId: colors.get(c)!.id, kind: "ALTERNATE" as const, altText: `${d.title} in ${colors.get(c)!.name} — back`, width: 1200, height: 1600, sortOrder: ci * 2 + 1, isPlaceholder: true },
          ]),
        },
      },
    });
    for (const c of d.colors) {
      const color = colors.get(c)!;
      for (const [si, size] of sizes.entries()) {
        // Deterministic stock pattern, including some sold-out sizes to exercise the UI.
        const qty = (idx + si + color.sortOrder) % 5 === 0 ? 0 : ((idx * 7 + si * 3) % 9) + 1;
        const variant = await db.productVariant.create({
          data: {
            productId: product.id,
            colorId: color.id,
            sizeId: size.id,
            sku: `${reference}-${c.toUpperCase().replace(/-/g, "").slice(0, 6)}-${size.label.replace(/\s+/g, "").replace("ONESIZE", "OS")}`,
            sortOrder: color.sortOrder * 100 + size.sortOrder,
            inventory: { create: { quantityOnHand: qty } },
          },
        });
        if (qty > 0) await db.inventoryMovement.create({ data: { variantId: variant.id, reason: "INITIAL", deltaOnHand: qty, note: "Demo seed" } });
      }
    }
    n++;
  }
  console.log(`Created ${n} demo products (placeholders only).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
