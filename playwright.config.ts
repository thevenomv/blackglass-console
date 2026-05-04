import { defineConfig, devices } from "@playwright/test";

/**
 * Local: dedicated port so `next dev` on :3000 does not collide with Playwright's webServer.
 * Remote: set PLAYWRIGHT_BASE_URL (e.g. same origin as STAGING_URL) to hit a deployed env.
 */
const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3100";
const e2eOrigin =
  process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? `http://127.0.0.1:${e2ePort}`;
const e2eLocal = !process.env.PLAYWRIGHT_BASE_URL?.trim();
/** Next 16 + Turbopack first boot can exceed 2m on cold CI — keep headroom. */

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
        env: {
          NEXT_PUBLIC_APP_URL: e2eOrigin,
          NEXT_PUBLIC_USE_MOCK: process.env.PLAYWRIGHT_LIVE === "1" ? "false" : "true",
        },
      }
    : undefined,
});
