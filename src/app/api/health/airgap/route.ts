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
import { airgapStatus, isAirgapped } from "@/lib/server/airgap";

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

export async function GET() {
  const status = airgapStatus();

  if (!isAirgapped() || !status) {
    return NextResponse.json({
      status: "disabled",
      hint:
        "Set BLACKGLASS_AIRGAPPED=true to short-circuit outbound calls to public SaaS. " +
        "See docs/runbooks/operations.md and src/lib/server/airgap.ts.",
      dispatchers: DISPATCHERS,
    });
  }

  // Sanity check: every dispatcher in the manifest must report
  // honoursAirgap=true. This catches the foot-gun of someone adding
  // a new outbound integration and forgetting to wire in the
  // air-gap filter.
  const unprotected = DISPATCHERS.filter((d) => !d.honoursAirgap);

  return NextResponse.json({
    status: unprotected.length === 0 ? "airgap-active" : "airgap-degraded",
    flag: "BLACKGLASS_AIRGAPPED",
    whitelistedHostPatterns: status.whitelistedHostPatterns,
    dispatchers: DISPATCHERS,
    unprotectedDispatchers: unprotected.map((d) => d.name),
    notes: [
      "Inbound webhooks (Stripe, Clerk) are unaffected — air-gap only applies to outbound calls.",
      "OpenTelemetry exporter is intentionally not gated: OTEL_EXPORTER_OTLP_ENDPOINT is assumed internal.",
      "The Postgres + Redis + Spaces clients connect to operator-configured hosts; the air-gap flag does not gate them.",
    ],
  });
}
