import { expect, test } from "@playwright/test";
import { addToBag, completeCheckout, ME, uid } from "./helpers";

test("Montenegrin checkout on a phone", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("button", { name: /meni|menu/i }).click();
  await expect(page.getByRole("navigation", { name: /meni|menu/i })).toBeVisible();

  const drawer = await addToBag(page, "/me/p/ribbed-merino-crewneck");
  await drawer.getByRole("link", { name: "Završi kupovinu" }).click();
  const number = await completeCheckout(page, { ...ME, email: `e2e-me-${uid()}@test.local`, phone: "+382 69 111 222", first: "Marko", last: "Đukanović", street: "Obala bb", city: "Budva", postal: "85310" });
  await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn-ME");
  await expect(page.locator("main")).toContainText(number);
});
