/**
 * POST /api/v1/webhooks/test
 * Body: { url: string }
 *
 * POSTs a synthetic drift-alert payload to the given URL and returns the
 * delivery status. Used by WebhookSection in Settings to verify an endpoint
 * before going live.
 *
 * Security:
 *   - Requires operator or admin role.
 *   - Rate-limited to 2/min per IP (prevents using server as HTTP relay).
 *   - URL must use HTTPS and must not resolve to a loopback/private address
 *     (enforced by rejecting non-https scheme and known private hostnames).
 */

import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { requireRole } from "@/lib/server/http/auth-guard";
import { checkWebhooksTestRate, clientIp } from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const WebhookTestSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("https://"), "URL must use HTTPS"),
});

/** Rejects private/loopback and cloud-metadata destinations to prevent SSRF. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  // Loopback / unspecified
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  // Cloud instance metadata endpoints
  if (h === "169.254.169.254" || h === "169.254.170.2") return true; // AWS & Azure
  if (h === "metadata.google.internal") return true; // GCP
  // Private IP ranges (RFC 1918)
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

const TEST_PAYLOAD = {
  event: "blackglass.webhook_test",
  sentAt: new Date().toISOString(),
  data: {
    message: "This is a test event from BLACKGLASS. If you see this, your endpoint is reachable.",
  },
};

export async function POST(request: Request) {
  if (!(await checkWebhooksTestRate(clientIp(request)))) {
    return jsonError(429, "rate_limited", "Too many webhook test requests. Wait 60 seconds.");
  }

  const guard = await requireRole(["operator", "admin"]);
  if (!guard.ok) return guard.response;

  let url: string;
  try {
    const body = await request.json();
    const parsed = WebhookTestSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    url = parsed.data.url;
  } catch {
    return jsonError(400, "invalid_json", "Invalid JSON body");
  }

  const { hostname } = new URL(url);
  if (isPrivateHost(hostname)) {
    return jsonError(400, "ssrf_blocked", "URL must not target a private or loopback address.");
  }

  let status: number;
  let ok: boolean;
  const startMs = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Blackglass-Webhook/1.0" },
      body: JSON.stringify({ ...TEST_PAYLOAD, sentAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(8_000),
    });
    status = res.status;
    ok = res.ok;
    console.info(`[webhooks/test] Delivered to ${hostname} in ${Date.now() - startMs}ms — HTTP ${status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhooks/test] Delivery failed to ${hostname} after ${Date.now() - startMs}ms: ${message}`);
    return NextResponse.json({ ok: false, error: "delivery_failed", message }, { status: 502 });
  }

  appendAudit({
    action: AUDIT_ACTIONS.WEBHOOK_TEST_SENT,
    detail: `Webhook test to ${hostname} — HTTP ${status}`,
    actor: guard.role,
  });

  return NextResponse.json({ ok, status });
}
