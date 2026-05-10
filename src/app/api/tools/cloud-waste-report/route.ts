/**
 * POST /api/tools/cloud-waste-report
 *
 * Optional emailed report behind the free Cloud Waste Estimator on
 * `/tools/cloud-waste-estimator`. Public and anonymous — the estimator
 * itself runs entirely client-side; this endpoint exists only when a user
 * asks us to mail them the same numbers they already see on screen.
 *
 * Accepted payload:
 *   - email (required, validated)
 *   - org   (optional)
 *   - providers, totals, riskBand — same summary the user already sees
 *
 * Intentionally rejects anything resembling real infrastructure (resource
 * ids, hostnames, regions). The estimator never asks for those, so there
 * is no legitimate reason for them to appear here.
 *
 * Side effects:
 *   - audit-log the request (durable record of who asked)
 *   - send a templated email to the requester via Resend (best-effort —
 *     when RESEND_API_KEY is unset the send is skipped silently)
 *   - notify Slack via SLACK_TOOLS_LEAD_WEBHOOK_URL (optional)
 *
 * Operator lookup
 * ---------------
 * These rows land in the **process-global** audit store (file/Postgres/
 * Spaces via `appendAudit()`), NOT `saas_audit_events`, because the free
 * tools area is intentionally tenant-less. Operators can find them via:
 *
 *   - GET /api/v1/audit/events?action=tools.cloud_waste (admin/operator)
 *   - the daily Spaces export (`npm run audit:export-spaces`)
 *   - direct Postgres query against the process-global audit table
 *
 * The tenant Audit Log UI also has a "Free tools" quick-filter chip ready
 * for when any tool action becomes tenant-scoped in future.
 *
 * Privacy / retention obligation
 * ------------------------------
 * The audit row stores the requester's email and optional org name in
 * clear text — needed for legitimate follow-up. Lawful basis is consent
 * (form submission). GDPR Art. 5(e) requires a defined retention window:
 * any persistent audit sink (file / Postgres / Spaces) MUST have a
 * lifecycle policy applied by the operator. See `docs/audit-trail.md`
 * → "PII in process-global audit rows" for the full retention matrix
 * and right-to-erasure path.
 *
 * Abuse defences (in order of evaluation)
 * ---------------------------------------
 *   1. Per-IP rate limit (5 / 10 min)
 *   2. Honeypot field — silent 200 OK on trip
 *   3. Per-recipient rate limit (1 / email / 24h, SHA-256-keyed) —
 *      defends against IP-rotation mail-bombing of a chosen victim;
 *      silent 200 OK on hit so attackers can't probe whether a victim
 *      has been mailed recently.
 *   4. Sanity cap on totals before email render.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { appendAudit, AUDIT_ACTIONS, formatAuditDetail } from "@/lib/server/audit-log";
import { jsonError, zodErrorResponse } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import {
  checkToolsCloudWasteReportEmailRate,
  checkToolsCloudWasteReportRate,
  clientIp,
} from "@/lib/server/rate-limit";
import { baseLayout, ctaButton, escHtml, h1, p, small } from "@/lib/email/templates/base";
import { formatUsd } from "@/lib/tools/cloud-waste/estimator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ProviderSlug = z.enum(["do", "aws", "gcp"]);
const RiskBand = z.enum(["low", "medium", "high"]);

const PayloadSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  org: z.string().trim().max(200).optional().default(""),
  providers: z.array(ProviderSlug).min(1).max(3),
  totals: z.object({
    point: z.number().finite().min(0).max(10_000_000),
    low: z.number().finite().min(0).max(10_000_000),
    high: z.number().finite().min(0).max(10_000_000),
  }),
  riskBand: RiskBand,
  /** Honeypot — real browsers leave it blank. */
  website: z.string().optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

const PROVIDER_LABEL: Record<Payload["providers"][number], string> = {
  do: "DigitalOcean",
  aws: "AWS",
  gcp: "Google Cloud",
};

