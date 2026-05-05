/**
 * Welcome email — sent to a new user after they sign up and create a workspace.
 *
 * Trigger: Clerk `organization.created` webhook → after tenant is provisioned.
 *
 * Variables:
 *   firstName     — user's first name (or email prefix as fallback)
 *   orgName       — Clerk organisation / workspace name
 *   consoleUrl    — base URL of the console, e.g. https://blackglasssec.com
 *   trialDays     — integer, days remaining in trial (default 14)
 *   unsubscribeUrl — required for GDPR marketing consent; omit for transactional
 */

import { baseLayout, h1, p, ctaButton, small, escHtml } from "./base";

export interface WelcomeEmailOptions {
  firstName: string;
  orgName: string;
  consoleUrl: string;
  trialDays?: number;
  unsubscribeUrl?: string;
}

export function welcomeEmailHtml(opts: WelcomeEmailOptions): string {
  const { firstName, orgName, consoleUrl, trialDays = 14, unsubscribeUrl } = opts;
  const welcomeUrl = `${consoleUrl}/welcome`;

  const body = `
    ${h1(`Welcome to BLACKGLASS, ${escHtml(firstName)}`)}
    ${p(`Your workspace <strong style="color:#0f172a;">${escHtml(orgName)}</strong> is ready. You have a ${trialDays}-day trial to explore every feature.`)}
    ${p("BLACKGLASS gives your security and operations teams a single place to capture approved system state, detect configuration drift, and export evidence for audits — without installing agents on your servers.")}
    ${ctaButton("Open your console", welcomeUrl)}
    ${p("During the trial you can:")}
    <ul style="margin:0 0 16px;padding-left:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569;line-height:1.8;">
      <li>Connect SSH hosts and capture baselines</li>
      <li>Run drift scans and triage findings by severity</li>
      <li>Export signed evidence bundles for compliance reviews</li>
      <li>Invite team members with role-based access</li>
    </ul>
    ${p("Questions? Reply to this email or <a href=\"${consoleUrl}/book\" style=\"color:#2563eb;\">book a walkthrough</a> and we will set aside 30 minutes for your team.".replace("${consoleUrl}", consoleUrl))}
    ${small(`You are receiving this because you created a BLACKGLASS workspace. If the button doesn't work, copy this URL into your browser: <a href="${welcomeUrl}" style="color:#94a3b8;">${escHtml(welcomeUrl)}</a>`)}
  `;

  return baseLayout({
    subject: `Welcome to BLACKGLASS — your trial is ready`,
    preheader: `Your ${orgName} workspace is set up. Here's how to get the most out of your ${trialDays}-day trial.`,
    body,
    unsubscribeUrl,
  });
}

export function welcomeEmailText(opts: WelcomeEmailOptions): string {
  const { firstName, orgName, consoleUrl, trialDays = 14 } = opts;
  return `Welcome to BLACKGLASS, ${firstName}

Your workspace "${orgName}" is ready. You have a ${trialDays}-day trial to explore every feature.

Open your console: ${consoleUrl}/welcome

During the trial you can:
- Connect SSH hosts and capture baselines
- Run drift scans and triage findings by severity
- Export signed evidence bundles for compliance reviews
- Invite team members with role-based access

Questions? Reply to this email or book a walkthrough: ${consoleUrl}/book

---
Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA, United Kingdom
`;
}
