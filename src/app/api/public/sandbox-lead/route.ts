/**
 * POST /api/public/sandbox-lead
 *
 * Accepts an email address from the demo sandbox page lead-capture widget.
 * Validates the address, sends a brief notification to the sales inbox via
 * Resend, and returns 200. No auth required — rate-limited per IP.
 *
 * Body: { email: string }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkDemoCtaRate, clientIp } from "@/lib/server/rate-limit";
import { jsonError } from "@/lib/server/http/json-error";
import { getOrCreateRequestId } from "@/lib/server/http/request-id";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Simple RFC 5321-safe e-mail pattern — not exhaustive but blocks obvious junk.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);
  const ip = clientIp(request);

  if (!(await checkDemoCtaRate(ip))) {
    return jsonError(429, "rate_limited", "Too many requests.", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body must be JSON.", requestId);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).email !== "string"
  ) {
    return jsonError(400, "missing_email", "email field is required.", requestId);
  }

  const email = ((body as Record<string, unknown>).email as string).trim().toLowerCase();

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return jsonError(400, "invalid_email", "Provide a valid email address.", requestId);
  }

  // Notify the sales inbox — fire-and-forget; never block the response on send failure.
  const salesInbox = process.env.SALES_NOTIFICATION_EMAIL ?? "hello@blackglasssec.com";
  sendEmail({
    to: salesInbox,
    subject: `Demo lead: ${email}`,
    html: `<p>A visitor submitted their email on the live sandbox demo page.</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>IP:</strong> ${ip}</p>
<p>Reply directly or add to your outreach sequence.</p>`,
    text: `Demo lead: ${email}\nIP: ${ip}`,
  }).catch((err) => {
    console.error("[sandbox-lead] notification send failed", err);
  });

  return NextResponse.json(
    { ok: true },
    { headers: { "x-request-id": requestId } },
  );
}
