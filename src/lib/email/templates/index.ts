/**
 * Email template exports.
 *
 * Every template exports `*EmailHtml(opts)` → full HTML string
 * and `*EmailText(opts)` → plain-text fallback.
 *
 * Plug any sender (Resend, SES, Postmark, etc.) — just pass html + text to
 * their respective send functions along with subject, from, and to.
 *
 * GDPR / CAN-SPAM: all templates include the registered company address.
 * The exact string lives in `base.ts` as `COMPANY_FOOTER_LINE` — names
 * the trading brand (Blackglass) AND the legal entity (Obsidian Dynamics
 * Limited, Co. No. 16663833) so commercial mail meets the
 * identifiable-sender requirement.
 *
 * Marketing emails must also pass an `unsubscribeUrl` option.
 */

export { baseLayout, escHtml, h1, p, ctaButton, small, COMPANY_FOOTER_LINE } from "./base";
export type { BaseLayoutOptions } from "./base";

export { welcomeEmailHtml, welcomeEmailText } from "./welcome";
export type { WelcomeEmailOptions } from "./welcome";

export { trialExpiringEmailHtml, trialExpiringEmailText } from "./trial-expiring";
export type { TrialExpiringEmailOptions } from "./trial-expiring";

export { trialExpiredEmailHtml, trialExpiredEmailText } from "./trial-expired";
export type { TrialExpiredEmailOptions } from "./trial-expired";
