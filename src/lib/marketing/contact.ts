/**
 * Public-facing contact addresses (mailto + visible copy + sales defaults).
 *
 * **Operational default:** mail goes to the working operator inbox until
 * dedicated `hello@` / `security@` addresses exist on blackglasssec.com.
 * Override at build time for the browser bundle:
 * - `NEXT_PUBLIC_MARKETING_CONTACT_EMAIL` — general / sales mailto + schema.org sales contact
 * - `NEXT_PUBLIC_SECURITY_CONTACT_EMAIL` — vuln disclosure + `/.well-known/security.txt` (optional)
 */

/** Inbox that actually receives replies today — change only when blackglasssec mailboxes are live. */
const OPERATOR_INBOX_FALLBACK = "jamie@obsidiandynamics.co.uk";

function normalizeEmail(raw: string | undefined, fallback: string): string {
  const t = raw?.trim();
  if (t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 254) return t.toLowerCase();
  return fallback;
}

/** General sales / marketing / “talk to us” mailbox. */
export function getMarketingContactEmail(): string {
  return normalizeEmail(process.env.NEXT_PUBLIC_MARKETING_CONTACT_EMAIL, OPERATOR_INBOX_FALLBACK);
}

/** Vulnerability disclosure + security.txt (same inbox by default; split later with env). */
export function getSecurityContactEmail(): string {
  return normalizeEmail(process.env.NEXT_PUBLIC_SECURITY_CONTACT_EMAIL, OPERATOR_INBOX_FALLBACK);
}

/**
 * Stable marketing address for client components (NEXT_PUBLIC_* inlined at build).
 * Server code can call `getMarketingContactEmail()` instead if you need fresh env reads in tests.
 */
export const MARKETING_CONTACT_EMAIL = getMarketingContactEmail();

export const SECURITY_CONTACT_EMAIL = getSecurityContactEmail();

export function marketingMailtoHref(subject?: string): string {
  const base = `mailto:${MARKETING_CONTACT_EMAIL}`;
  if (!subject?.trim()) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

export function securityMailtoHref(subject?: string): string {
  const base = `mailto:${SECURITY_CONTACT_EMAIL}`;
  if (!subject?.trim()) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

/** Default inbox for sales leads when SALES_LEAD_EMAIL / SALES_NOTIFICATION_EMAIL are unset. */
export function getDefaultSalesInboxEmail(): string {
  return getMarketingContactEmail();
}
