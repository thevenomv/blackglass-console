/**
 * POST /api/contact-sales
 *
 * Public lead-intake endpoint for the Enterprise tier. Accepts a small
 * structured payload, applies basic validation + rate-limiting, then
 * fans the lead out to (a) Slack #sales (when SLACK_SALES_WEBHOOK_URL
 * is set), (b) email to SALES_LEAD_EMAIL (defaults to the marketing inbox
 * from `getDefaultSalesInboxEmail()` / NEXT_PUBLIC_MARKETING_CONTACT_EMAIL)
 * via Resend, and (c) the audit log so
 * leads survive the email/webhook hops.
 *
 * Why a server endpoint vs mailto: this keeps the lead in our
 * audit trail, lets us add CRM integrations later without
 * touching the page, and avoids the "user opens an empty mail
 * client" UX disaster that drops ~50% of would-be leads.
 *
 * Why public (no auth): enterprise prospects shouldn't need to sign up
 * just to talk to sales. The contact-sales rate limiter protects
 * against scraper / spam bursts.
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { getDefaultSalesInboxEmail } from "@/lib/marketing/contact";
import { appendAudit, AUDIT_ACTIONS, formatAuditDetail } from "@/lib/server/audit-log";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { checkContactSalesRate, clientIp } from "@/lib/server/rate-limit";
import { escHtml } from "@/lib/email/templates/base";

export const dynamic = "force-dynamic";

const MAX_FIELD_LEN = 2_000;

interface ContactSalesPayload {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  hostCount?: unknown;
  useCase?: unknown;
  message?: unknown;
  /** Honeypot — real browsers leave it blank; bots fill it. */
  website?: unknown;
}

function isValidEmail(s: string): boolean {
  // Pragmatic regex — good enough for "is this user typing on
  // purpose"; full RFC 5322 validation belongs in the email
  // provider, not here.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

function trimStr(v: unknown, max: number = MAX_FIELD_LEN): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);

  if (!(await checkContactSalesRate(ip))) {
    return jsonError(
      429,
      "rate_limited",
      `Too many enquiries from this IP. Please retry in a few minutes or email ${getDefaultSalesInboxEmail()} directly.`,
      requestId,
    );
  }

  let payload: ContactSalesPayload;
  try {
    payload = (await request.json()) as ContactSalesPayload;
  } catch {
    return jsonError(400, "invalid_json", "Body must be JSON.", requestId);
  }

  // Honeypot — silently accept-and-drop bot submissions. We return 200
  // so the bot thinks it succeeded and stops retrying.
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    console.info("[contact-sales] honeypot trip from ip=" + ip);
    return NextResponse.json({ ok: true });
  }

  const name = trimStr(payload.name, 200);
  const email = trimStr(payload.email, 254).toLowerCase();
  const company = trimStr(payload.company, 200);
  const hostCount = trimStr(payload.hostCount, 50);
  const useCase = trimStr(payload.useCase, 200);
  const message = trimStr(payload.message, MAX_FIELD_LEN);

  if (!name || !company || !isValidEmail(email)) {
    return jsonError(
      400,
      "invalid_payload",
      "Name, company, and a valid email are required.",
      requestId,
    );
  }

  const salesEmail = process.env.SALES_LEAD_EMAIL?.trim() || getDefaultSalesInboxEmail();
  const slackUrl = process.env.SLACK_SALES_WEBHOOK_URL?.trim() || process.env.SLACK_ALERT_WEBHOOK_URL?.trim();

  // Audit-log the lead first — we never want a lead to be lost just
  // because Slack or Resend are flaky. This is the source of truth.
  // formatAuditDetail JSON-escapes every value so a hostile field
  // (e.g. company name with embedded quotes / newlines / ANSI escapes)
  // can't break the log grammar or corrupt operator terminals.
  appendAudit({
    action: AUDIT_ACTIONS.CONTACT_SALES_LEAD,
    detail: formatAuditDetail({ name, email, company, hosts: hostCount, usecase: useCase }),
    request_id: requestId,
  });

  // Fan-out: Slack first (operator-facing, fast), then email
  // (durable, replies route back to the prospect via Reply-To).
  // Both are best-effort — failures are logged but don't fail the
  // request, otherwise a flaky webhook would drop the lead.
  if (slackUrl) {
    // Use Block Kit `plain_text` blocks instead of `text` (mrkdwn). User-
    // controlled fields (name, email, company, useCase, message) would
    // otherwise be parsed for Slack markup — `<!channel>`, `*bold*`,
    // `<url|text>`, etc. — which a hostile submitter could weaponise to
    // ping the whole sales channel or rewrite the message content. The
    // top-level `text` is set to a static notification fallback that
    // contains no user input.
    const blocks: unknown[] = [
      {
        type: "section",
        text: { type: "plain_text", emoji: true, text: `:wave: New Enterprise lead — ${name}` },
      },
      {
        type: "section",
        fields: [
          { type: "plain_text", text: `Email: ${email}` },
          { type: "plain_text", text: `Company: ${company}` },
          { type: "plain_text", text: `Fleet size: ${hostCount || "(not provided)"}` },
          { type: "plain_text", text: `Use case: ${useCase || "(not provided)"}` },
        ],
      },
    ];
    if (message) {
      // plain_text blocks render the message verbatim — no link unfurling,
      // no @mentions, no embedded mrkdwn. Slack truncates plain_text at
      // ~3000 chars per block; our trimStr cap (2000) keeps us comfortably
      // under that ceiling.
      blocks.push({
        type: "section",
        text: { type: "plain_text", text: `Message:\n${message}` },
      });
    }
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "New Enterprise lead",
          blocks,
        }),
      });
    } catch (err) {
      console.error("[contact-sales] Slack fan-out failed:", err);
    }
  }

  try {
    await sendEmail({
      to: salesEmail,
      replyTo: email,
      subject: `Enterprise lead — ${company} (${hostCount || "?"} hosts)`,
      html: `
        <h2>New Enterprise enquiry</h2>
        <p><strong>From:</strong> ${escHtml(name)} &lt;${escHtml(email)}&gt;<br/>
        <strong>Company:</strong> ${escHtml(company)}<br/>
        <strong>Fleet size:</strong> ${escHtml(hostCount) || "(not provided)"}<br/>
        <strong>Use case:</strong> ${escHtml(useCase) || "(not provided)"}</p>
        ${message ? `<p><strong>Message:</strong></p><blockquote>${escHtml(message).replace(/\n/g, "<br/>")}</blockquote>` : ""}
        <hr/>
        <p style="color:#64748b;font-size:12px">request_id=${escHtml(requestId)} ip=${escHtml(ip)}</p>
      `,
      text:
        `New Enterprise enquiry\n\n` +
        `From: ${name} <${email}>\n` +
        `Company: ${company}\n` +
        `Fleet size: ${hostCount || "(not provided)"}\n` +
        `Use case: ${useCase || "(not provided)"}\n\n` +
        (message ? `Message:\n${message}\n\n` : "") +
        `request_id=${requestId} ip=${ip}\n`,
    });
  } catch (err) {
    console.error("[contact-sales] Email send failed:", err);
  }

  return NextResponse.json(
    { ok: true, requestId },
    { headers: { "x-request-id": requestId } },
  );
}
