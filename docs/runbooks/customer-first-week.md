# Customer first-week runbook

A practical playbook for whoever does first-touch with a new prospect or paid pilot, from
"sent the intro email" through "they've seen real value in their first week".

This runbook is the operator's checklist. Customer-facing material lives at
`/welcome`, `/docs/snapshot-freshness`, `/docs/api`, and `/changelog`.

---

## Day 0 — Pre-call / pre-signup

**Goal:** prospect arrives knowing what Blackglass does and what to expect.

- [ ] Send the intro email with three links:
  - `https://blackglasssec.com/product`
  - `https://blackglasssec.com/use-cases/linux-configuration-drift-detection`
  - `https://blackglasssec.com/security`
- [ ] If they're enterprise, attach the DPA from `https://blackglasssec.com/dpa` and the
  subprocessors list from `https://blackglasssec.com/subprocessors`.
- [ ] If they want a walkthrough, send the Cal.com (or equivalent) link from
  `https://blackglasssec.com/book`. Block 30 min.
- [ ] **Operator check before the call:**
  - `https://blackglasssec.com/status` reports "All systems operational".
  - The demo VM (`blackglass-rustdesk-demo`, `167.99.59.55`) snapshot is < 5 min old.
    Verify in the dashboard's snapshot-freshness pill.
  - You can run a fleet integrity scan from the command palette (⌘K → "Run fleet
    integrity scan") and it completes within ~30s.

If any of those is red, fix it before the call. Demo VMs that say "stale snapshot"
are the #1 way to lose a prospect on the first call.

---

## Day 1 — Signup + first scan

**Goal:** they create an account, install the agent on one host, and see drift detected.

### What you do

- [ ] Watch for the Slack notification from `/api/contact-sales` (if they came through
  the form) or the Clerk `organization.created` webhook (if self-serve). Reply within
  the same business day.
- [ ] Verify the welcome email landed (not in spam). If they're using Microsoft 365 /
  Outlook, ask them to add `noreply@blackglasssec.com` to safe senders.
- [ ] Send a short follow-up:
  > "You're in. Two things to do today: (1) install the agent on one host with
  > `curl -sSL https://blackglasssec.com/install-agent.sh | sudo bash`, (2) capture
  > a baseline. I'll watch for the first scan land — reply if anything's stuck."
- [ ] Open the operator console with their tenant context and confirm:
  - Tenant row exists in `saas_tenants`.
  - Subscription row exists with `status='trialing'` and `trial_ends_at` ~14 days out.
  - Welcome email was sent (Resend dashboard → Activity).

### What they do

- [ ] Run the install-agent script on their first host.
- [ ] Capture a baseline (Console → Hosts → "Capture baseline").
- [ ] Run their first scan from the command palette. Drift should be 0 (because the
  baseline IS the current state).
- [ ] Make a deliberate change on the host (touch a file in `/etc/`, add a sudoers
  entry, open a port). Run the scan again — drift event should appear within 30s.

### Common day-1 problems

| Symptom                                       | Most likely cause                                              | Fix                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Install script fails with `permission denied` | They ran it without sudo                                       | Ask them to prefix `sudo`                                                                         |
| Snapshot pill stays gray for >2 min           | Agent timer not enabled, or `INGEST_API_KEY` mismatch          | SSH to host: `systemctl status blackglass-agent.timer` and `journalctl -u blackglass-agent -n 50` |
| First scan reports "100% baseline alignment"  | They captured baseline AFTER making the change                 | Recapture baseline, make a change, scan again                                                     |
| First scan stuck in "running"                 | Scan-worker not connected (we have an in-process fallback now) | Check `/api/admin/queues` — should show `waiting=0`                                               |
| Drift detected but no Slack/email             | Tenant didn't set alert routing in Settings → Notifications    | Walk them through Settings → Notifications, then re-run scan                                      |

---

## Day 2–3 — Invite team

**Goal:** they invite at least one teammate, ideally an auditor or manager, so the
purchase decision isn't blocked on "I'm the only one who's seen it".

- [ ] Send: "Most teams add an investigator + an auditor in the first week. Auditors
  and investigators don't count against your paid seat limit."
- [ ] Walk them through the role model if asked (`/welcome` page covers this).
- [ ] Verify the invite email lands. If it bounces, check Clerk's email dashboard.

---

## Day 4–5 — Show real fleet impact

**Goal:** they connect 3–5 hosts and see a digest's worth of drift.

- [ ] Send: "Once you're past 2–3 hosts, the weekly findings digest gets useful. You
  can preview it now from Settings → Notifications → Send test digest."
- [ ] Verify the on-demand digest fires and lands in their inbox.
- [ ] If they have any high-severity drift, ask if they want a 15-min triage call.
  Free triage on the first finding is high-leverage.

---

## Day 7 — Pre-decision check-in

**Goal:** know whether they're going to convert + remove blockers.

- [ ] Send: "How's it looking? Anything not behaving as expected? Happy to set aside
  20 min to walk through any noise — I'd rather you start with a clean signal than
  ignore findings because they're noisy."
- [ ] If they're enterprise, send: "We can also pre-fill any security questionnaire
  you need — CAIQ-Lite, SIG-Lite, custom — turnaround is 2–3 business days."
- [ ] Operator check:
  - At least one scan completed successfully in the past 24 h.
  - No high-severity drift events left "new" for >48 h (they should be triaged or
    accepted-as-risk).
  - `/api/admin/queues` shows healthy worker counts.

---

## Day 10–14 — Trial expiry sequence

**Goal:** convert before T+0; if they don't, soft-land into read-only mode without
losing data.

The product handles most of this automatically:

- T-7 days: amber "Trial ends in N days" banner appears at the top of every console
  page (`SaasTrialBanner` component).
- T-3 days: trial-expiring email fires from the cron / maintenance worker.
- T-1 day: banner becomes louder (urgent variant).
- T+0: trial-expired email fires; `SaasSubscription.status` flips to `trial_expired`
  on first read after expiry; workspace becomes read-only.
- T+0 → T+30: workspace is preserved (data isn't deleted). They can still log in,
  view the dashboard, export evidence — but mutations are blocked until they upgrade.

### What the operator does

- [ ] If they haven't replied to the trial-expiring email by T-2, send a personal
  follow-up: "I noticed you're 2 days from end-of-trial — happy to extend by a week
  if you need more eval time, or to set up a quick call to talk pricing."
- [ ] If they upgrade: confirm Stripe webhook flipped them to `active` (Settings →
  Billing should show the live plan, not "trial_expired"). Send a thank-you email
  with the post-purchase checklist (members, integrations, weekly digest opt-in).
- [ ] If they don't upgrade: data stays. After 30 days, archive the workspace per the
  retention policy (`docs/runbooks/operations.md`). Don't delete proactively unless
  they request it — sometimes they come back.

---

## When something is on fire

For genuine production issues affecting paying customers, escalate via the
data-breach-response runbook (`docs/runbooks/data-breach-response.md`) for any
incident that touches customer data, or `docs/runbooks/operations.md` for everything
else (deploy issues, queue stalls, partition health).

The pragmatic order of operations:

1. Acknowledge in the customer's preferred channel within 30 min during business
   hours, 2 h overnight.
2. Update the public status page (`/status` is auto-generated from probes; if it
   says "operational" while the customer is reporting a real outage, the probe
   set is wrong — fix that next).
3. Fix.
4. Post-mortem to the customer within 48 h. Even a one-paragraph "here's what
   broke, here's what we changed" goes a long way.

---

## Email deliverability quick-test

If you're about to send a real outreach campaign and want to confirm Resend is
healthy and the From domain is authenticated:

```bash
# Local, against real Resend
RESEND_API_KEY=re_... node scripts/email/send-test-emails.mjs --to=you@example.com

# Or, against the live deployment as an admin
curl -X POST https://blackglasssec.com/api/admin/test-email \
  -H "Cookie: __session=…clerk session…" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@example.com","template":"all"}'
```

You should receive 5 emails (welcome, drift-alert, drift-digest, trial-expiring,
trial-expired) within 60 s. Open each on:

- Gmail (web + mobile)
- Outlook 365 (web)
- iOS Mail
- ProtonMail (if you target privacy-sensitive customers)

Verify SPF, DKIM, DMARC all pass — Gmail shows this under "Show original" → look for
three green checkmarks.
