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

  it("allows up to scan POST quota then denies within the window", () => {
    const target = ip(1);
    for (let i = 0; i < 24; i++) expect(checkScanPostRate(target)).toBe(true);
    expect(checkScanPostRate(target)).toBe(false);
  });

  it("isolates quotas per IP for scan POST", () => {
    expect(checkScanPostRate(ip(2))).toBe(true);
    expect(checkScanPostRate(ip(3))).toBe(true);
  });

  it("enforces generous scan poll quota", () => {
    const target = ip(10);
    for (let i = 0; i < 320; i++) expect(checkScanPollRate(target)).toBe(true);
    expect(checkScanPollRate(target)).toBe(false);
  });

  it("allows login quota then denies", () => {
    const target = ip(20);
    for (let i = 0; i < 10; i++) expect(checkLoginRate(target)).toBe(true);
    expect(checkLoginRate(target)).toBe(false);
  });

  it("allows invite quota then denies", () => {
    const target = ip(30);
    for (let i = 0; i < 10; i++) expect(checkInviteRate(target)).toBe(true);
    expect(checkInviteRate(target)).toBe(false);
  });
});
