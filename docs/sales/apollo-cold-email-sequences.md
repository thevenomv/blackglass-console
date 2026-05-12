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

- `re: Linux change visibility`
- `follow-up — {{company}}`

### A2 — Body (3-day gap typical)

```
Hi {{first_name}},

Quick follow-up. If {{company}} is standardizing on Linux for apps or data, the usual gap is “we know what *should* be there” vs “what is actually there today.”

Blackglass closes that gap with scheduled scans and a console built for operators — not a generic CMDB project.

If you tell me what you use for config today (Ansible, images, “mostly tribal”), I can point you at the closest screen in the demo.

{{sender_first_name}}
```

### A3 — Subject options

- `demo vs call`
- `last note — {{company}}`

### A3 — Body (5–7 day gap)

```
Hi {{first_name}},

Last ping from me.

If this is on your roadmap later, the fastest next step is the interactive demo (still no signup fiction): https://blackglasssec.com/demo

If you’d rather a 15-minute live walkthrough, reply with a couple of times that work.

{{sender_first_name}}
```

### A4 — Breakup (optional, 7+ day gap)

```
Hi {{first_name}},

I’ll assume timing isn’t right and close my file on {{company}} for now.

If Linux drift or audit-ready evidence ever becomes urgent, you can always grab time via the site or reply here.

{{sender_first_name}}
```

---

## Sequence B — Security / governance (3 touches)

**Angle:** Evidence, audit trail, and controlled change — aligned with how you describe trust on `/security`.

### B1 — Subject options

- `audit trail for Linux changes`
- `evidence without a SIEM project`

### B1 — Body

```
Hi {{first_name}},

When auditors or customers ask “what changed, when, and who approved it,” Linux fleets are often the weakest answer — not because teams are careless, but because the signal is scattered.

Blackglass is built to give a defensible story: drift findings, exports, and notifications you can wire into tools you already trust.

If {{company}} is tightening controls this year, happy to share what we ship today vs what is on the roadmap.

{{sender_first_name}}

Demo (no login): https://blackglasssec.com/demo
```

### B2 — Subject options

- `re: evidence without a SIEM project`

### B2 — Body

```
Hi {{first_name}},

One concrete thing teams use us for: scheduled baselines plus drift history so “unexpected” is visible before it is an incident.

If your title as {{title}} includes risk or compliance, I can tailor the next message to whether you care more about cloud inventory add-ons or pure Linux drift first.

{{sender_first_name}}
```

### B3 — Subject options

- `closing the loop`

### B3 — Body

```
Hi {{first_name}},

I’ll step back after this.

If you want a sharper technical read first: https://blackglasssec.com/security

If you want to talk pricing and seats: https://blackglasssec.com/pricing

Either way, thanks for the time if you got this far.

{{sender_first_name}}
```

---

## Operational checklist (before you press “activate”)

1. **Sending domain** — Use Apollo-connected **rep inboxes** or a **dedicated outreach subdomain** with SPF/DKIM/DMARC aligned to Apollo’s docs. Warm new domains slowly.
2. **Unsubscribe** — Apollo adds compliance footers; ensure your org address and opt-out path meet **CAN-SPAM** / **GDPR** / local rules for your lists.
3. **List quality** — Prefer narrow titles (Head of Platform, Director of Infrastructure, IT Manager with Linux scope) over spraying every “CTO.”
4. **Claims** — Avoid superlatives you cannot prove. Prefer “demo,” “security page,” and “evidence exports” language that matches the live product.
5. **Replies** — Route to a monitored inbox (`NEXT_PUBLIC_MARKETING_CONTACT_EMAIL` when you move off the operator fallback).

## Refresh cadence

Review this file **quarterly** against the live site (`/`, `/product`, `/pricing`, `/security`) so sequences do not drift from what prospects actually see.
