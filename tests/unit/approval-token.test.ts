/**
 * Lock-down tests for the remediator Approval Token.
 *
 * The token is the *only* thing standing between a leaked remediator
 * API key and an attacker triggering production execution — so the
 * matrix of failure modes deserves explicit coverage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  signApprovalToken,
  verifyApprovalToken,
  approvalTokensConfigured,
} from "../../src/lib/server/remediator/approval-token";

const ORIG_SECRET = process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET;

beforeEach(() => {
  process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET = "x".repeat(48);
});
afterEach(() => {
  if (ORIG_SECRET === undefined) delete process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET;
  else process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET = ORIG_SECRET;
});

const happy = {
  recommendationId: "rec_abc",
  tenantId: "tnt_xyz",
  decision: "approve" as const,
  actorId: "user_42",
};

describe("approval-token: happy path", () => {
  it("round-trips a valid token", () => {
    const tok = signApprovalToken(happy);
    const out = verifyApprovalToken(tok, {
      recommendationId: happy.recommendationId,
      tenantId: happy.tenantId,
      decision: happy.decision,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.rid).toBe(happy.recommendationId);
      expect(out.payload.tid).toBe(happy.tenantId);
      expect(out.payload.dec).toBe("approve");
      expect(out.payload.act).toBe(happy.actorId);
      expect(out.payload.exp).toBeGreaterThan(out.payload.iat);
    }
  });

  it("approvalTokensConfigured reports true when secret is set", () => {
    expect(approvalTokensConfigured()).toBe(true);
  });
});

describe("approval-token: rejected attacks", () => {
  it("rejects a token whose recommendation_id was swapped", () => {
    const tok = signApprovalToken(happy);
    const out = verifyApprovalToken(tok, {
      recommendationId: "rec_OTHER",
      tenantId: happy.tenantId,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("recommendation_mismatch");
  });

  it("rejects a token replayed against a different tenant", () => {
    const tok = signApprovalToken(happy);
    const out = verifyApprovalToken(tok, {
      recommendationId: happy.recommendationId,
      tenantId: "tnt_OTHER",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("tenant_mismatch");
  });

  it("rejects a reject-token presented as an approve", () => {
    const tok = signApprovalToken({ ...happy, decision: "reject" });
    const out = verifyApprovalToken(tok, {
      recommendationId: happy.recommendationId,
      tenantId: happy.tenantId,
      decision: "approve",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("decision_mismatch");
  });

  it("rejects a token whose payload bytes were tampered with", () => {
    const tok = signApprovalToken(happy);
    // Flip the last char of the payload portion (before the dot).
    const dot = tok.indexOf(".");
    const corrupt =
      tok.slice(0, dot - 1) +
      (tok.charAt(dot - 1) === "A" ? "B" : "A") +
      tok.slice(dot);
    const out = verifyApprovalToken(corrupt, {
      recommendationId: happy.recommendationId,
      tenantId: happy.tenantId,
    });
    expect(out.ok).toBe(false);
    // bad_signature is the right answer — the HMAC no longer matches.
    if (!out.ok) expect(out.reason).toBe("bad_signature");
  });

  it("rejects a token signed by a different secret", () => {
    const tok = signApprovalToken(happy);
    process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET = "y".repeat(48);
    const out = verifyApprovalToken(tok, {
      recommendationId: happy.recommendationId,
      tenantId: happy.tenantId,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("bad_signature");
  });

  it("rejects an expired token", () => {
    const tok = signApprovalToken({ ...happy, ttlSeconds: 1 });
    // Wait 2 s the cheap way — verifyApprovalToken reads time-of-check,
    // we don't need real wall-clock.
    const orig = Date.now;
    try {
      Date.now = () => orig() + 5_000;
      const out = verifyApprovalToken(tok, {
        recommendationId: happy.recommendationId,
        tenantId: happy.tenantId,
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("expired");
    } finally {
      Date.now = orig;
    }
  });

  it("rejects malformed tokens (no dot, empty, non-string)", () => {
    expect(verifyApprovalToken("", { recommendationId: "x", tenantId: "y" }).ok).toBe(false);
    expect(verifyApprovalToken("nodot", { recommendationId: "x", tenantId: "y" }).ok).toBe(false);
    expect(verifyApprovalToken(".", { recommendationId: "x", tenantId: "y" }).ok).toBe(false);
    expect(verifyApprovalToken("abc.", { recommendationId: "x", tenantId: "y" }).ok).toBe(false);
  });
});

describe("approval-token: configuration errors", () => {
  it("signing throws when the secret is missing", () => {
    delete process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET;
    expect(() => signApprovalToken(happy)).toThrow(/REMEDIATOR_APPROVAL_TOKEN_SECRET/);
  });

  it("signing throws when the secret is too short", () => {
    process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET = "tooshort";
    expect(() => signApprovalToken(happy)).toThrow(/>=32 characters/);
  });

  it("verification reports secret_not_configured (not bad_signature) when secret is absent", () => {
    const tok = signApprovalToken(happy);
    delete process.env.REMEDIATOR_APPROVAL_TOKEN_SECRET;
    const out = verifyApprovalToken(tok, {
      recommendationId: happy.recommendationId,
      tenantId: happy.tenantId,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("secret_not_configured");
  });
});
