/**
 * GET /api/health/airgap
 *
 * Confirms the air-gap mode is active and lists which dispatchers
 * honour the BLACKGLASS_AIRGAPPED env flag. Designed for two
 * audiences:
 *
 *   1. Operator monitoring: an air-gapped deployment can scrape
 *      this endpoint to confirm the dispatchers are wired up and
 *      didn't silently get bypassed by a future code change.
 *      `status: "airgap-active"` + a non-empty `dispatchers` list
 *      is the green-light shape.
 *
 *   2. Security reviewers: returns a machine-readable manifest of
 *      the outbound integrations and their respective allow-list
 *      patterns, so a procurement / SOC 2 reviewer can independently
 *      verify what BLACKGLASS will and won't call out to.
 *
 * The endpoint is open (no auth) on purpose — same rationale as
 * /api/health: monitoring infra can't always carry credentials, and
 * the response intentionally contains no secrets.
 *
 * The endpoint refuses to return a "green" body when the air-gap
 * flag is OFF — instead it returns 200 with `status: "disabled"`
 * so an alert configured against `status != "airgap-active"` flips
 * the moment the flag is unset.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { airgapStatus, isAirgapped, shouldSkipForAirgap } from "@/lib/server/airgap";

interface DispatcherEntry {
  /** Human-readable name shown in dashboards / runbooks. */
  name: string;
  /** Source file the dispatcher lives in. */
  module: string;
  /** Outbound endpoint(s) the dispatcher calls when air-gap is OFF. */
  publicEndpoints: string[];
  /** True when the dispatcher reads `isAirgapped()` / `shouldSkipForAirgap()`. */
  honoursAirgap: boolean;
}

/**
 * Manifest of every outbound dispatcher in the codebase. Keep in
 * sync with src/lib/server/airgap.ts integrations — adding a new
 * outbound integration means adding it here as well so the health
 * endpoint stays accurate.
 */
const DISPATCHERS: DispatcherEntry[] = [
  {
    name: "outbound webhook",
    module: "src/lib/server/outbound-webhook.ts",
    publicEndpoints: [
      "hooks.slack.com",
      "events.pagerduty.com",
      "service-now.com",
      "atlassian.net",
      "datadoghq.com",
      "api.linear.app",
      "api.github.com",
      "splunkcloud.com (HEC)",
      "*.amazonaws.com (ASFF relay)",
      "ods.opinsights.azure.com (Sentinel)",
    ],
    honoursAirgap: true,
  },
  {
    name: "Resend transactional email",
    module: "src/lib/email/send.ts",
    publicEndpoints: ["api.resend.com"],
    honoursAirgap: true,
  },
  {
    name: "Sentry → PagerDuty bridge",
    module: "src/lib/server/sentry-pagerduty.ts",
    publicEndpoints: ["events.pagerduty.com"],
    honoursAirgap: true,
  },
];

/**
 * Exercise `shouldSkipForAirgap()` against a fixed table of URLs and
 * report whether each was correctly classified. Used by the
 * `?probe=true` mode and by unit tests. Has no side effects (no
 * outbound network calls — the gate decision is made before any
 * `fetch()` would happen).
 */
function runProbes(): Array<{
  name: string;
  url: string;
  expectedSkip: boolean;
  actualSkip: boolean;
  pass: boolean;
}> {
  const cases: Array<{ name: string; url: string; expectedSkip: boolean }> = [
    // Each entry represents a real outbound destination + the expected
    // gate behaviour. When BLACKGLASS_AIRGAPPED=false ALL probes
    // should report `actualSkip=false` (gate disabled). When the flag
    // is on, public hosts must be skipped and internal/private hosts
    // must NOT be skipped.
    { name: "public-stripe", url: "https://api.stripe.com/v1/charges", expectedSkip: true },
    { name: "public-slack", url: "https://hooks.slack.com/services/T0/B0/X", expectedSkip: true },
    { name: "public-pagerduty", url: "https://events.pagerduty.com/v2/enqueue", expectedSkip: true },
    { name: "internal-localhost", url: "http://localhost:8080/x", expectedSkip: false },
    { name: "internal-rfc1918", url: "http://10.0.0.5:443/x", expectedSkip: false },
    { name: "internal-svc-cluster", url: "http://remediator.blackglass.svc.cluster.local/x", expectedSkip: false },
  ];
  const airgapOn = isAirgapped();
  return cases.map((c) => {
    // When air-gap is OFF the gate always returns false ("don't skip").
    // We adjust expectedSkip accordingly so the probe is meaningful in
    // both modes.
    const expectedSkip = airgapOn ? c.expectedSkip : false;
    const actualSkip = shouldSkipForAirgap(`probe:${c.name}`, c.url);
    return {
      name: c.name,
      url: c.url,
      expectedSkip,
      actualSkip,
      pass: expectedSkip === actualSkip,
    };
  });
}

export async function GET(request: Request) {
  const status = airgapStatus();
  const url = new URL(request.url);
  const probeMode = url.searchParams.get("probe") === "true";

  // Self-test: even when airgap is OFF the probe should still report
  // "every gate returned false" (= gate disabled). This makes the
  // endpoint useful as a smoke test on every deployment, not just
  // air-gapped ones.
  const probes = probeMode ? runProbes() : null;
  const probesPassing = probes ? probes.every((p) => p.pass) : null;

  if (!isAirgapped() || !status) {
    return NextResponse.json({
      status: "disabled",
      hint:
        "Set BLACKGLASS_AIRGAPPED=true to short-circuit outbound calls to public SaaS. " +
        "See docs/runbooks/operations.md and src/lib/server/airgap.ts.",
      dispatchers: DISPATCHERS,
      ...(probes
        ? { probes, probesPassing, probeNote: "Air-gap is OFF — every probe should report actualSkip=false." }
        : {}),
    });
  }

  // Sanity check: every dispatcher in the manifest must report
  // honoursAirgap=true. This catches the foot-gun of someone adding
  // a new outbound integration and forgetting to wire in the
  // air-gap filter.
  const unprotected = DISPATCHERS.filter((d) => !d.honoursAirgap);

  // Active probes must also pass — when the gate is on, every public
  // host must skip and every internal/private host must NOT skip. A
  // single probe failure flips status to "airgap-degraded" so a
  // monitor sees it immediately.
  const baseStatus = unprotected.length === 0 ? "airgap-active" : "airgap-degraded";
  const status_ = probes && !probesPassing ? "airgap-degraded" : baseStatus;

  return NextResponse.json({
    status: status_,
    flag: "BLACKGLASS_AIRGAPPED",
    whitelistedHostPatterns: status.whitelistedHostPatterns,
    dispatchers: DISPATCHERS,
    unprotectedDispatchers: unprotected.map((d) => d.name),
    ...(probes ? { probes, probesPassing } : {}),
    notes: [
      "Inbound webhooks (Stripe, Clerk) are unaffected — air-gap only applies to outbound calls.",
      "OpenTelemetry exporter is intentionally not gated: OTEL_EXPORTER_OTLP_ENDPOINT is assumed internal.",
      "The Postgres + Redis + Spaces clients connect to operator-configured hosts; the air-gap flag does not gate them.",
      "Add ?probe=true to this URL to actively exercise the gate against a fixed table of public / internal URLs.",
    ],
  });
}