function renderEmailHtml(payload: Payload): string {
  const range = `${formatUsd(payload.totals.low)}–${formatUsd(payload.totals.high)}/mo`;
  const providers = payload.providers.map((s) => PROVIDER_LABEL[s]).join(", ");
  const body = `
    ${h1("Your cloud waste estimate")}
    ${p(`Thanks for trying the Blackglass Cloud Waste Estimator. Here are the numbers from your session:`)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="margin:8px 0 24px;border:1px solid #e2e8f0;border-radius:6px;">
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          Estimated monthly waste
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;text-align:right;font-weight:600;">
          ${escHtml(range)}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          Risk band
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;text-align:right;text-transform:uppercase;letter-spacing:0.05em;">
          ${escHtml(payload.riskBand)}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;font-size:12px;color:#64748b;">
          Providers
        </td>
        <td style="padding:14px 16px;font-size:14px;color:#0f172a;text-align:right;">
          ${escHtml(providers)}
        </td>
      </tr>
    </table>
    ${p(`Cleanup checklist:`)}
    <ol style="margin:0 0 24px;padding-left:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#475569;line-height:1.7;">
      <li>Review instances with no recent traffic or login activity and confirm with their owner before shutting down.</li>
      <li>Audit unattached volumes — for each, take a final snapshot, label why it existed, then delete on a delay.</li>
      <li>Sweep snapshots older than 90 days. Keep one per critical workload as a recovery point and remove the rest after sign-off.</li>
      <li>Tag everything you keep — environment, owner, expiry — so the next sweep takes minutes.</li>
      <li>Schedule the sweep monthly. Cloud waste creeps back in faster than most teams expect.</li>
    </ol>
    ${p(`When you want this run continuously with approval-gated cleanup, that's <strong>Charon</strong> — the cloud-hygiene piece of Blackglass. If you'd like to see the operator console first, you can explore a fully populated sample workspace without connecting anything.`)}
    ${ctaButton("Explore a sample workspace", "https://blackglasssec.com/demo?source=tools-cloud-waste-estimator-email")}
    <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#475569;line-height:1.6;">
      Or jump straight to <a href="https://blackglasssec.com/product#charon" style="color:#2563eb;text-decoration:underline;">Charon in Blackglass</a>.
    </p>
    ${small(`This estimate uses public list prices and conservative recovery assumptions — directionally useful, not authoritative. Real bills depend on instance type, region, reservations, and savings plans an estimator can't see. Always confirm with the owning team before deleting infrastructure.`)}
  `;
  return baseLayout({
    subject: "Your Blackglass cloud waste estimate",
    preheader: `Estimated monthly waste: ${range} (${payload.riskBand})`,
    body,
  });
}

function renderEmailText(payload: Payload): string {
  const range = `${formatUsd(payload.totals.low)}-${formatUsd(payload.totals.high)}/mo`;
  const providers = payload.providers.map((s) => PROVIDER_LABEL[s]).join(", ");
  return [
    "Your Blackglass cloud waste estimate",
    "",
    `Estimated monthly waste: ${range}`,
    `Risk band: ${payload.riskBand.toUpperCase()}`,
    `Providers: ${providers}`,
    "",
    "Cleanup checklist:",
    "1. Review instances with no recent traffic or login activity.",
    "2. Audit unattached volumes; snapshot before deleting.",
    "3. Sweep snapshots older than 90 days after backup sign-off.",
    "4. Tag everything you keep so the next sweep is fast.",
    "5. Schedule the sweep monthly.",
    "",
    "When you want this run continuously with approval-gated cleanup,",
    "that's Charon — the cloud-hygiene piece of Blackglass.",
    "",
    "Explore a sample workspace first:",
    "  https://blackglasssec.com/demo?source=tools-cloud-waste-estimator-email",
    "",
    "Or jump to Charon:",
    "  https://blackglasssec.com/product#charon",
    "",
    "Directionally useful, not authoritative — public list-price estimates only.",
    "Always confirm with the owning team before deleting infrastructure.",
  ].join("\n");
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);

  if (!(await checkToolsCloudWasteReportRate(ip))) {
    return jsonError(
      429,
      "rate_limited",
      "Too many requests from this IP. Try again in a few minutes.",
      requestId,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Body must be JSON.", requestId);
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, requestId);
  }
  const payload = parsed.data;

  // Honeypot: succeed silently so bots stop retrying. We do NOT
  // audit-log honeypot trips by email — we just count them.
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    console.info("[tools/cloud-waste-report] honeypot trip from ip=" + ip);
    return NextResponse.json({ ok: true });
  }

  // Per-recipient rate limit — defends against the IP-rotation mail-bomb
  // path that the per-IP guard above can't cover. 1 per email per 24h.
  //
  // CRITICAL: respond with 200 OK on a hit, not 429. A 429 would let an
  // attacker probe which addresses our system has recently mailed (turning
  // the endpoint into a "did victim@example.com submit the form recently?"
  // oracle). 200 OK with the request short-circuited gives identical
  // observable behaviour for legitimate-but-duplicate submissions and
  // mail-bomb attempts.
  if (!(await checkToolsCloudWasteReportEmailRate(payload.email))) {
    console.info("[tools/cloud-waste-report] per-recipient cap hit (24h)");
    return NextResponse.json({ ok: true, requestId }, { headers: { "x-request-id": requestId } });
  }

  // Sanity bound on totals — a six-figure estimate from public counts is
  // almost certainly someone abusing the form. Cap to avoid emailing
  // alarming nonsense.
  const cappedHigh = Math.min(payload.totals.high, 5_000_000);

  appendAudit({
    action: AUDIT_ACTIONS.TOOLS_CLOUD_WASTE_REPORT_REQUESTED,
    detail: formatAuditDetail({
      email: payload.email,
      org: payload.org ?? "",
      providers: payload.providers.join(","),
      range_usd_low: Math.round(payload.totals.low),
      range_usd_high: Math.round(cappedHigh),
      band: payload.riskBand,
    }),
    request_id: requestId,
  });

  const slackUrl = process.env.SLACK_TOOLS_LEAD_WEBHOOK_URL?.trim();
  if (slackUrl) {
    // Use Block Kit `plain_text` blocks instead of `text` (mrkdwn). User-
    // controlled fields (email, org) would otherwise be parsed for Slack
    // markup — `<!channel>`, `*bold*`, `<url|text>`, etc. — which an
    // attacker submitting a malicious org name could weaponise to ping
    // the whole sales channel or rewrite the message.
    //
    // `plain_text` blocks render verbatim, no parsing, no link unfurling.
    // The `text` field at the top level is required by Slack as a
    // notification fallback; we set it to a short, fully-static string
    // (no user input) so notifications stay safe too.
    const blocks = [
      {
        type: "section",
        text: {
          type: "plain_text",
          emoji: true,
          text: `:bar_chart: Cloud waste estimate sent — ${payload.email}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "plain_text", text: `Org: ${payload.org || "(not provided)"}` },
          { type: "plain_text", text: `Providers: ${payload.providers.join(", ")}` },
          {
            type: "plain_text",
            text: `Range: ${formatUsd(payload.totals.low)}–${formatUsd(cappedHigh)}/mo`,
          },
          { type: "plain_text", text: `Band: ${payload.riskBand.toUpperCase()}` },
        ],
      },
    ];
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Static fallback — no user input, safe under any rendering mode.
          text: "Cloud waste estimate sent (free tools)",
          blocks,
        }),
      });
    } catch (err) {
      console.error("[tools/cloud-waste-report] Slack fan-out failed:", err);
    }
  }

  try {
    await sendEmail({
      to: payload.email,
      subject: "Your Blackglass cloud waste estimate",
      html: renderEmailHtml({ ...payload, totals: { ...payload.totals, high: cappedHigh } }),
      text: renderEmailText({ ...payload, totals: { ...payload.totals, high: cappedHigh } }),
    });
  } catch (err) {
    // Don't 500 the user — they care that the audit-logged request
    // succeeded; email delivery is best-effort.
    console.error("[tools/cloud-waste-report] email send failed:", err);
  }

  return NextResponse.json(
    { ok: true, requestId },
    { headers: { "x-request-id": requestId } },
  );
}
