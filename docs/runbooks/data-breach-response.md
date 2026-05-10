# Data breach and personal data incident response

Internal checklist for Obsidian Dynamics Limited (Blackglass). Not legal advice; align with counsel where stakes are high.

## 1. Triage (0–2 hours)

- **Contain:** Revoke tokens, rotate keys, disable compromised accounts or features, preserve logs without destroying evidence.
- **Charon / linked clouds (if implicated):** Treat linked cloud credentials like any other long-lived secret — stop the blast radius first (pause or scale down **ops-worker** so `blackglass-janitor` and outbound cleanup cannot run; block egress to cloud APIs at the edge if you use a firewall). In Postgres, you can delete or rotate ciphertext rows in `janitor_accounts` per affected tenant under change control. Tell the customer to **revoke or rotate IAM keys / tokens on their side** and to review cloud audit logs for APIs called during the exposure window. Capture what you halted and when in the incident timeline.
- **Classify:** Personal data involved? Living individuals identifiable? Volume, sensitivity (special-category, credentials, children)?
- **Scope:** Which tenants, systems, and subprocessors? Still ongoing or contained?
- **Owner:** Name one incident lead and a comms owner.

## 2. UK GDPR / DPA 2018 — ICO notification

- If the breach is **likely to result in a risk to individuals’ rights and freedoms**, notify the **ICO without undue delay** and, where feasible, within **72 hours** of becoming aware ([ICO guidance](https://ico.org.uk/for-organisations/report-a-breach/)).
- If the risk is **high**, notify **affected individuals** without undue delay unless an exemption applies (e.g. encryption makes data unintelligible to unauthorised parties).
- Use the ICO’s **data security breach reporting** channel when ready; keep a record of what was reported and when.

## 3. Customer notification

- For **organisational customers** (controller–processor): notify the **customer’s designated security/DPO contact** as soon as the facts support a meaningful update; they may have their own 72-hour clock.
- Message should include: what happened, categories of data, likely consequences, measures taken or proposed, and a contact point.
- Track which tenants were affected and which were informed.

## 4. Subprocessors

- If a **subprocessor** (e.g. host, auth, payments) is the source, follow their incident process and obtain a written summary for your records and for customers who require it.

## 5. Aftercare

- **Root cause** and remediation (code, config, access, training).
- **Post-incident review** within two weeks; update runbook if gaps found.
- **Retention:** Store incident timeline and notifications with your compliance records (duration per your records policy).

## 6. Contacts (fill in if they change)

- **ICO:** [ico.org.uk](https://ico.org.uk) — report a breach via their online form.
- **Internal:** primary data protection contact `jamie@obsidiandynamics.co.uk`.
- **Company:** Obsidian Dynamics Limited, ICO registration ZC141175.

## 7. Annual reminder

- Add a calendar reminder to **re-read this runbook** and confirm ICO fee / registration remains current.
