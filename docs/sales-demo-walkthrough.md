# BLACKGLASS sales-demo walkthrough

A one-page script for live prospect demos against the long-lived
sales-demo VM (`blackglass-lab-01`). Read top-to-bottom; expect ~12
minutes end-to-end.

> **Demo VM facts** (from `docs/runbooks/operations.md` § 4c):
> Hostname `blackglass-lab-01` · IP `134.209.180.255` · Region `lon1` ·
> Ubuntu 22.04 · `blackglass` user with NOPASSWD sudo on read-only
> audit commands + the seed script · `ufw` enabled · DO Cloud Firewall
> `blackglass-lab-fw` attached.

---

## Pre-demo checklist (5 minutes, do BEFORE the call)

1. **Confirm the lab is reachable.**
   ```bash
   ssh blackglass@134.209.180.255 'uname -a && systemctl is-active sshd'
   ```
   Should print kernel + `active`. If not, see § 4c of the operations
   runbook before the call.

2. **Reset to clean baseline.** SSH as root and run the reset script —
   this undoes any drift from the previous demo:
   ```bash
   ssh root@134.209.180.255 'bash -s' < scripts/lab/reset-drift.sh
   ```

3. **Capture a fresh baseline from the console.** Open
   `https://blackglasssec.com/baselines`, click the host, hit **Capture
   baseline**. Wait until status is `green / pinned`.

4. **Seed drift.** SSH as root and run the seed script — this stages
   four findings (one per remediator risk tier):
   ```bash
   ssh root@134.209.180.255 'bash -s' < scripts/lab/seed-drift.sh
   ```

5. **Have ready in browser tabs:**
   - `https://blackglasssec.com/dashboard`
   - `https://blackglasssec.com/drift?lifecycle=open`
   - `https://blackglasssec.com/evidence`
   - `https://blackglasssec.com/settings#integrations` (for the SSO /
     SCIM / webhook story)

---

## The walkthrough (12 min)

### 1. The dashboard (1 min) — "what you see when you log in"

Open `/dashboard`. Talk through:

- **Value-recap banner** at the top — "open findings · high severity ·
  remediated this cycle · fleet risk score". One-glance status.
- **Drift trend chart** — last 14 days, stacked by severity. Click a bar
  to filter the queue.
- **Notable items list** — direct deep-links into the host detail with
  the exact finding pre-selected.
- **Fleet overview tile** — coverage, last-seen, baseline currency.

> **Buyer pain it solves:** "I have a Linux fleet and I have no idea
> when something's been changed. My CIS / SOC 2 auditor asks me to
> prove this every quarter and I dread it."

### 2. Trigger a scan (45 sec) — "let's catch the drift live"

From the dashboard hit **Run fleet scan** (top-right).

- A toast confirms the scan was enqueued onto BullMQ
  (`blackglass-scans`).
- Within ~10 seconds the queue depth indicator ticks up then back to
  zero — `scan-worker` picked it up.
- The dashboard's notable-items list refreshes and gains four entries
  (one per seeded category).

### 3. Drift triage (3 min) — "this is the daily workflow"

Click **Drift events** in the nav. Walk through:

- **Sort + filter pills** — severity / lifecycle / category / host.
- **One row per finding**, with detection time formatted nicely (no more
  `Invalid Date`).
- Click the **SSH `ClientAliveInterval`** finding → drift investigation
  drawer opens.
  - Show the diff (baseline vs current).
  - Show the **suggested remediation** card from the remediator.
  - Show **Acknowledge** / **Mark accepted risk** / **Mute by pattern**
    actions in the drawer footer.

> **Buyer pain it solves:** "My team gets blasted with alert noise.
> BLACKGLASS lets us keep the signal but suppress the known-noisy
> categories without losing the audit trail."

### 4. Remediator (3 min) — "the part that's actually different"

Still in the drawer for the SSH finding, click **Generate
remediation**.

- The Python remediator (`blackglass-remediator`) returns a JSON plan
  with a confidence score and risk tier. Show that the tier maps to one
  of: `safe_guidance_only`, `sandbox_verified`, `approval_required`,
  `manual_only`.
- For the `sandbox_verified` SSH finding the plan was already validated
  on a throwaway Droplet — show the **sandbox verification result**
  card. Talk through:
  - "We never run AI commands directly on production. We provision a
    short-lived sandbox, replay the change there, validate it, then
    surface the plan for human approval — with the full audit trail."
  - Open the audit log entry (`Audit` tab in the drawer) to show:
    `drift detected → plan generated → sandbox verified →
    awaiting_approval`.
