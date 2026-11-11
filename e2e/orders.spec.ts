import { expect, test } from "@playwright/test";
import { ADMIN_STATE, addToBag, completeCheckout, EN, uid } from "./helpers";

/*
 * The core business journey: a guest buys with cash on delivery, the shop
 * ships it from the admin, and the order moves through its states.
 */
test("guest checkout → admin ships and delivers the order", async ({ page, browser }) => {
  const drawer = await addToBag(page, "/p/double-faced-wool-coat");
  await expect(drawer).toContainText(/€/);
  await drawer.getByRole("link", { name: "Checkout" }).click();

  const email = `e2e-guest-${uid()}@test.local`;
  const number = await completeCheckout(page, { ...EN, email, phone: "+382 67 555 010", first: "Jelena", last: "Vuković", street: "Slobode 45", city: "Podgorica", postal: "81000" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Staff side, in a separate browser session.
  const ctx = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await ctx.newPage();
  await admin.goto(`/admin/orders?q=${number}`);
  await admin.getByRole("link", { name: number }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toContainText(number);
  await expect(admin.locator("main")).toContainText(email);

  await admin.getByLabel("Tracking number").fill(`PCG${uid()}`.toUpperCase());
  await admin.getByRole("button", { name: "Save and mark shipped" }).click();
  await expect(admin.getByText("Shipment saved.")).toBeVisible();
  await expect(admin.locator("main")).toContainText(/Shipped/);

  await admin.getByRole("button", { name: "Mark delivered" }).click();
  await expect(admin.locator("main")).toContainText(/Delivered/);
  await ctx.close();
});

test("a discount code created in the admin works in the bag", async ({ page, browser }) => {
  // Create a one-off 10% code in the admin…
  const code = `E2E${uid()}`.toUpperCase().slice(0, 20);
  const ctx = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await ctx.newPage();
  await admin.goto("/admin/coupons");
  await expect(admin.locator("table")).toBeVisible();
  await admin.getByRole("button", { name: "Add discount code" }).click();
  const form = admin.getByRole("dialog", { name: "New discount code" });
  // Accessible names, not label text: the required-field asterisk is hidden from assistive tech.
  await form.getByRole("textbox", { name: "Code", exact: true }).fill(code);
  await form.getByRole("textbox", { name: "Value", exact: true }).fill("10");
  await form.getByLabel("Also applies to reduced items").check();
  await form.getByRole("button", { name: "Create discount code" }).click();
  await expect(admin.getByText("Discount code created.")).toBeVisible();

  // …and use it in the bag.
  await addToBag(page, "/p/double-faced-wool-coat");
  await page.goto("/bag");
  await page.getByLabel(/discount code/i).fill(code);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("main")).toContainText(code);
  await expect(page.locator("main")).toContainText(/−\s?€|-\s?€|€\s?-/);

  // Clean up: the code was never used in an order, so it can be deleted.
  await admin.reload();
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("row", { name: new RegExp(code) }).getByRole("button", { name: "Delete" }).click();
  await expect(admin.getByRole("row", { name: new RegExp(code) })).toHaveCount(0);
  await ctx.close();
});
