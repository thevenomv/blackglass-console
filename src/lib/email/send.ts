/**
 * Thin wrapper around Resend for sending transactional and marketing emails.
 *
 * Usage:
 *   import { sendEmail } from "@/lib/email/send";
 *   await sendEmail({ to, subject, html, text });
 *
 * Requires env var: RESEND_API_KEY
 * Optional env var: EMAIL_FROM  (defaults to "Blackglass <noreply@blackglasssec.com>")
 *
 * When RESEND_API_KEY is absent (local dev without email configured) the send
 * is skipped and a warning is logged — it will never throw.
 */

import { Resend } from "resend";
import { isAirgapped } from "@/lib/server/airgap";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Override the From address for a specific send. */
  from?: string;
  /** Optional Reply-To header. */
  replyTo?: string;
  /** Optional extra headers (e.g. List-Unsubscribe for marketing sends). */
  headers?: Record<string, string>;
}

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM ?? "Blackglass <noreply@blackglasssec.com>";

export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string; skipped?: boolean }> {
  // Resend is a public-internet SaaS; air-gapped deployments must use
  // a self-hosted SMTP relay (configure your own bridge instead of
  // calling sendEmail directly).
  if (isAirgapped()) {
    console.info("[email] BLACKGLASS_AIRGAPPED is on — skipping Resend send to", opts.to);
    return { skipped: true };
  }

  const resend = getResend();

  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", opts.to);
    return { skipped: true };
  }

  const { data, error } = await resend.emails.send({
    from: opts.from ?? DEFAULT_FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    ...(opts.headers && Object.keys(opts.headers).length ? { headers: opts.headers } : {}),
  });

  if (error) {
    console.error("[email] Resend error", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return { id: data?.id };
}
