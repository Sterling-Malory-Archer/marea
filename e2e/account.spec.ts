import { expect, test } from "@playwright/test";
import { addToBag, completeCheckout, EN, uid } from "./helpers";

test("register → wishlist → checkout with account → order and address saved", async ({ page }) => {
  const email = `e2e-member-${uid()}@test.local`;
  await page.goto("/account/register");
  await page.locator("main form input[name=firstName]").fill("Ana");
  await page.locator("main form input[name=lastName]").fill("Petrović");
  await page.locator("main form input[name=email]").fill(email);
  await page.locator("main form input[name=password]").fill("Ocean-breeze-2026");
  await page.locator("main form input[name=acceptTerms]").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator("main")).toContainText("Ana");

  // Wishlist survives on the account.
  await page.goto("/p/ribbed-merino-crewneck");
  await page.getByRole("button", { name: /wishlist/i }).first().click();
  await page.goto("/wishlist");
  await expect(page.locator("main")).toContainText(/merino/i);

  await addToBag(page, "/p/minimal-leather-sneakers");
  await page.goto("/checkout");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  const number = await completeCheckout(page, { ...EN, phone: "+382 67 000 333", street: "Bulevar Svetog Petra Cetinjskog 1", city: "Podgorica", postal: "81000" });

  await page.goto("/account/orders");
  await expect(page.locator("main")).toContainText(number);
  await page.goto("/account/addresses");
  await expect(page.locator("main address").first()).toContainText("Podgorica");

  // Sign out → account pages require signing in again.
  await page.goto("/account");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.goto("/account/orders");
  await expect(page).toHaveURL(/\/account\/login/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/account/login");
  await page.locator("main form input[name=email]").fill(`nobody-${uid()}@test.local`);
  await page.locator("main form input[name=password]").fill("Not-the-password-1");
  await page.locator("main").getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(/.+/);
  await expect(page).toHaveURL(/\/account\/login/);
});
