import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, uid } from "./helpers";

test.use({ storageState: ADMIN_STATE });

test("create a product, add sizes and a photo, publish it, see it in the store, then delete it", async ({ page, browser }) => {
  const ref = `E2E-${uid()}`.toUpperCase();
  const title = `E2E Linen Shirt ${ref.slice(-4)}`;

  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill(title);
  await page.getByLabel("Reference").fill(ref);
  await page.getByLabel("Price (incl. VAT)").fill("89");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/\d+/);

  // Sizes & stock: first colour × S, M, L with 4 each.
  const colours = page.getByRole("group", { name: "Colours" });
  await colours.locator("label").first().click();
  const sizes = page.getByRole("group", { name: /^Sizes/ });
  for (const s of ["S", "M", "L"]) await sizes.locator("label", { hasText: new RegExp(`^${s}$`) }).click();
  await page.getByLabel("Starting stock for each").fill("4");
  await page.getByRole("button", { name: "Create 3 variants" }).click();
  await expect(page.getByText("3 variants added")).toBeVisible();

  // Publishing without a photo is refused.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /photo|image/i }).first()).toBeVisible();

  await page.getByRole("tab", { name: /Photos/ }).click();
  await page.locator("#photo-upload").setInputFiles(path.resolve("e2e/fixtures/photo.jpg"));
  await expect(page.getByText("1 photo uploaded.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: "Details" }).click();
  const cat = page.getByLabel("Main category");
  await cat.selectOption({ label: (await cat.locator("option").filter({ hasText: "Shirts" }).first().textContent())! });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published — the product is live/)).toBeVisible();
  const id = page.url().match(/products\/(\d+)/)![1];
  const slug = await page.evaluate(async (pid) => (await (await fetch(`/api/admin/products/${pid}`)).json()).slug, id);

  // Montenegrin name.
  await page.getByRole("tab", { name: "Montenegrin" }).click();
  await page.getByLabel("Product name (Montenegrin)").fill(`E2E lanena košulja ${ref.slice(-4)}`);
  await page.getByRole("button", { name: "Save Montenegrin" }).click();
  await expect(page.getByText("Montenegrin copy saved.")).toBeVisible();

  // Visible to shoppers in both languages (fresh context = not signed in).
  const shopper = await (await browser.newContext()).newPage();
  await shopper.goto(`/p/${slug}`);
  await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(title);
  await shopper.goto(`/me/p/${slug}`);
  await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(`E2E lanena košulja ${ref.slice(-4)}`);
  await shopper.context().close();

  // Clean up (never ordered, so it can be deleted).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
});

test("every admin screen loads for the owner", async ({ page }) => {
  await page.goto("/admin/staff");
  await expect(page.getByRole("heading", { name: "Invite a team member" })).toBeVisible();
  // Every admin page loads without errors for the owner.
  for (const p of ["/admin", "/admin/orders", "/admin/products", "/admin/customers", "/admin/coupons", "/admin/catalogue", "/admin/content", "/admin/shipping", "/admin/settings", "/admin/audit"]) {
    await page.goto(p);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
