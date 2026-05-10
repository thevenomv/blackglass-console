import { afterEach, describe, expect, it } from "vitest";
import {
  checkInviteRate,
  checkLoginRate,
  checkScanPostRate,
  checkScanPollRate,
  checkStripeWebhookRate,
  checkClerkWebhookRate,
  checkSaasContextRate,
  checkDemoCtaRate,
  checkGenerateInviteRate,
  checkKeyRotateRate,
  checkToolsCloudWasteReportEmailRate,
  checkToolsCloudWasteReportRate,
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

  it("stripe webhook rate allows up to 120 then denies", async () => {
    const target = ip(40);
    for (let i = 0; i < 120; i++) await expect(checkStripeWebhookRate(target)).resolves.toBe(true);
    await expect(checkStripeWebhookRate(target)).resolves.toBe(false);
  });

  it("clerk webhook rate allows up to 120 then denies", async () => {
    const target = ip(41);
    for (let i = 0; i < 120; i++) await expect(checkClerkWebhookRate(target)).resolves.toBe(true);
    await expect(checkClerkWebhookRate(target)).resolves.toBe(false);
  });

  it("saas context rate allows 60 then denies", async () => {
    const target = ip(42);
    for (let i = 0; i < 60; i++) await expect(checkSaasContextRate(target)).resolves.toBe(true);
    await expect(checkSaasContextRate(target)).resolves.toBe(false);
  });

  it("demo CTA rate allows 5 then denies", async () => {
    const target = ip(43);
    for (let i = 0; i < 5; i++) await expect(checkDemoCtaRate(target)).resolves.toBe(true);
    await expect(checkDemoCtaRate(target)).resolves.toBe(false);
  });

  it("generate invite rate allows 10 then denies", async () => {
    const target = ip(44);
    for (let i = 0; i < 10; i++) await expect(checkGenerateInviteRate(target)).resolves.toBe(true);
    await expect(checkGenerateInviteRate(target)).resolves.toBe(false);
  });

  it("key rotate rate allows 5 then denies", async () => {
    const target = ip(45);
    for (let i = 0; i < 5; i++) await expect(checkKeyRotateRate(target)).resolves.toBe(true);
    await expect(checkKeyRotateRate(target)).resolves.toBe(false);
  });

  it("isolates quotas per IP for new functions", async () => {
    await expect(checkDemoCtaRate(ip(50))).resolves.toBe(true);
    await expect(checkDemoCtaRate(ip(51))).resolves.toBe(true);
  });

  it("tools cloud-waste-report IP rate allows 5 then denies", async () => {
    const target = ip(60);
    for (let i = 0; i < 5; i++) {
      await expect(checkToolsCloudWasteReportRate(target)).resolves.toBe(true);
    }
    await expect(checkToolsCloudWasteReportRate(target)).resolves.toBe(false);
  });

  it("tools cloud-waste-report per-recipient rate allows 1 then denies", async () => {
    // First submission for this address goes through; immediate retry is
    // capped — the whole point of the per-recipient guard.
    await expect(
      checkToolsCloudWasteReportEmailRate("victim@example.com"),
    ).resolves.toBe(true);
    await expect(
      checkToolsCloudWasteReportEmailRate("victim@example.com"),
    ).resolves.toBe(false);
  });

  it("tools cloud-waste-report per-recipient rate normalises case + whitespace", async () => {
    // Case-insensitive + trimmed normalisation closes the trivial bypass
    // where an attacker submits VICTIM@example.com or "  victim@example.com "
    // to dodge the cap.
    await expect(
      checkToolsCloudWasteReportEmailRate("user@example.com"),
    ).resolves.toBe(true);
    await expect(
      checkToolsCloudWasteReportEmailRate("USER@Example.COM"),
    ).resolves.toBe(false);
    await expect(
      checkToolsCloudWasteReportEmailRate("  user@example.com  "),
    ).resolves.toBe(false);
  });

  it("tools cloud-waste-report per-recipient rate isolates distinct addresses", async () => {
    // Different addresses — including plus-addressing variants, which we
    // intentionally do NOT collapse, since a+1@x.com and a@x.com are
    // genuinely different inboxes from a delivery standpoint.
    await expect(
      checkToolsCloudWasteReportEmailRate("alpha@example.com"),
    ).resolves.toBe(true);
    await expect(
      checkToolsCloudWasteReportEmailRate("beta@example.com"),
    ).resolves.toBe(true);
    await expect(
      checkToolsCloudWasteReportEmailRate("alpha+ops@example.com"),
    ).resolves.toBe(true);
  });
});
