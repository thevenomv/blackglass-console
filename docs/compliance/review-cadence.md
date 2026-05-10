# Compliance & policy review cadence

Checklist for Obsidian Dynamics / Blackglass. Complements [data-breach-response.md](../runbooks/data-breach-response.md).

## After each production deploy

- [ ] **Migrations:** `npm run db:migrate` (or your platform equivalent) applied — new SQL under `drizzle/` is not active until then.
- [ ] **Workers:** If you use **Redis**, confirm **ops-worker** is running (retention sweep, webhooks, exports, **Charon janitor** queue; also expires **stuck async baseline jobs**).
- [ ] **Smoke:** Sign in → **Capture baseline** (or confirm job polling completes) → **Reports** → download a **PDF** → open **Legal & privacy** from the sidebar.
- [ ] **Charon (if used):** Link a sandbox cloud account → run scan → confirm findings or diff; optional: toggle **Webhook on scan** only on a test endpoint.

## At least annually

- [ ] **ICO:** Registration fee paid; entry on the ICO register still matches trading name and address.
- [ ] **Privacy / Terms / DPA:** Read against **actual** subprocessors, retention settings, and product behaviour; bump **effective dates** when you make material edits.
- [ ] **Subprocessors:** If you add or materially change a processor, update the Privacy Policy and notify customers as described there.

## Optional (when enterprise pipeline demands it)

- [ ] **Cyber insurance** — renewal and coverage summary for RFPs.
- [ ] **SOC 2** — scoping exercise if multiple prospects require it.

## Calendar

Add recurring reminders (e.g. 12 months from today) for **ICO renewal** and **policy review**. The breach runbook includes a reminder to re-read that document yearly.
