/**
 * Trial-expiring reminder email — sent ~3 days before trial ends.
 *
 * Trigger: scheduled job / maintenance.yml reconcile-billing, or a cron
 *   that checks `saasSubscriptions.trialEndsAt` for rows where `status = 'trialing'`
 *   and `trialEndsAt BETWEEN now() AND now() + interval '3 days'`.
 *
 * Variables:
 *   firstName      — user's first name (or email prefix as fallback)
 *   orgName        — workspace name
 *   daysLeft       — integer days remaining
 *   consoleUrl     — base console URL
 *   checkoutUrl    — Stripe-hosted checkout or /pricing page
 *   unsubscribeUrl — GDPR unsubscribe link
 */

import { baseLayout, h1, p, ctaButton, small, escHtml } from "./base";

export interface TrialExpiringEmailOptions {
  firstName: string;
  orgName: string;
  daysLeft: number;
  consoleUrl: string;
  checkoutUrl: string;
  unsubscribeUrl?: string;
}

export function trialExpiringEmailHtml(opts: TrialExpiringEmailOptions): string {
  const { firstName, orgName, daysLeft, consoleUrl, checkoutUrl, unsubscribeUrl } = opts;

  const urgency = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;

  const body = `
    ${h1(`Your BLACKGLASS trial expires ${urgency}`)}
    ${p(`Hi ${escHtml(firstName)}, your <strong style="color:#0f172a;">${escHtml(orgName)}</strong> trial ends ${urgency}. Upgrade now to keep your baselines, drift history, and evidence exports without interruption.`)}
    ${ctaButton("Upgrade now →", checkoutUrl)}
    ${p("What you keep when you upgrade:")}
    <ul style="margin:0 0 16px;padding-left:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569;line-height:1.8;">
      <li>All captured baselines and drift scan history</li>
      <li>Evidence export bundles already generated</li>
      <li>Team members and their roles</li>
      <li>Collector host configuration</li>
    </ul>
    ${p(`Not ready to commit? <a href="${consoleUrl}/book" style="color:#2563eb;">Book a 30-minute walkthrough</a> and we can help you validate BLACKGLASS against your specific use case before you decide.`)}
    ${small(`You are receiving this because your BLACKGLASS trial is ending. To opt out of marketing emails, <a href="${opts.unsubscribeUrl ?? "#"}" style="color:#94a3b8;">unsubscribe here</a>. If the button doesn't work, copy this URL: <a href="${checkoutUrl}" style="color:#94a3b8;">${escHtml(checkoutUrl)}</a>`)}
  `;

  return baseLayout({
    subject: `Your BLACKGLASS trial expires ${urgency} — keep your data`,
    preheader: `Upgrade before ${urgency} to keep all your baselines, drift history, and evidence exports.`,
    body,
    unsubscribeUrl,
  });
}

export function trialExpiringEmailText(opts: TrialExpiringEmailOptions): string {
  const { firstName, orgName, daysLeft, consoleUrl, checkoutUrl } = opts;
  const urgency = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;
  return `Hi ${firstName},

Your BLACKGLASS trial for "${orgName}" expires ${urgency}.

Upgrade to keep your baselines, drift history, and evidence exports:
${checkoutUrl}

Not ready to commit? Book a walkthrough: ${consoleUrl}/book

---
Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA, United Kingdom
`;
}
