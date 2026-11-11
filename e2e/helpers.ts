import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "", password: process.env.SEED_ADMIN_PASSWORD ?? "" };
export const ADMIN_STATE = "e2e-results/.auth/admin.json";
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Open a product, pick an in-stock size (largest first) and add it to the bag.
 * Product pages may show stock up to a minute old; if a size has just sold out
 * the shop says so and we try the next one, like a shopper would.
 */
export async function addToBag(page: Page, path: string) {
  await page.goto(path);
  const sizes = page.locator("[role=radiogroup][aria-label] button:not([disabled])");
  await expect(sizes.first()).toBeVisible();
  const drawer = page.locator("[aria-labelledby=bag-title]");
  const count = await sizes.count();
  for (let i = count - 1; i >= 0; i--) {
    const size = sizes.nth(i);
    // Retry until the click "takes": a click that lands before React hydrates does nothing.
    await expect(async () => {
      await size.click();
      await expect(size).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.locator("main button.btn-solid").first().click();
    const outcome = await Promise.race([
      drawer.waitFor({ state: "visible", timeout: 10_000 }).then(() => "added" as const),
      page.locator("main").getByRole("alert").filter({ hasText: /sold out|rasprodat/i }).waitFor({ timeout: 10_000 }).then(() => "sold-out" as const),
    ]).catch(() => "timeout" as const);
    if (outcome === "added") return drawer;
    if (outcome === "timeout") break;
  }
  await expect(drawer, `could not add ${path} to the bag`).toBeVisible();
  return drawer;
}

export async function adminLogin(page: Page) {
  if (!ADMIN.email || !ADMIN.password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD for the admin tests");
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Fill the five checkout steps with cash on delivery. Labels come from the visitor's language. */
export async function completeCheckout(page: Page, t: { email?: string; phone: string; first?: string; last?: string; street: string; city: string; postal: string; next: string; place: string; labels: Record<"email" | "phone" | "first" | "last" | "street" | "city" | "postal", string> }) {
  await expect(page.locator("#step-1")).toBeVisible();
  if (t.email) await page.getByLabel(t.labels.email, { exact: true }).fill(t.email);
  await page.getByLabel(t.labels.phone, { exact: true }).fill(t.phone);
  await page.locator("form").getByRole("button", { name: t.next }).first().click();
  if (t.first) await page.getByLabel(t.labels.first, { exact: true }).fill(t.first);
  if (t.last) await page.getByLabel(t.labels.last, { exact: true }).fill(t.last);
  await page.getByLabel(t.labels.street, { exact: true }).fill(t.street);
  await page.getByLabel(t.labels.city, { exact: true }).fill(t.city);
  await page.getByLabel(t.labels.postal, { exact: true }).fill(t.postal);
  await page.locator("form").getByRole("button", { name: t.next }).first().click();
  await page.getByRole("button", { name: t.next }).click(); // delivery
  await page.getByRole("button", { name: t.next }).click(); // payment
  await page.locator("section[aria-labelledby=step-5] input[type=checkbox]").check();
  await page.getByRole("button", { name: t.place }).click();
  await expect(page).toHaveURL(/confirmation\//, { timeout: 20_000 });
  await expect(page.locator("main")).toContainText(/MR-\d{2}-[A-Z0-9]{6}/, { timeout: 15_000 });
  const number = (await page.locator("main").textContent())?.match(/MR-\d{2}-[A-Z0-9]{6}/)?.[0];
  expect(number, "order number on confirmation page").toBeTruthy();
  return number!;
}

export const EN = { next: "Continue", place: "Place order", labels: { email: "E-mail", phone: "Phone", first: "First name", last: "Last name", street: "Street and number", city: "City", postal: "Postal code" } };
export const ME = { next: "Nastavi", place: "Potvrdi porudžbinu", labels: { email: "E-mail", phone: "Telefon", first: "Ime", last: "Prezime", street: "Ulica i broj", city: "Grad", postal: "Poštanski broj" } };
