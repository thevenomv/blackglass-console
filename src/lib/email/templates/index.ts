/**
 * Email template exports.
 *
 * Every template exports `*EmailHtml(opts)` → full HTML string
 * and `*EmailText(opts)` → plain-text fallback.
 *
 * Plug any sender (Resend, SES, Postmark, etc.) — just pass html + text to
 * their respective send functions along with subject, from, and to.
 *
 * GDPR / CAN-SPAM: all templates include the registered company address:
 *   Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA
 * Marketing emails must also pass an `unsubscribeUrl` option.
 */

export { baseLayout, escHtml, h1, p, ctaButton, small } from "./base";
export type { BaseLayoutOptions } from "./base";

export { welcomeEmailHtml, welcomeEmailText } from "./welcome";
export type { WelcomeEmailOptions } from "./welcome";

export { trialExpiringEmailHtml, trialExpiringEmailText } from "./trial-expiring";
export type { TrialExpiringEmailOptions } from "./trial-expiring";

export { trialExpiredEmailHtml, trialExpiredEmailText } from "./trial-expired";
export type { TrialExpiredEmailOptions } from "./trial-expired";
