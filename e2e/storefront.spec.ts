import { expect, test } from "@playwright/test";

test.describe("browsing", () => {
  test("home → category → product, with working navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.getByRole("navigation", { name: /main/i }).getByRole("link", { name: "Women" }).click();
    await expect(page).toHaveURL(/\/c\/women$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Women/);

    const cards = page.locator("main ul li h3 a");
    await expect(cards.first()).toBeVisible();
    const name = (await cards.first().textContent())!.trim();
    await cards.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.locator("main").getByText(/€/).first()).toBeVisible();
  });

  test("sorting and filtering change the URL and the results", async ({ page }) => {
    await page.goto("/c/women");
    await page.getByLabel(/sort/i).selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);
    const prices = await page.locator("main ul li").evaluateAll((lis) =>
      lis.map((li) => Number((li.textContent ?? "").match(/€\s?([\d.,]+)|([\d.,]+)\s?€/)?.slice(1).find(Boolean)?.replace(/\./g, "").replace(",", ".") ?? NaN)).filter((n) => !Number.isNaN(n)),
    );
    expect(prices.length).toBeGreaterThan(1);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  test("search finds products", async ({ page }) => {
    await page.goto("/search?q=coat");
    await expect(page.locator("main ul li").first()).toBeVisible();
    await expect(page.locator("main")).toContainText(/coat/i);
  });

  test("language switch keeps the page and switches the copy", async ({ page }) => {
    await page.goto("/c/women");
    await page.getByRole("group", { name: /language/i }).first().getByRole("link", { name: /Crnogorski|ME/ }).click();
    await expect(page).toHaveURL(/\/me\/c\/women$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn-ME");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Žene/);
    // Choice is remembered on the bare homepage.
    await page.goto("/");
    await expect(page).toHaveURL(/\/me$/);
    await page.context().clearCookies();
  });

  test("information pages and the 404 page", async ({ page }) => {
    await page.goto("/help/shipping");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delivery");
    await expect(page.getByRole("table").first()).toContainText(/Standard/);
    await page.goto("/me/help/returns");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Povraćaj i zamjena");
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.locator("main")).toContainText(/not found/i);
  });
});

test.describe("search engines and security headers", () => {
  test("robots.txt, sitemap and page metadata", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/p/");
    expect(sitemap).toContain('hreflang="sr-ME"');

    const res = await page.goto("/c/women");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/c\/women$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\//);
  });

  test("private pages are not indexable", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
