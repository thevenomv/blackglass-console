/**
 * Trial-expired email — sent when trial ends without upgrading.
 *
 * Trigger: scheduled job checking `saasSubscriptions` where
 *   `status = 'trialing'` and `trialEndsAt < now()`.
 *
 * At this point the tenant's console access is read-only / gated.
 * This email's goal is to re-engage and drive upgrade or a walkthrough call.
 *
 * Variables:
 *   firstName      — user's first name
 *   orgName        — workspace name
 *   consoleUrl     — base console URL
 *   checkoutUrl    — Stripe-hosted checkout or /pricing page
 *   unsubscribeUrl — GDPR unsubscribe link
 */

import { baseLayout, h1, p, ctaButton, small, escHtml } from "./base";

export interface TrialExpiredEmailOptions {
  firstName: string;
  orgName: string;
  consoleUrl: string;
  checkoutUrl: string;
  unsubscribeUrl?: string;
}

export function trialExpiredEmailHtml(opts: TrialExpiredEmailOptions): string {
  const { firstName, orgName, consoleUrl, checkoutUrl, unsubscribeUrl } = opts;

  const body = `
    ${h1("Your BLACKGLASS trial has ended")}
    ${p(`Hi ${escHtml(firstName)}, the free trial for <strong style="color:#0f172a;">${escHtml(orgName)}</strong> has now ended. Your data is safe — baselines, drift history, and evidence exports are all still there waiting for you.`)}
    ${p("Reactivate at any time and pick up exactly where you left off.")}
    ${ctaButton("Reactivate your workspace", checkoutUrl)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="margin:0 0 24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;width:100%;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                    font-size:13px;font-weight:600;color:#0f172a;">Not sure yet?</p>
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                    font-size:14px;color:#475569;line-height:1.6;">
            <a href="${consoleUrl}/book" style="color:#2563eb;">Book a 30-minute walkthrough</a> and we will walk through BLACKGLASS using your team's actual audit scenarios — no slides, no pitch, just your use case.
          </p>
        </td>
      </tr>
    </table>
    ${p(`Or reply to this email directly — we are happy to discuss pricing, deployment, or compliance requirements before you commit.`)}
    ${small(`You are receiving this because your BLACKGLASS trial ended. To opt out of marketing emails, <a href="${opts.unsubscribeUrl ?? "#"}" style="color:#94a3b8;">unsubscribe here</a>.`)}
  `;

  return baseLayout({
    subject: "Your BLACKGLASS trial has ended — your data is still here",
    preheader: `Your baselines and drift history are still saved. Reactivate at any time to pick up where you left off.`,
    body,
    unsubscribeUrl,
  });
}

export function trialExpiredEmailText(opts: TrialExpiredEmailOptions): string {
  const { firstName, orgName, consoleUrl, checkoutUrl } = opts;
  return `Hi ${firstName},

The BLACKGLASS trial for "${orgName}" has ended. Your data is still safe — baselines, drift history, and evidence exports are all stored and waiting.

Reactivate at any time: ${checkoutUrl}

Not sure yet? Book a 30-minute walkthrough using your own audit scenarios: ${consoleUrl}/book

Or simply reply to this email — we are happy to discuss pricing, deployment, or compliance requirements.

---
Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA, United Kingdom
`;
}
