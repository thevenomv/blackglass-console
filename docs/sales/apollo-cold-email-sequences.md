# Apollo cold outreach — email sequences (internal)

> **Audience:** sales, founders, growth. **Not** customer-facing or linked from the public site.  
> **Stack:** Paste into [Apollo.io](https://www.apollo.io/) sequences. Apollo sends from **connected mailboxes** (or a warmed outreach domain). Do **not** route cold prospecting through **Resend** `noreply@` — that domain is for product mail and must stay clean.

## Merge fields (map in Apollo’s editor)

Apollo’s tokens vary by workspace; insert the equivalents from Apollo’s **Variables** picker. Below, placeholders mean:

| Placeholder | Typical Apollo source |
|-------------|----------------------|
| `{{first_name}}` | Contact first name |
| `{{company}}` | Account / company name |
| `{{title}}` | Job title |
| `{{sender_first_name}}` | Your first name (sequence sender) |

Replace with Apollo’s exact syntax if yours differs (for example `{{contact.first_name}}`).

## Ideal customer profile (keep lists tight)

- **Who:** Platform / SRE / infrastructure leads, or small security teams owning Linux estates, roughly **30–200** person companies (adjust for your list).
- **Pain:** Silent config drift, audit evidence, “what changed before the incident,” baseline discipline without running a SIEM for everything.
- **Proof paths:** Interactive demo at `https://blackglasssec.com/demo` (no login fiction), product summary at `/product`, pricing at `/pricing`.
- **Honesty:** Do not claim SOC 2 completion, customer counts you cannot cite, or capabilities not in production. Point to **demo** and **security** pages for verifiable claims.

## Sequence A — Platform / reliability (4 touches)

**Angle:** Unwanted Linux change is a reliability and security problem before it is a headline.

### A1 — Subject options (pick one)

- `question on drift for {{company}}`
- `Linux change visibility`
- `before this becomes a sev`

### A1 — Body

```
Hi {{first_name}},

Most teams only learn a Linux host “drifted” after something breaks or someone asks hard questions in a review.

We built Blackglass for teams that want an early signal: baselines, drift grouped by severity, and evidence exports leadership can read without SSH.

Worth a two-minute look?

{{sender_first_name}}

P.S. There’s a no-login walkthrough here if you want to click around first: https://blackglasssec.com/demo
```

### A2 — Subject options

- `Terraform says one thing. Your hosts say another.`
- `re: the baseline question`

### A2 — Body (3-day gap typical)

```
Hi {{first_name}},

The gap most platform teams have isn't tooling — it's visibility between deployments.

Your IaC captured intent. The host that's been running for three months has its own story.

Blackglass closes that gap without a CMDB project. Tell me what {{company}} uses for config today — Ansible, baked images, "mostly muscle memory" — and I'll point you at the right screen in the demo.

{{sender_first_name}}
```

### A3 — Subject options

- `10 minutes or a link — your call`
- `demo vs call`

### A3 — Body (5–7 day gap)

```
Hi {{first_name}},

One more before I get out of your inbox.

If you want to click through at your own pace, the interactive demo takes two minutes and needs no signup:
https://blackglasssec.com/demo

If you'd rather a live 15-minute walkthrough with me, reply with a couple of times that work.

{{sender_first_name}}
```

### A4 — Breakup (optional, 7+ day gap)

```
Hi {{first_name}},

I'll stop chasing. Timing clearly isn't right.

If Linux drift becomes the thing keeping you up — or the question you can't answer cleanly in a review — you know where to find us.

https://blackglasssec.com/demo

{{sender_first_name}}
```

---

## Sequence B — Security / governance (3 touches)

**Angle:** Evidence, audit trail, and controlled change — aligned with how you describe trust on `/security`.

### B1 — Subject options

- `what changed on your Linux fleet last quarter?`
- `audit trail for Linux changes`

### B1 — Body

```
Hi {{first_name}},

That's the question auditors are starting to ask. For most teams, the honest answer is "we'd have to check a dozen places and piece it together."

CIS benchmarks, ISO 27001, SOC 2 — they all assume you have a reliable record of what changed on your systems, and when. Linux is usually where that record breaks down.

Blackglass gives you a single timeline: baselines, drift findings, exports built for evidence packs. No agents to wrangle. No SIEM project required.

If {{company}} is working toward any of those frameworks this year, happy to walk through what ships today.

{{sender_first_name}}

https://blackglasssec.com/demo
```

### B2 — Subject options

- `re: the Linux change record problem`
- `the 20-second export`

### B2 — Body

```
Hi {{first_name}},

Concrete example: a team got asked in a SOC 2 audit to produce a change record for one specific host over 90 days. They had nothing useful — just logs scattered across three tools and a lot of archaeology.

That's now a 20-second export in Blackglass.

If compliance posture is part of your remit at {{company}}, I can tailor this to whichever framework you're targeting. Worth a reply?

{{sender_first_name}}
```

### B3 — Subject options

- `last note`
- `closing the loop`

### B3 — Body

```
Hi {{first_name}},

I'll leave you alone after this one.

If you want to dig into the security detail first:
https://blackglasssec.com/security

If you're ready to talk seats and pricing:
https://blackglasssec.com/pricing

Either way — appreciate you reading this far.

{{sender_first_name}}
```

---
## Sequence C — DevOps / engineering manager (3 touches)

**Angle:** Shorter cadence, engineering-first framing. Works well when the title is "Engineering Manager," "VP Engineering," or "DevOps Lead" — people who own delivery and reliability but aren't in a dedicated security role.

### C1 — Subject options (pick one)

- `your golden image is lying to you`
- `{{company}} infra hygiene`
- `drift before it pages you`

### C1 — Body

```
Hi {{first_name}},

It was accurate when you built it. That was six weeks ago.

Every host in your fleet has drifted some amount from that baseline. Most teams find out how much when a deploy behaves unexpectedly — or an incident review asks an awkward question.

Blackglass runs scheduled scans and shows you the diff: what changed, when, how severe. Before it becomes your 2am problem.

Two minutes, no signup:
https://blackglasssec.com/demo

{{sender_first_name}}
```

### C2 — Subject options

- `re: the drift you don't know about`
- `the diff your team is missing`

### C2 — Body (4-day gap)

```
Hi {{first_name}},

Most engineering managers I talk to frame it the same way: "we know what should be there — we just don't know what is there."

The drift you can't see is the drift that causes incidents.

Blackglass makes it visible: severity-grouped findings, a triage queue for your team, and a paper trail if you need to explain it upward.

15 minutes live, or the demo does it without the scheduling overhead:
https://blackglasssec.com/demo

{{sender_first_name}}
```

### C3 — Subject options

- `last one`

### C3 — Body (5–7 day gap)

```
Hi {{first_name}},

Won't bother you again after this.

If Linux config hygiene ever lands firmly on your plate — before it pages you — Blackglass is worth 10 minutes of your time.

https://blackglasssec.com/demo

{{sender_first_name}}
```

---

## Apollo setup guide

### Step 1 — Connect a sending mailbox

1. In Apollo go to **Settings → Email Accounts** and connect the mailbox you'll send from (Google Workspace or Outlook).
2. If using a **dedicated outreach subdomain** (e.g. `outreach.blackglasssec.com`), ensure SPF, DKIM, and DMARC records are live before connecting. Apollo's docs have a per-provider DNS walkthrough.
3. Warm a new domain for at least 2–3 weeks (10–20 emails/day escalating to 50) before activating large sequences.

### Step 2 — Create a sequence

1. Go to **Sequences → New Sequence**.
2. Name it clearly: `BG-A Platform-Reliability`, `BG-B Security-Governance`, `BG-C DevOps-EngMgr`.
3. Set **schedule**: business days only, send window 8 a.m.–5 p.m. in your target timezone.
4. Add email steps with the day gaps specified in each sequence above. For each step:
   - Paste the subject line and body.
   - Replace placeholder text with Apollo's variable syntax (click **Variables** in the editor to insert the correct tokens for your workspace — they may be `{{contact.first_name}}` rather than `{{first_name}}`).
   - Leave **Reply tracking** on.
5. Set **auto-stop on reply** = yes (default). Contacts who respond are removed from the sequence automatically.

### Step 3 — Build and import your contact list

See the **List-building filter guide** section below.

1. Run an Apollo People search using the filters below.
2. Review and clean the list (remove obvious mismatches, bad emails, competitors).
3. Select contacts → **Add to Sequence** → choose your sequence.
4. Apollo will deduplicate against existing active contacts.

### Step 4 — Review before activating

- Check that all variable placeholders resolve correctly in the preview pane.
- Send yourself a test email from each step.
- Confirm the compliance footer includes your company address and opt-out link (Apollo injects this automatically if configured under **Settings → Email Settings → Footer**).
- Set a **daily send cap** per mailbox (Apollo default is 50/day for new accounts; raise gradually as domain reputation builds).
- Activate.

### Step 5 — Monitor

- Check **Sequence analytics** after 48–72 hours: open rate, reply rate, bounce rate.
- If bounce rate exceeds 3–5%, pause and clean the list.
- Move replies to your CRM or a dedicated "responded" stage in Apollo immediately — do not let them age.

---

## List-building filter guide (Apollo People search)

Use the **People** tab in Apollo. Apply filters in this priority order:

### Primary filters

| Filter | Values to use |
|--------|--------------|
| **Job title** | Platform Engineer, SRE, Site Reliability Engineer, Head of Platform, Director of Infrastructure, Infrastructure Engineer, DevOps Lead, DevOps Engineer, VP Engineering, Engineering Manager, IT Manager, IT Director, Security Engineer, Director of Security, Head of Security, CISO (≤200-person companies) |
| **Company headcount** | 30–200 (tightest signal for ICP). Expand to 200–500 for a secondary pass. |
| **Industry** | Software, SaaS, Financial Services, Healthcare Tech, eCommerce — Linux-heavy verticals. |
| **Technologies** | Filter for Linux, AWS, GCP, Azure, Ansible, Terraform, Docker, Kubernetes — indicates infra-managed hosts. |
| **Email status** | Verified or Likely-to-engage only. Exclude "Unavailable." |

### Secondary filters (narrow if list is too large)

| Filter | Value |
|--------|-------|
| **Company keywords** | linux, cloud, infrastructure, devops, platform |
| **Contact location** | USA, Canada, UK, Australia (CAN-SPAM / GDPR compliance is simpler; adjust for your legal review) |
| **Seniority** | Manager, Director, VP, C-Level, Individual Contributor (keep IC for platform/SRE roles only) |

### Do not include

- Titles without infra scope: marketing, HR, finance, legal.
- Companies with <10 employees (no Linux fleet to manage).
- Direct competitors.
- Contacts with no verified email and no LinkedIn URL.

### Suggested list size per sequence activation

Start with **50–100 contacts per sequence** for the first send. Review reply and bounce rates before scaling to 300+. Quality of targeting matters more than volume at this stage.

---
## Operational checklist (before you press “activate”)

1. **Sending domain** — Use Apollo-connected **rep inboxes** or a **dedicated outreach subdomain** with SPF/DKIM/DMARC aligned to Apollo’s docs. Warm new domains slowly.
2. **Unsubscribe** — Apollo adds compliance footers; ensure your org address and opt-out path meet **CAN-SPAM** / **GDPR** / local rules for your lists.
3. **List quality** — Prefer narrow titles (Head of Platform, Director of Infrastructure, IT Manager with Linux scope) over spraying every “CTO.”
4. **Claims** — Avoid superlatives you cannot prove. Prefer “demo,” “security page,” and “evidence exports” language that matches the live product.
5. **Replies** — Route to a monitored inbox (`NEXT_PUBLIC_MARKETING_CONTACT_EMAIL` when you move off the operator fallback).

## Refresh cadence

Review this file **quarterly** against the live site (`/`, `/product`, `/pricing`, `/security`) so sequences do not drift from what prospects actually see.
