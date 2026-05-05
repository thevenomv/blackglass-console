#!/usr/bin/env node
/**
 * Trial lifecycle email job — sends:
 *   - "trial-expiring"  when trialEndsAt is within ~3 days (72–97 h window so a daily run fires once)
 *   - "trial-expired"   when trialEndsAt is within the past 25 h  (fires once after expiry)
 *
 * Idempotency: Resend's Idempotency-Key header (tenant + type + UTC date) prevents
 * duplicate sends if the job is re-triggered the same day.
 *
 * Usage (manual):
 *   DATABASE_URL=... RESEND_API_KEY=re_... CLERK_SECRET_KEY=sk_live_... \
 *     node scripts/send-trial-lifecycle-emails.mjs
 *
 * Required env:
 *   DATABASE_URL        — Postgres connection string
 *   RESEND_API_KEY      — Resend API key
 *   CLERK_SECRET_KEY    — Clerk secret key (to fetch member emails)
 *
 * Optional env:
 *   APP_URL             — Base URL of the console (default: https://blackglasssec.com)
 *   EMAIL_FROM          — Sender address (default: BLACKGLASS <noreply@blackglasssec.com>)
 *   DRY_RUN             — set to "1" to log without sending
 */
import pg from "pg";

const DB_URL = process.env.DATABASE_URL?.trim();
const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
const CLERK_KEY = process.env.CLERK_SECRET_KEY?.trim();
const APP_URL = (process.env.APP_URL ?? "https://blackglasssec.com").replace(/\/$/, "");
const FROM = process.env.EMAIL_FROM ?? "BLACKGLASS <noreply@blackglasssec.com>";
const DRY_RUN = process.env.DRY_RUN === "1";

// ── guard ─────────────────────────────────────────────────────────────────────
if (!DB_URL) { console.error("DATABASE_URL is required"); process.exit(1); }
if (!RESEND_KEY) { console.warn("[trial-emails] RESEND_API_KEY not set — skipping"); process.exit(0); }
if (!CLERK_KEY) { console.warn("[trial-emails] CLERK_SECRET_KEY not set — cannot fetch member emails; skipping"); process.exit(0); }

// ── Clerk helpers ─────────────────────────────────────────────────────────────
async function clerkFetch(path) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${CLERK_KEY}` },
  });
  if (!r.ok) throw new Error(`Clerk ${path} → ${r.status}`);
  return r.json();
}

async function getOrgMembersWithEmail(clerkOrgId) {
  const data = await clerkFetch(`/organizations/${clerkOrgId}/memberships?limit=10`);
  const members = Array.isArray(data) ? data : (data.data ?? []);
  const results = [];
  for (const m of members) {
    const userId = m.public_user_data?.user_id ?? m.user_id;
    if (!userId) continue;
    try {
      const user = await clerkFetch(`/users/${userId}`);
      const email =
        user.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ??
        user.email_addresses?.[0]?.email_address;
      const firstName =
        user.first_name ??
        email?.split("@")[0] ??
        "there";
      if (email) results.push({ email, firstName });
    } catch (e) {
      console.warn(`[trial-emails] could not fetch Clerk user ${userId}:`, e.message);
    }
  }
  return results;
}

// ── Resend helper ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  if (DRY_RUN) {
    console.log(`[DRY_RUN] Would send "${subject}" → ${to}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 409 = already sent (idempotency hit) — not an error
    if (r.status === 409) { console.log(`[trial-emails] already sent (idempotency): ${to} ${subject}`); return; }
    throw new Error(`Resend ${r.status}: ${JSON.stringify(body)}`);
  }
  console.log(`[trial-emails] sent id=${body.id} → ${to} "${subject}"`);
}

