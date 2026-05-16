import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("invite-tokens", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AUTH_SESSION_SECRET = "unit-test-invite-secret-32bytes!";
    delete process.env.INVITE_SIGNING_SECRET;
    delete process.env.INVITE_TOKENS;
    delete process.env.INVITE_TOKEN_TTL_HOURS;
    delete process.env.AUTH_REQUIRED;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates iv1 token that validates without INVITE_TOKENS", async () => {
    const { generateInviteToken, validateInviteToken } = await import("@/lib/auth/invite-tokens");
    const t = generateInviteToken();
    expect(t.startsWith("iv1.")).toBe(true);
    expect(validateInviteToken(t)).toBe(true);
  });

  it("rejects tampered iv1 token", async () => {
    const { generateInviteToken, validateInviteToken } = await import("@/lib/auth/invite-tokens");
    const t = generateInviteToken();
    const m = /^iv1\.(.+)\.(.+)$/.exec(t);
    expect(m).not.toBeNull();
    const encPayload = m![1]!;
    // Do not flip only the last base64url character — Node's decoder can decode
    // some adjacent strings to the same bytes, so the HMAC can still match.
    const broken = `iv1.${encPayload}.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`;
    expect(validateInviteToken(broken)).toBe(false);
  });

  it("rejects redeemed iv1 token", async () => {
    const { generateInviteToken, validateInviteToken, redeemInviteToken } = await import(
      "@/lib/auth/invite-tokens"
    );
    const t = generateInviteToken();
    expect(validateInviteToken(t)).toBe(true);
    redeemInviteToken(t);
    expect(validateInviteToken(t)).toBe(false);
  });

  it("rejects expired iv1 token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    const { createHmac, randomBytes } = await import("node:crypto");
    const secret = process.env.AUTH_SESSION_SECRET!;
    const exp = Math.floor(Date.now() / 1000) - 60;
    const jti = randomBytes(8).toString("base64url");
    const encPayload = Buffer.from(JSON.stringify({ exp, jti }), "utf8").toString("base64url");
    const sig = createHmac("sha256", secret).update(encPayload).digest("base64url");
    const token = `iv1.${encPayload}.${sig}`;

    const { validateInviteToken } = await import("@/lib/auth/invite-tokens");
    expect(validateInviteToken(token)).toBe(false);
  });

  it("accepts legacy INVITE_TOKENS allowlist tok_* format", async () => {
    const expireSec = Math.floor(Date.now() / 1000) + 3600;
    const expHex = expireSec.toString(16).padStart(10, "0");
    const legacy = `tok_${expHex}_deadbeefdeadbeefdead`;
    process.env.INVITE_TOKENS = legacy;

    const { validateInviteToken } = await import("@/lib/auth/invite-tokens");
    expect(validateInviteToken(legacy)).toBe(true);
  });

  it("getInviteTokenTtlHours respects INVITE_TOKEN_TTL_HOURS", async () => {
    process.env.INVITE_TOKEN_TTL_HOURS = "48";
    const { getInviteTokenTtlHours, generateInviteToken } = await import("@/lib/auth/invite-tokens");
    expect(getInviteTokenTtlHours()).toBe(48);
    const t = generateInviteToken();
    const { validateInviteToken } = await import("@/lib/auth/invite-tokens");
    expect(validateInviteToken(t)).toBe(true);
  });
});
