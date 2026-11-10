import { beforeAll, describe, expect, it } from "vitest";
import { fillTokens } from "../src/modules/pages/pages.js";
import { getSettings } from "../src/modules/settings/settings.js";
import { db, loginAs, request, unique } from "./helpers.js";

type Agent = Awaited<ReturnType<typeof loginAs>>["agent"];
let editor: Agent;
let orders: Agent;

beforeAll(async () => {
  ({ agent: editor } = await loginAs("CONTENT_EDITOR"));
  ({ agent: orders } = await loginAs("ORDER_MANAGER"));
});

describe("information pages", () => {
  it("serves seeded pages in both languages with settings filled in", async () => {
    const en = (await request().get("/api/store/pages/help/returns").query({ locale: "en" }).expect(200)).body;
    const me = (await request().get("/api/store/pages/help/returns").query({ locale: "me" }).expect(200)).body;
    const days = (await getSettings(db))["returns.days"];
    expect(en.title).toBe("Returns and exchanges");
    expect(me.title).toBe("Povraćaj i zamjena");
    expect(en.intro).toContain(`${days} days`);
    expect(en.body).not.toMatch(/\{\{/);
    expect(en.needsReview).toBe(true);
  });

  it("adds live delivery prices, size guides and contact details by page kind", async () => {
    const ship = (await request().get("/api/store/pages/help/shipping").query({ locale: "en" }).expect(200)).body;
    const me = ship.zones.find((z: { countryCodes: string[] }) => z.countryCodes.includes("ME"));
    expect(me.methods.find((m: { code: string }) => m.code === "standard")).toMatchObject({ priceMinor: 350, freeOverMinor: 10000 });

    const sizes = (await request().get("/api/store/pages/help/size-guide").query({ locale: "en" }).expect(200)).body;
    expect(sizes.guides.length).toBeGreaterThan(0);
    expect(sizes.guides[0].guide.columns.length).toBeGreaterThan(0);

    const contact = (await request().get("/api/store/pages/help/contact").query({ locale: "me" }).expect(200)).body;
    expect(contact).toHaveProperty("contact");
  });

  it("fills unknown company details with a visible dash, never 'undefined'", () => {
    const out = fillTokens("{{companyTaxId}} / {{storeName}} / {{notAToken}}", { "store.name": "MAREA", "company.taxId": "" } as never, "en");
    expect(out).toBe("— / MAREA / {{notAToken}}");
  });

  it("returns 404 for unknown, unpublished or malformed addresses", async () => {
    await request().get("/api/store/pages/help/nope").query({ locale: "en" }).expect(404);
    await request().get("/api/store/pages/..%2Fadmin").query({ locale: "en" }).expect(404);
    await request().get("/api/store/pages/a/b/c").query({ locale: "en" }).expect(404);
    const slug = `help/${unique("hidden-")}`;
    const p = (await editor.post("/api/admin/pages").send({ slug, title: "Hidden", isPublished: false }).expect(201)).body;
    await request().get(`/api/store/pages/${slug}`).query({ locale: "en" }).expect(404);
    await editor.delete(`/api/admin/pages/${p.id}`).expect(204);
  });

  it("lets content editors create, translate and edit pages — but not on reserved addresses", async () => {
    const slug = `help/${unique("faq-")}`;
    const p = (await editor.post("/api/admin/pages").send({ slug, title: "FAQ", body: "## Q\nA with [a link](/help/returns)." }).expect(201)).body;
    await editor.put(`/api/admin/translations/page/${p.id}/me`).send({ title: "Česta pitanja", body: "## P\nO." }).expect(200);
    expect((await request().get(`/api/store/pages/${slug}`).query({ locale: "me" }).expect(200)).body.title).toBe("Česta pitanja");

    // Saving one field leaves the others alone (no defaults on PATCH).
    await editor.patch(`/api/admin/pages/${p.id}`).send({ intro: "Short answers." }).expect(200);
    const after = await db.page.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ isPublished: true, kind: "STANDARD", intro: "Short answers." });

    for (const bad of ["checkout", "p/thing", "admin/x", "a/b/c", "api", "help/../x", "help/ x"]) {
      await editor.post("/api/admin/pages").send({ slug: bad, title: "x" }).expect(422);
    }
    // Capitals are normalised rather than rejected.
    await db.page.deleteMany({ where: { slug: "help/caps" } });
    const caps = (await editor.post("/api/admin/pages").send({ slug: "Help/CAPS-" + unique("x").toUpperCase(), title: "x" }).expect(201)).body;
    expect(caps.slug).toMatch(/^help\/caps-[a-z0-9]+$/);
    await editor.delete(`/api/admin/pages/${caps.id}`).expect(204);
    await editor.post("/api/admin/pages").send({ slug, title: "Duplicate" }).expect(409);
    await orders.post("/api/admin/pages").send({ slug: `help/${unique("x-")}`, title: "x" }).expect(403);
    await editor.delete(`/api/admin/pages/${p.id}`).expect(204);
  });
});

describe("sitemap and launch checklist", () => {
  it("lists only published, indexable content", async () => {
    const s = (await request().get("/api/store/sitemap").expect(200)).body;
    expect(s.pages.map((p: { slug: string }) => p.slug)).toContain("help/privacy");
    const slugs = new Set(s.products.map((p: { slug: string }) => p.slug));
    const drafts = await db.product.findMany({ where: { status: { not: "ACTIVE" } }, select: { slug: true }, take: 50 });
    for (const d of drafts) expect(slugs.has(d.slug)).toBe(false);
  });

  it("reports launch readiness from real data", async () => {
    const c = (await editor.get("/api/admin/dashboard/launch-checklist").expect(200)).body;
    const byKey = Object.fromEntries(c.items.map((i: { key: string; ok: boolean }) => [i.key, i.ok]));
    expect(byKey.mail).toBe(false); // tests run with MAIL_DRIVER=log
    expect(byKey.pages).toBe(false); // seeded pages are drafts
    expect(c.total).toBe(c.items.length);
  });
});
