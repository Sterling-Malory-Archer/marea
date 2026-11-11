import { test as setup } from "@playwright/test";
import { ADMIN_STATE, adminLogin } from "./helpers";

// Sign in to the admin once through the real login form and reuse the session,
// so the suite doesn't trip the sign-in rate limit (20 attempts per 15 minutes).
setup("admin sign-in", async ({ page }) => {
  await adminLogin(page);
  await page.context().storageState({ path: ADMIN_STATE });
});
