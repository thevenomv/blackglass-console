/**
 * POST /api/admin/test-email
 *
 * Fires every transactional email template — or a single named one —
 * to a target inbox so an operator can validate Resend is configured,
 * the From domain is authenticated (SPF/DKIM/DMARC), templates render
 * cleanly across mail clients, and the messages don't land in spam.
 *
 * This is an OPERATOR safety net, not a customer feature. Auth gate
 * is `secrets.manage` (admin-only) plus a small per-IP rate cap so a
 * compromised admin token can't be turned into a spam cannon.
 *
 * Request body (all optional):
 * {
 *   "to":       "you@example.com",        // defaults to SALES_LEAD_EMAIL or test-fallback
 *   "template": "welcome" | "drift-alert" | "drift-digest"
 *             | "trial-expiring" | "trial-expired" | "all"   // default: "all"
 * }
 *
 * Response:
 * {
 *   "ok": true,
 *   "to": "...",
 *   "results": [
 *     { "template": "welcome",        "ok": true,  "id": "re_..." },
 *     { "template": "drift-alert",    "ok": true,  "id": "re_..." },
 *     ...
 *   ]
 * }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJsonBodyOptional, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { requireSaasOrLegacyPermission } from "@/lib/server/http/saas-access";
import { checkContactSalesRate, clientIp } from "@/lib/server/rate-limit";
import { sendEmail } from "@/lib/email/send";
import {
  welcomeEmailHtml,
  welcomeEmailText,
  trialExpiringEmailHtml,
  trialExpiringEmailText,
  trialExpiredEmailHtml,
  trialExpiredEmailText,
} from "@/lib/email/templates";
import { driftAlertHtml, driftAlertText } from "@/lib/email/templates/drift-alert";
import { driftDigestHtml, driftDigestText } from "@/lib/email/templates/drift-digest";
import { appendAudit, AUDIT_ACTIONS } from "@/lib/server/audit-log";

const TEMPLATE_NAMES = [
  "welcome",
  "drift-alert",
  "drift-digest",
  "trial-expiring",
  "trial-expired",
  "all",
] as const;

const Body = z.object({
  to: z.string().email().max(254).optional(),
  template: z.enum(TEMPLATE_NAMES).optional(),
});

function consoleUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://blackglasssec.com").replace(
    /\/+$/,
    "",
  );
}

interface SendOne {
  template: string;
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

async function sendWelcome(to: string): Promise<SendOne> {
  try {
    const url = consoleUrl();
    const r = await sendEmail({
      to,
      subject: "[Blackglass] Test send — Welcome email",
      html: welcomeEmailHtml({
        firstName: "Jamie",
        orgName: "Acme Security",
        consoleUrl: url,
        trialDays: 14,
      }),
      text: welcomeEmailText({
        firstName: "Jamie",
        orgName: "Acme Security",
        consoleUrl: url,
        trialDays: 14,
      }),
    });
    return { template: "welcome", ok: true, id: r.id, skipped: r.skipped };
  } catch (err) {
    return { template: "welcome", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendDriftAlert(to: string): Promise<SendOne> {
  try {
    const r = await sendEmail({
      to,
      subject: "[Blackglass] Test send — High-severity drift alert",
      html: driftAlertHtml({
        hostname: "web-prod-7.acme.io",
        jobId: "scan-test-0001",
        appUrl: consoleUrl(),
        findings: [
          { title: "Unexpected listening port :8080", category: "network", severity: "high" },
          { title: "Sudoers entry added for `deploy` user", category: "identity", severity: "high" },
          { title: "Disabled UFW firewall", category: "hardening", severity: "high" },
        ],
      }),
      text: driftAlertText({
        hostname: "web-prod-7.acme.io",
        jobId: "scan-test-0001",
        appUrl: consoleUrl(),
        findings: [
          { title: "Unexpected listening port :8080", category: "network", severity: "high" },
          { title: "Sudoers entry added for `deploy` user", category: "identity", severity: "high" },
          { title: "Disabled UFW firewall", category: "hardening", severity: "high" },
        ],
      }),
    });
    return { template: "drift-alert", ok: true, id: r.id, skipped: r.skipped };
  } catch (err) {
    return { template: "drift-alert", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendDriftDigest(to: string): Promise<SendOne> {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const r = await sendEmail({
      to,
      subject: "[Blackglass] Test send — Findings digest (last 7 days)",
      html: driftDigestHtml({
        workspaceName: "Acme Security",
        appUrl: consoleUrl(),
        windowLabel: "last 7 days",
        windowStartIso: start.toISOString(),
        windowEndIso: now.toISOString(),
        totals: { new: 12, high: 3, medium: 6, low: 3, remediated: 7 },
        topCategories: [
          { category: "network", count: 5 },
          { category: "identity", count: 4 },
          { category: "hardening", count: 3 },
        ],
        affectedHosts: 8,
      }),
      text: driftDigestText({
        workspaceName: "Acme Security",
        appUrl: consoleUrl(),
        windowLabel: "last 7 days",
        windowStartIso: start.toISOString(),
        windowEndIso: now.toISOString(),
        totals: { new: 12, high: 3, medium: 6, low: 3, remediated: 7 },
        topCategories: [
          { category: "network", count: 5 },
          { category: "identity", count: 4 },
          { category: "hardening", count: 3 },
        ],
        affectedHosts: 8,
      }),
    });
    return { template: "drift-digest", ok: true, id: r.id, skipped: r.skipped };
  } catch (err) {
    return { template: "drift-digest", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendTrialExpiring(to: string): Promise<SendOne> {
  try {
    const url = consoleUrl();
    const r = await sendEmail({
      to,
      subject: "[Blackglass] Test send — Trial expiring (3 days left)",
      html: trialExpiringEmailHtml({
        firstName: "Jamie",
        orgName: "Acme Security",
        daysLeft: 3,
        consoleUrl: url,
        checkoutUrl: `${url}/pricing`,
      }),
      text: trialExpiringEmailText({
        firstName: "Jamie",
        orgName: "Acme Security",
        daysLeft: 3,
        consoleUrl: url,
        checkoutUrl: `${url}/pricing`,
      }),
    });
    return { template: "trial-expiring", ok: true, id: r.id, skipped: r.skipped };
  } catch (err) {
    return { template: "trial-expiring", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendTrialExpired(to: string): Promise<SendOne> {
  try {
    const url = consoleUrl();
    const r = await sendEmail({
      to,
      subject: "[Blackglass] Test send — Trial expired",
      html: trialExpiredEmailHtml({
        firstName: "Jamie",
        orgName: "Acme Security",
        consoleUrl: url,
        checkoutUrl: `${url}/pricing`,
      }),
      text: trialExpiredEmailText({
        firstName: "Jamie",
        orgName: "Acme Security",
        consoleUrl: url,
        checkoutUrl: `${url}/pricing`,
      }),
    });
    return { template: "trial-expired", ok: true, id: r.id, skipped: r.skipped };
  } catch (err) {
    return { template: "trial-expired", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  // Reuse the contact-sales bucket — same envelope (3 per 10 min) is a
  // sane cap for "operator clicks send-test button" velocity.
  if (!(await checkContactSalesRate(clientIp(request)))) {
    return jsonError(
      429,
      "rate_limited",
      "Too many test-email requests. Wait a few minutes.",
      requestId,
    );
  }

  const auth = await requireSaasOrLegacyPermission("secrets.manage", ["admin"]);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBodyOptional(request, requestId);
  if (!raw.ok) return raw.response;

  const parsed = Body.safeParse(raw.data ?? {});
  if (!parsed.success) return zodErrorResponse(parsed.error, requestId);

  const to =
    parsed.data.to?.trim() ||
    process.env.SALES_LEAD_EMAIL?.trim() ||
    "jamie@obsidiandynamics.co.uk";
  const template = parsed.data.template ?? "all";

  if (!process.env.RESEND_API_KEY?.trim()) {
    return jsonError(
      503,
      "email_not_configured",
      "RESEND_API_KEY is not set on this deployment. Set it in DigitalOcean App Platform " +
        "(or your local .env.local), redeploy, then retry.",
      requestId,
    );
  }

  const senders: Record<string, (to: string) => Promise<SendOne>> = {
    welcome: sendWelcome,
    "drift-alert": sendDriftAlert,
    "drift-digest": sendDriftDigest,
    "trial-expiring": sendTrialExpiring,
    "trial-expired": sendTrialExpired,
  };

  let results: SendOne[];
  if (template === "all") {
    // Sequential, not parallel — gives Resend a clear per-message
    // attribution in their dashboard and avoids triggering their
    // burst rate limit on a fresh API key.
    results = [];
    for (const name of Object.keys(senders)) {
      results.push(await senders[name](to));
    }
  } else {
    results = [await senders[template](to)];
  }

  appendAudit({
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    detail: `Test email send: template=${template} to=${to} ok=${results.filter((r) => r.ok).length}/${results.length}`,
    request_id: requestId,
  });

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    to,
    template,
    results,
    requestId,
  });
}
