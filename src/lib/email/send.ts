/**
 * Thin wrapper around Resend for sending transactional and marketing emails.
 *
 * Usage:
 *   import { sendEmail } from "@/lib/email/send";
 *   await sendEmail({ to, subject, html, text });
 *
 * Requires env var: RESEND_API_KEY
 * Optional env var: EMAIL_FROM  (defaults to "BLACKGLASS <noreply@blackglasssec.com>")
 *
 * When RESEND_API_KEY is absent (local dev without email configured) the send
 * is skipped and a warning is logged — it will never throw.
 */

import { Resend } from "resend";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Override the From address for a specific send. */
  from?: string;
  /** Optional Reply-To header. */
  replyTo?: string;
}

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM ?? "BLACKGLASS <noreply@blackglasssec.com>";

export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string; skipped?: boolean }> {
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
  });

  if (error) {
    console.error("[email] Resend error", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return { id: data?.id };
}
