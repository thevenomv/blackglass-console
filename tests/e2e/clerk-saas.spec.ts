import { test, expect } from "@playwright/test";

const clerkLive = !!process.env.PLAYWRIGHT_CLERK_LIVE?.trim();

test.describe("Clerk SaaS (live)", () => {
  test.skip(!clerkLive, "Set PLAYWRIGHT_CLERK_LIVE=1 and Clerk test credentials to run.");

  test("placeholder — invite flow", async () => {
    // Production E2E:
    // 1. Sign in once with a test Clerk user; save storageState to tests/e2e/.auth/clerk.json (gitignored).
    // 2. In playwright.config, projects: { use: { storageState: 'tests/e2e/.auth/clerk.json' } }
    // 3. Cover: select-workspace → members invite → accept invitation email (or Clerk testing token).
    expect(clerkLive).toBe(true);
  });
});