// ── minimal HTML templates (inline, no TS build dependency) ──────────────────
const COMPANY = "Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA, United Kingdom";

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function wrap(subject, preheader, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
<meta name="x-apple-disable-message-reformatting">
<style>body{margin:0;padding:0;background:#f1f5f9}a{color:#2563eb}img{border:0}</style>
</head>
<body>
<span style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0"
       style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;max-width:600px;width:100%">
<tr><td style="padding:32px 40px 0;border-bottom:1px solid #e2e8f0">
  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:0.05em">BLACKGLASS</p>
</td></tr>
<tr><td style="padding:32px 40px">${body}</td></tr>
<tr><td style="padding:20px 40px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:0 0 8px 8px">
  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6">${esc(COMPANY)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function expiringHtml({ firstName, orgName, daysLeft, checkoutUrl }) {
  const urgency = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  return wrap(
    `Your BLACKGLASS trial expires ${urgency}`,
    `Upgrade before ${urgency} to keep all your baselines, drift history, and evidence exports.`,
    `<h1 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;color:#0f172a">Your BLACKGLASS trial expires ${esc(urgency)}</h1>
    <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569;line-height:1.6">Hi ${esc(firstName)}, your <strong style="color:#0f172a">${esc(orgName)}</strong> trial ends ${esc(urgency)}. Upgrade now to keep your baselines, drift history, and evidence exports without interruption.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="border-radius:6px;background:#2563eb">
        <a href="${esc(checkoutUrl)}" style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Upgrade now →</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569">What you keep when you upgrade:</p>
    <ul style="margin:0 0 16px;padding-left:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569;line-height:1.8">
      <li>All captured baselines and drift scan history</li>
      <li>Evidence export bundles already generated</li>
      <li>Team members and their roles</li>
      <li>Collector host configuration</li>
    </ul>
    <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94a3b8">Not ready? <a href="${esc(APP_URL)}/book">Book a 30-minute walkthrough</a> — no slides, just your use case.</p>`
  );
}

function expiredHtml({ firstName, orgName, checkoutUrl }) {
  return wrap(
    "Your BLACKGLASS trial has ended",
    "Your data is safe — reactivate to pick up exactly where you left off.",
    `<h1 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;color:#0f172a">Your BLACKGLASS trial has ended</h1>
    <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569;line-height:1.6">Hi ${esc(firstName)}, the free trial for <strong style="color:#0f172a">${esc(orgName)}</strong> has now ended. Your data is safe — baselines, drift history, and evidence exports are all still there waiting for you.</p>
    <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#475569">Reactivate at any time and pick up exactly where you left off.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="border-radius:6px;background:#2563eb">
        <a href="${esc(checkoutUrl)}" style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Reactivate your workspace</a>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94a3b8">Or <a href="${esc(APP_URL)}/book">book a 30-minute walkthrough</a> — no pitch, just your audit scenarios.</p>`
  );
}

function expiringText({ firstName, orgName, daysLeft, checkoutUrl }) {
  const urgency = daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`;
  return `Hi ${firstName},

Your BLACKGLASS trial for ${orgName} expires ${urgency}.

Upgrade now to keep your baselines, drift history, and evidence exports:
${checkoutUrl}

-- BLACKGLASS
${COMPANY}
`;
}

function expiredText({ firstName, orgName, checkoutUrl }) {
  return `Hi ${firstName},

Your BLACKGLASS trial for ${orgName} has ended. Your data is safe.

Reactivate your workspace:
${checkoutUrl}

-- BLACKGLASS
${COMPANY}
`;
}

// ── main ──────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD for idempotency keys
let sent = 0;
let skipped = 0;
let errors = 0;

try {
  await client.query(`SELECT set_config('app.bypass_rls', '1', false)`);

  // ── expiring: trialEndsAt within the next 73–97 hours (daily job fires once per subscription)
  const { rows: expiring } = await client.query(`
    SELECT s.id AS sub_id, s.tenant_id, s.trial_ends_at,
           t.clerk_org_id, t.name AS org_name
    FROM saas_subscriptions s
    JOIN saas_tenants t ON t.id = s.tenant_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at >= now() + interval '72 hours'
      AND s.trial_ends_at <  now() + interval '97 hours'
  `);

  console.log(`[trial-emails] expiring (72–97 h window): ${expiring.length}`);

  for (const row of expiring) {
    const msLeft = new Date(row.trial_ends_at).getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / 86_400_000);
    const checkoutUrl = `${APP_URL}/pricing`;
    const members = await getOrgMembersWithEmail(row.clerk_org_id);
    if (!members.length) { console.warn(`[trial-emails] no members for tenant ${row.tenant_id}`); skipped++; continue; }
    for (const { email, firstName } of members) {
      try {
        await sendEmail({
          to: email,
          subject: `Your BLACKGLASS trial expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          html: expiringHtml({ firstName, orgName: row.org_name, daysLeft, checkoutUrl }),
          text: expiringText({ firstName, orgName: row.org_name, daysLeft, checkoutUrl }),
          idempotencyKey: `trial-expiring-${row.tenant_id}-${today}`,
        });
        sent++;
      } catch (e) {
        console.error(`[trial-emails] failed to send expiring email to ${email}:`, e.message);
        errors++;
      }
    }
  }

  // ── expired: trialEndsAt within the past 25 hours (fires once after expiry)
  const { rows: expired } = await client.query(`
    SELECT s.id AS sub_id, s.tenant_id, s.trial_ends_at,
           t.clerk_org_id, t.name AS org_name
    FROM saas_subscriptions s
    JOIN saas_tenants t ON t.id = s.tenant_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at >= now() - interval '25 hours'
      AND s.trial_ends_at <  now()
  `);

  console.log(`[trial-emails] expired (past 25 h window): ${expired.length}`);

  for (const row of expired) {
    const checkoutUrl = `${APP_URL}/pricing`;
    const members = await getOrgMembersWithEmail(row.clerk_org_id);
    if (!members.length) { console.warn(`[trial-emails] no members for tenant ${row.tenant_id}`); skipped++; continue; }
    for (const { email, firstName } of members) {
      try {
        await sendEmail({
          to: email,
          subject: "Your BLACKGLASS trial has ended — reactivate your workspace",
          html: expiredHtml({ firstName, orgName: row.org_name, checkoutUrl }),
          text: expiredText({ firstName, orgName: row.org_name, checkoutUrl }),
          idempotencyKey: `trial-expired-${row.tenant_id}-${today}`,
        });
        sent++;
      } catch (e) {
        console.error(`[trial-emails] failed to send expired email to ${email}:`, e.message);
        errors++;
      }
    }
  }
} finally {
  await client.end();
}

console.log(`[trial-emails] done — sent=${sent} skipped=${skipped} errors=${errors}`);
if (errors > 0) process.exit(1);