- Click **Approve** — show the action lands in the audit log too. The
  approval signals the remediator; we never auto-execute.

> **Buyer pain it solves:** "Agentic AI scares me. BLACKGLASS gives me
> agentic recommendations with explicit blast-radius limits and forced
> human-in-the-loop."

### 5. Evidence export (2 min) — "the audit-day deliverable"

Go to **Evidence**. Talk through:

- The list shows tamper-evident bundles: title · scope · creation date ·
  SHA-256.
- Click **Generate new bundle** → modal lets you scope by host, drift
  state, baseline window. The job runs on `ops-worker`.
- Once done, the row shows a **Download** link. The bundle contains
  baselines + drift findings + acknowledgements + operator notes,
  digitally fingerprinted, formatted as both JSON-LD and a PDF report.

> **Buyer pain it solves:** "When the auditor asks for evidence I want
> to hand them one ZIP, not stitch together CSVs from four tools."

### 6. Enterprise plumbing (2 min) — "for the procurement conversation"

Open **Settings → Identity & access** (admin role required) and walk
the buyer through what's available without leaving the call:

- **SAML SSO** (Clerk Enterprise) — show the metadata URL.
- **SCIM provisioning** — show the bearer token + endpoint URL.
- **API keys** — show the create-key flow; mention CI/CD use cases.
- **Webhook signing keys** — per-tenant rotated, dual-sign overlap
  window so receivers don't see hard cutovers.
- **Air-gap mode** — flip the toggle and show the green
  `air-gap: ENABLED` strip in the header. Mention `BLACKGLASS_AIRGAPPED=true`
  is enforced server-side; outbound integrations fail-fast rather than
  hang.

Then **Settings → Operator → Runtime health**:

- Live rate-limit bucket sizes (warm buckets highlighted).
- BullMQ queue depths per queue, with oldest-waiting age.
- Same data the on-call alerts use.

> **Buyer pain it solves:** "I need to get this past procurement
> without writing a 30-page security questionnaire."

---

## Closing (1 min)

Three lines you should always end on, then stop talking:

1. **"You've seen the actual product, not slides."** Every screen above
   is the live console — same SaaS your fleet would live in.
2. **"Three pricing tiers"** — Starter / Growth / Business / Enterprise.
   Send them to `https://blackglasssec.com/pricing`.
3. **"Pilot in your environment in under an hour"** — they install the
   collector with a single curl command, point it at one or three
   hosts, and the dashboard fills in within 5 minutes.

---

## After the call (3 minutes)

- Reset the lab so it's ready for the next demo:
  ```bash
  ssh root@134.209.180.255 'bash -s' < scripts/lab/reset-drift.sh
  ```
- File the prospect in your CRM with what risk-tier story landed
  (sandbox-verified vs approval-required vs guidance-only — different
  buyers light up at different points).
- If they asked about a feature you didn't have ready, log it under
  `docs/best-recommendations.md` § P2 so we surface it next planning.

---

## Troubleshooting

| Symptom                                            | Fix                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard shows `coverage: 0`                      | Confirm `COLLECTOR_HOST_1=134.209.180.255` is set on the App Platform → restart web pods. |
| Scan queue stays at 0 active for >30 s             | Check `scan-worker` Deployment is healthy in DO App Platform; restart if needed.          |
| `ssh: connection refused` from console             | DO Cloud Firewall `blackglass-lab-fw` may have lost the ingress rule — re-attach via DO. |
| Bundles list is empty after evidence export        | `ops-worker` is down — check logs in DO App Platform, restart, retry from `/evidence`.    |
| Remediator drawer says "remediator unavailable"    | The Python sidecar isn't running. See `blackglass-remediator/README.md` to (re)start it.  |

---

## Related docs

- `docs/runbooks/operations.md` § 4c — canonical lab properties.
- `blackglass-remediator/docs/safety-model.md` — risk-tier model.
- `docs/security-compliance.md` — the questionnaire-answering doc.
- `docs/incident-notification.md` — the "what happens when it breaks"
  story buyers always ask about.
- `scripts/lab/seed-drift.sh` / `reset-drift.sh` — replayable drift
  seed for live demos.
