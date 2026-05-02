import { afterEach, describe, expect, it } from "vitest";
import {
  checkInviteRate,
  checkLoginRate,
  checkScanPostRate,
  checkScanPollRate,
  resetRateLimitBucketsForTests,
} from "@/lib/server/rate-limit";

afterEach(() => {
  resetRateLimitBucketsForTests();
});

describe("rate-limit", () => {
  const ip = (n: number) => `10.0.0.${n}`;

  it("allows up to scan POST quota then denies within the window", async () => {
    const target = ip(1);
    for (let i = 0; i < 24; i++) await expect(checkScanPostRate(target)).resolves.toBe(true);
    await expect(checkScanPostRate(target)).resolves.toBe(false);
  });

  it("isolates quotas per IP for scan POST", async () => {
    await expect(checkScanPostRate(ip(2))).resolves.toBe(true);
    await expect(checkScanPostRate(ip(3))).resolves.toBe(true);
  });

  it("enforces generous scan poll quota", async () => {
    const target = ip(10);
    for (let i = 0; i < 320; i++) await expect(checkScanPollRate(target)).resolves.toBe(true);
    await expect(checkScanPollRate(target)).resolves.toBe(false);
  });

  it("allows login quota then denies", async () => {
    const target = ip(20);
    for (let i = 0; i < 10; i++) await expect(checkLoginRate(target)).resolves.toBe(true);
    await expect(checkLoginRate(target)).resolves.toBe(false);
  });

  it("allows invite quota then denies", async () => {
    const target = ip(30);
    for (let i = 0; i < 10; i++) await expect(checkInviteRate(target)).resolves.toBe(true);
    await expect(checkInviteRate(target)).resolves.toBe(false);
  });
});
