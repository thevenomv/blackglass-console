import { defineConfig, devices } from "@playwright/test";

/**
 * Local: dedicated port so `next dev` on :3000 does not collide with Playwright's webServer.
 * Remote: set PLAYWRIGHT_BASE_URL (e.g. same origin as STAGING_URL) to hit a deployed env.
 *
 * Clerk: the web server clears Clerk publishable/secret keys unless `PLAYWRIGHT_CLERK=1` so local
 * `.env.local` cannot half-enable SaaS mode during default E2E (500s without DB). Live Clerk E2E
 * uses `PLAYWRIGHT_CLERK_LIVE` in `clerk-saas.spec.ts` against a real deployment / prepared env.
 */
const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3100";
const e2eOrigin =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? `http://127.0.0.1:${e2ePort}`;
const e2eLocal = !process.env.PLAYWRIGHT_BASE_URL?.trim();
/** Next 16 + Turbopack first boot can exceed 2m on cold CI — keep headroom. */

/** Strip Clerk from the Playwright dev server unless explicitly testing Clerk (avoids 500s when .env.local has keys but no DB). */
function e2eWebServerEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env };
  base.NEXT_PUBLIC_APP_URL = e2eOrigin;
  base.NEXT_PUBLIC_USE_MOCK = process.env.PLAYWRIGHT_LIVE === "1" ? "false" : "true";
  if (process.env.PLAYWRIGHT_CLERK !== "1") {
    base.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "";
    base.CLERK_SECRET_KEY = "";
  }
  return base;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: e2eOrigin,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: e2eLocal
    ? {
        command: `npm run dev -- -p ${e2ePort}`,
        url: `${e2eOrigin}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: e2eWebServerEnv(),
      }
    : undefined,
});
