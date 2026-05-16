#!/usr/bin/env node
/**
 * Send a single **opt-in / warm** marketing-style message via Resend (one recipient).
 *
 * Use when someone asked for information, met you at an event, or otherwise
 * consented — not for unsolicited bulk cold email. For cold sequences from
 * scraped lists, use Apollo + a dedicated mailbox instead (see
 * docs/sales/apollo-cold-email-sequences.md) so product DKIM/SPF on
 * noreply@ stays clean.
 *
 * Usage:
 *   npm run email:marketing -- --to=prospect@company.com --first-name=Alex
 *
 * Env:
 *   RESEND_API_KEY              — required
 *   EMAIL_MARKETING_FROM        — optional; defaults to EMAIL_FROM or product default
 *   EMAIL_MARKETING_REPLY_TO    — optional Reply-To (your real inbox)
 *   EMAIL_LIST_UNSUBSCRIBE_URL  — optional https URL; when set, adds List-Unsubscribe headers
 *   NEXT_PUBLIC_APP_URL         — optional; used in CTA links
 *
 * Loads `.env.local` the same way as send-test-emails.mjs when RESEND_API_KEY is unset.
 */
import process from "node:process";
import { spawnSync } from "node:child_process";

// Keep in sync with src/lib/email/templates/base.ts (COMPANY_FOOTER_LINE).
const COMPANY_FOOTER_LINE =
  "Blackglass is a product of Obsidian Dynamics Limited (Co. No. 16663833) · " +
  "Lytchett House, 13 Freeland Park, Wareham Road, Poole, Dorset BH16 6FA, United Kingdom";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadDotenvLocal() {
  const dotenv = spawnSync(
    process.execPath,
    ["-e", "require('dotenv').config({ path: '.env.local' }); process.stdout.write(JSON.stringify(process.env));"],
    { encoding: "utf8" },
  );
  if (dotenv.status === 0 && dotenv.stdout) {
    try {
      const parsed = JSON.parse(dotenv.stdout);
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* ignore */
    }
  }
}

const to = arg("to", "").trim();
const firstName = arg("first-name", "there").trim() || "there";
const subject = arg(
  "subject",
  "Blackglass — Linux drift visibility (quick note)",
).trim();

if (!to) {
  console.error(
    "Usage: npm run email:marketing -- --to=email@example.com [--first-name=Alex] [--subject=...]",
  );
  process.exit(2);
}

if (!process.env.RESEND_API_KEY?.trim()) loadDotenvLocal();

const key = process.env.RESEND_API_KEY?.trim();
if (!key) {
  console.error("RESEND_API_KEY is not set. Add it to .env.local or export it before running.");
  process.exit(2);
}

const from =
  process.env.EMAIL_MARKETING_FROM?.trim() ||
  process.env.EMAIL_FROM?.trim() ||
  "Blackglass <noreply@blackglasssec.com>";
const replyTo = process.env.EMAIL_MARKETING_REPLY_TO?.trim();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://blackglasssec.com").replace(/\/+$/, "");
const unsubUrl = process.env.EMAIL_LIST_UNSUBSCRIBE_URL?.trim();

const safeName = escHtml(firstName);
const demoUrl = `${appUrl}/demo`;
const productUrl = `${appUrl}/product`;

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">A short note on drift visibility for Linux estates.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;">
        <tr><td style="padding:32px 28px 8px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0f172a;">Hi ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0f172a;">
            If you are still thinking about how your team catches <strong>silent Linux drift</strong> before it becomes an incident,
            here is a two-minute path that does not require a sales call: the interactive demo shows real-style drift cards end to end.
          </p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#0f172a;">
            <a href="${demoUrl}" style="color:#2563eb;">Open the demo</a>
            &nbsp;·&nbsp;
            <a href="${productUrl}" style="color:#2563eb;">Product overview</a>
          </p>
          <p style="margin:0;font-size:16px;line-height:1.55;color:#0f172a;">— Blackglass</p>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;">
          <p style="margin:0;font-size:11px;line-height:1.5;color:#64748b;text-align:center;">
            ${COMPANY_FOOTER_LINE}
            ${unsubUrl ? `<br/><a href="${escHtml(unsubUrl)}" style="color:#94a3b8;">Unsubscribe</a>` : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const text = `Hi ${firstName},

If you are still thinking about how your team catches silent Linux drift before it becomes an incident, try the interactive demo (no sales call required):

${demoUrl}

Product overview: ${productUrl}

— Blackglass

${COMPANY_FOOTER_LINE}
${unsubUrl ? `\nUnsubscribe: ${unsubUrl}` : ""}
`;

const headers = {};
if (unsubUrl) {
  headers["List-Unsubscribe"] = `<${unsubUrl}>`;
  headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
}

const body = {
  from,
  to: [to],
  subject,
  html,
  text,
  ...(replyTo ? { reply_to: replyTo } : {}),
  ...(Object.keys(headers).length ? { headers } : {}),
};

const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const out = await r.json().catch(() => ({}));
if (!r.ok) {
  console.error(`Resend ${r.status}:`, JSON.stringify(out));
  process.exit(1);
}

console.log(`[email:marketing] sent id=${out.id ?? "(no id)"} to=${to} from=${from}`);
process.exit(0);
