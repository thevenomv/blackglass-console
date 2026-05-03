import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const clerkLive = !!process.env.PLAYWRIGHT_CLERK_LIVE?.trim();

// Path where Clerk session state is persisted across tests
const CLERK_AUTH_FILE = path.join(__dirname, ".auth", "clerk.json");

/**
 * Global setup: obtain a Clerk session using a Clerk Testing Token.
 *
 * Requires environment variables:
 *   PLAYWRIGHT_CLERK_TEST_EMAIL — test account email
 *   PLAYWRIGHT_CLERK_TEST_PASSWORD — test account password
 *   PLAYWRIGHT_BASE_URL — base URL of the running app (e.g. http://localhost:3000)
 *
 * This runs once before the Clerk SaaS suite. It navigates to the sign-in page,
 * submits credentials, and saves the browser's storage state (cookies + local
 * storage) to CLERK_AUTH_FILE for reuse across tests.
 */
async function clerkSignIn(page: Page): Promise<void> {
  const email = process.env.PLAYWRIGHT_CLERK_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_CLERK_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set PLAYWRIGHT_CLERK_TEST_EMAIL and PLAYWRIGHT_CLERK_TEST_PASSWORD to run Clerk live tests."
    );
  }

  await page.goto("/sign-in");
  // Clerk's hosted UI — fill email first, then continue to password step
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /continue|sign in/i }).click();

  // Wait until redirect to the app shell (dashboard or workspace)
  await page.waitForURL(/\/(dashboard|workspace|select-org)/, { timeout: 15_000 });

  // Persist session so other tests can reuse it
  const authDir = path.dirname(CLERK_AUTH_FILE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: CLERK_AUTH_FILE });
}

test.describe("Clerk SaaS (live)", () => {
  test.skip(!clerkLive, "Set PLAYWRIGHT_CLERK_LIVE=1 and Clerk test credentials to run.");

  test.beforeAll(async ({ browser }) => {
    // Sign in once and persist the auth state for all tests in this suite
    if (!fs.existsSync(CLERK_AUTH_FILE)) {
      const page = await browser.newPage();
      await clerkSignIn(page);
      await page.close();
    }
  });

  test.use({
    storageState: CLERK_AUTH_FILE,
  });

  test("authenticated user lands on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Fleet dashboard" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("authenticated user can view members page", async ({ page }) => {
    await page.goto("/settings/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible({ timeout: 10_000 });
  });

  test("authenticated user sees their org in the switcher", async ({ page }) => {
    await page.goto("/dashboard");
    // OrganizationSwitcher renders the current org name
    await expect(page.locator("[data-clerk-org-switcher]").first()).toBeVisible({ timeout: 8_000 });
  });

  test("unauthenticated request to dashboard redirects to sign-in", async ({ browser }) => {
    // Use a fresh context with no stored auth to simulate an anonymous visitor
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });
});

