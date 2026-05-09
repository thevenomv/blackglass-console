# Email deliverability runbook

How sending email actually works in production and how to verify, fix, and
upgrade it. Read this before any outbound campaign — including a single
prospect intro.

## Current state (as of 2026-05-09)

- **Provider:** Resend (`RESEND_API_KEY` set on the live App Platform spec).
- **Sending domain:** `obsidiandynamics.co.uk` (verified). All Blackglass
  product emails currently send from `Blackglass <noreply@obsidiandynamics.co.uk>`
  via `EMAIL_FROM` on the `web` component.
- **Verified domains on the Resend account:**
  - `obsidiandynamics.co.uk` — verified, sending enabled.
  - `projectskygrid.com` — verified, sending enabled (separate product).
- **Not yet verified (do this next):** `blackglasssec.com`. Until verified,
  any send from `*@blackglasssec.com` returns `403 The blackglasssec.com
  domain is not verified` and never reaches a recipient.

## Verifying `blackglasssec.com` (one-time, ~15 min)

Goal: emails appear to recipients as coming from `noreply@blackglasssec.com`
instead of `noreply@obsidiandynamics.co.uk`. This matters for brand
recognition, and downstream mail filters (Gmail, Outlook 365) prefer to see
the From domain match the link domain in the email body.

1. Log into Resend → **Domains** → **Add domain** → `blackglasssec.com`.
2. Resend will give you 3 DNS records — typically:
   - `MX` for receiving bounces (subdomain like `send.blackglasssec.com`).
   - `TXT` for SPF (`v=spf1 include:_spf.resend.com ~all` on the send
     subdomain, or merged into the apex if you already have an SPF).
   - `TXT` (DKIM) — long base64 selector record on a `_domainkey` subdomain.
3. Add all three to the DNS provider for `blackglasssec.com`. The domain is
   currently registered through the same provider as the App Platform domain;
   add the records there.
4. Click **Verify** in Resend. Verification typically completes within 5–15
   min after DNS propagates. If it stays "pending" >30 min, double-check the
   record values for trailing dots / quotes.
5. Once verified, switch the production env:

   ```bash
   # Edit .do/app-git.production.yaml — change:
   #   - key: EMAIL_FROM
   #     value: Blackglass <noreply@obsidiandynamics.co.uk>
   # to:
   #   - key: EMAIL_FROM
   #     value: Blackglass <noreply@blackglasssec.com>
   git commit -am "ops(email): switch From to verified blackglasssec.com"
   git push  # auto-deploys
   ```

   Or run a one-off `doctl apps spec get $APP_ID > /tmp/spec.yaml`,
   patch `EMAIL_FROM` in place, then `doctl apps update $APP_ID --spec
   /tmp/spec.yaml`.

6. Re-run `scripts/send-test-emails.mjs --to=you@example.com` and confirm
   the From address shows `noreply@blackglasssec.com`.

## DMARC / SPF alignment

Once `blackglasssec.com` is verified, set a DMARC policy for the apex:

```
_dmarc.blackglasssec.com  TXT  "v=DMARC1; p=none; rua=mailto:postmaster@blackglasssec.com; pct=100; sp=none"
```

Start with `p=none` to monitor. After two weeks of clean SPF+DKIM passes,
move to `p=quarantine`, then `p=reject` after another two weeks.

## Verifying deliverability before a campaign

```bash
# Local — fastest path, requires RESEND_API_KEY in env
$env:RESEND_API_KEY = "re_..."
$env:EMAIL_FROM = "Blackglass <noreply@obsidiandynamics.co.uk>"
node scripts/send-test-emails.mjs --to=you@example.com

# Or against the live deployment via the public sandbox-lead probe
curl -X POST https://blackglasssec.com/api/public/sandbox-lead \
  -H "Content-Type: application/json" \
  -d '{"email":"deliverability-probe@example.com"}'

# Then list recent sends in Resend
curl -H "Authorization: Bearer $RESEND_API_KEY" \
  "https://api.resend.com/emails?limit=10" | jq '.data[] | {last_event,subject,to,created_at}'
```

`last_event: delivered` is the success signal. `bounced` / `complained` are
red flags — investigate immediately.

## Failure modes and what they mean

| Resend response                                        | Cause                                            | Fix                                                                               |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `The X domain is not verified`                         | From address uses an unverified domain           | Verify the domain, or change `EMAIL_FROM` to a domain that is verified            |
| `You can only send testing emails to your own address` | Sending from `onboarding@resend.dev` (test domain) to a third party | Switch to a verified sending domain                                               |
| `Invalid API key`                                      | `RESEND_API_KEY` is wrong / revoked              | Rotate in Resend dashboard, update the DO App Platform secret, redeploy          |
| `Invalid `to` field`                                   | Malformed recipient address                      | Validate at the API layer; the templates do this already, this means a bypass    |
| 5 emails sent locally but 0 in inbox                   | Recipient mail server quarantined / spammed them | Check spam folder; check Resend dashboard for `delivered` vs `complained` events; tighten SPF/DKIM |

## Why we're not switching off Resend

Resend is the simplest path to authenticated email at our scale. The
alternatives we considered:

- **AWS SES:** cheaper at high volume but requires sandbox-graduation
  paperwork that takes 1–2 days, and the bounce/complaint webhook plumbing
  is non-trivial.
- **Postmark:** very high deliverability for transactional but expensive at
  bulk pricing, and lacks the React-friendly SDK.
- **SendGrid:** good API but reputation took a hit through 2024–2025; we
  don't need their volume tier.

Revisit when monthly send volume exceeds ~50k or Resend pricing changes
materially.
