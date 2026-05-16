/**
 * Unit tests for the per-tenant webhook signing key plumbing.
 *
 * Focus on the pure pieces that don't require a DB:
 *   - applySignatureHeaders dual-sign behaviour
 *   - SigningKeys threading through buildBodyAndHeaders for the platforms
 *     that opt into signing (asff, sentinel, generic)
 *   - fingerprintSigningKey stability + length
 *
 * Database-bound paths (rotateTenantSigningKey, getSigningKeyStatus) are
 * exercised via the integration suite — covering them here would mean
 * spinning up Postgres which the rest of the unit harness doesn't need.
 */

import { describe, expect, it } from "vitest";
import { __internals } from "@/lib/server/outbound-webhook";
import { fingerprintSigningKey } from "@/lib/server/services/notifications-service";

const { buildBodyAndHeaders, applySignatureHeaders } = __internals;

const SAMPLE_PAYLOAD = {
  event: "drift.detected" as const,
  scanId: "scan-aaa-bbb-ccc",
  hostId: "host-1",
  hostname: "web-01.example.com",
  timestamp: "2026-05-07T10:00:00.000Z",
  findings: [
    {
      id: "f-1",
      category: "privilege_escalation",
      severity: "high",
      title: "New SUID binary detected",
      rationale: "Binary /tmp/x has SUID bit set; not in baseline.",
    },
  ],
};

const EMPTY_CREDS = {
  servicenowAuth: null,
  jiraAuth: null,
  jiraProjectKey: null,
  datadogApiKey: null,
  linearApiKey: null,
  linearTeamId: null,
  githubToken: null,
  splunkHecToken: null,
  awsAccountId: null,
  awsRegion: null,
};

describe("webhook signing keys", () => {
  it("applySignatureHeaders emits both current + previous when both keys set", () => {
    const headers: Record<string, string> = {};
    applySignatureHeaders(headers, "body", "current-key", "previous-key");
    expect(headers["X-Blackglass-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["X-Blackglass-Signature-Previous"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    // The two signatures must differ — different keys produce different hashes.
    expect(headers["X-Blackglass-Signature"]).not.toBe(headers["X-Blackglass-Signature-Previous"]);
  });

  it("applySignatureHeaders emits only current when previous is null", () => {
    const headers: Record<string, string> = {};
    applySignatureHeaders(headers, "body", "current-key", null);
    expect(headers["X-Blackglass-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(headers["X-Blackglass-Signature-Previous"]).toBeUndefined();
  });

  it("applySignatureHeaders emits nothing when no key is set", () => {
    const headers: Record<string, string> = {};
    applySignatureHeaders(headers, "body", null, null);
    expect(headers["X-Blackglass-Signature"]).toBeUndefined();
    expect(headers["X-Blackglass-Signature-Previous"]).toBeUndefined();
  });

  it("buildBodyAndHeaders threads per-tenant key through generic endpoints", () => {
    const { headers } = buildBodyAndHeaders(
      "https://example.com/hook",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
      { current: "tenant-key-aaa", previous: "tenant-key-old" },
    );
    expect(headers["X-Blackglass-Signature"]).toMatch(/^sha256=/);
    expect(headers["X-Blackglass-Signature-Previous"]).toMatch(/^sha256=/);
  });

  it("buildBodyAndHeaders threads keys through ASFF + Sentinel platforms", () => {
    const asff = buildBodyAndHeaders(
      "https://relay.example.com/asff",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
      { current: "k1", previous: null },
    );
    expect(asff.headers["X-Blackglass-Signature"]).toMatch(/^sha256=/);

    const sentinel = buildBodyAndHeaders(
      "https://relay.example.com/cef",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
      { current: "k1", previous: "k0" },
    );
    expect(sentinel.headers["X-Blackglass-Signature"]).toMatch(/^sha256=/);
    expect(sentinel.headers["X-Blackglass-Signature-Previous"]).toMatch(/^sha256=/);
    expect(sentinel.headers["Content-Type"]).toBe("text/plain");
  });

  it("Slack / PagerDuty / native-auth platforms do NOT receive the signature header", () => {
    // Slack uses its own signing model; PagerDuty uses routing keys; both
    // already authenticate the receiver via auth headers / URL secrets.
    const slack = buildBodyAndHeaders(
      "https://hooks.slack.com/services/T/B/X",
      SAMPLE_PAYLOAD,
      null,
      EMPTY_CREDS,
      { current: "k1", previous: null },
    );
    expect(slack.headers["X-Blackglass-Signature"]).toBeUndefined();

    const github = buildBodyAndHeaders(
      "https://api.github.com/repos/acme/blackglass/issues",
      SAMPLE_PAYLOAD,
      null,
      { ...EMPTY_CREDS, githubToken: "ghp_xxx" },
      { current: "k1", previous: null },
    );
    expect(github.headers["X-Blackglass-Signature"]).toBeUndefined();
    expect(github.headers["Authorization"]).toBe("Bearer ghp_xxx");
  });

  it("fingerprintSigningKey returns a stable 16-char hex prefix", () => {
    const fp = fingerprintSigningKey("the-quick-brown-fox");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    // Stable: same input → same fingerprint.
    expect(fingerprintSigningKey("the-quick-brown-fox")).toBe(fp);
    // Different input → different fingerprint.
    expect(fingerprintSigningKey("the-quick-brown-fox.")).not.toBe(fp);
  });
});
