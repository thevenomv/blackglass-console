# Changelog

All notable user-facing and integration-facing changes are summarized here. Internal refactors and comment-only edits are omitted unless they affect operators or integrators.

## Unreleased

### Marketing site

- **New `/tools` area** — public, no-signup, pre-scan planning tools aligned with Blackglass and Charon. Three browser-only tools ship live:
  - **Cloud Waste Estimator** (`/tools/cloud-waste-estimator`) — monthly-waste range across DigitalOcean, AWS, and GCP from rough self-reported counts (idle compute, orphaned volumes, old snapshots). Includes a downloadable cleanup checklist and an optional **POST `/api/tools/cloud-waste-report`** endpoint that emails the summary (rate-limited 5/IP/10 min, audit-logged as `tools.cloud_waste.report_requested`, optional Slack ping via `SLACK_TOOLS_LEAD_WEBHOOK_URL`).
  - **Linux Drift Risk Score** (`/tools/linux-drift-risk`) — five-question questionnaire that scores change-control posture and surfaces the three drift classes most worth watching for that fleet shape. Multiple-choice only; no free text, no telemetry.
  - **Cloud Inventory Diff Visualiser** (`/tools/cloud-inventory-diff`) — drag-drop two JSON inventory exports (the same shape Charon emits) to see a categorised structural diff (added/removed/changed) with field-level highlights. Files are parsed in-browser via the FileReader API and discarded; nothing is uploaded.
- All three tools fire `dataLayer` events (`tool_estimator_opened`, `tool_estimator_recomputed`, `tool_checklist_downloaded`, `tool_email_submitted`, `tool_demo_cta_clicked`, `tool_charon_cta_clicked`, `tool_pricing_cta_clicked`) and add `?source=tools-<slug>-<surface>` to every `/demo` link for funnel attribution.
- **Plausible Analytics** (cookie-free, no consent banner required) wired on public marketing routes only — never inside the authenticated `(app)` console. Loaded by `src/components/marketing/PlausibleScript.tsx`, gated on `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. Self-hosted instances can override the script URL via `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`. The `trackToolEvent` shim now fans every event out to both Plausible (`window.plausible(name, { props })`) and `window.dataLayer` so future providers slot in without touching component code.

### Bug fixes

- **PublicFooter hydration warning** — `new Date().getFullYear()` is now hoisted to module scope so SSR and client hydration always agree. Eliminates the React hydration warning that surfaced on every marketing page in dev tools.

### Security hardening (free tools surface)

- **Per-recipient rate limit on `/api/tools/cloud-waste-report`** — 1 submission per email address per 24h, keyed on `sha256(normalize(email))` so the rate-limit bucket holds an opaque digest, never plaintext PII. Defends against the IP-rotation mail-bomb path the per-IP guard alone couldn't cover (5/IP × N residential IPs = mailbombable). On a hit the route returns **200 OK** (not 429) so an attacker can't probe whether a victim address has been mailed recently.
- **Slack fan-out switched to Block Kit `plain_text` blocks** — eliminates the mrkdwn injection vector where a malicious `org` value of `<!channel> :rocket:` would have pinged the whole sales channel. Top-level `text` fallback is now a static, user-input-free string.
- **CSP allowlists Plausible** on both `script-src` and `connect-src` (default `https://plausible.io` plus the host parsed from `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL` when self-hosting). Without this, flipping `SECURITY_HEADERS_CSP_ENFORCE=true` would silently break analytics on launch day.
- **Inventory diff client caps uploads at 10 MB** with a friendly per-file error state. UX guardrail (FileReader runs locally; nothing to defend server-side) but stops 500 MB JSON files from locking up a tab before the parser surfaces the issue.
- **GDPR Art. 5(e) retention obligation documented** in `docs/audit-trail.md` → "PII in process-global audit rows", covering both `marketing.contact_sales_lead` and `tools.cloud_waste.report_requested`. Retention matrix per sink + right-to-erasure lookup pattern. Cross-referenced from the API route docstring.
- **Audit-log injection neutralised** — new `formatAuditDetail()` helper in `src/lib/server/audit-log.ts` JSON-escapes every value going into the `detail` string. Previously, a hostile `org` of `Acme" injected="malicious` would have escaped the `key="value"` grammar and tricked downstream log parsers; embedded newlines or ANSI escape codes (`\x1b[31m`) could have corrupted operator terminals viewing the file directly. Applied to both `POST /api/tools/cloud-waste-report` (new in this release) **and** to the pre-existing `POST /api/contact-sales` route, which had the identical vulnerability.
- **`/api/contact-sales` Slack fan-out hardened** — same Block Kit `plain_text` fix applied to the older sibling endpoint, closing an `<!channel>`-injection path via the lead `name` / `company` / `message` fields. Top-level `text` fallback is now a static notification string.
- **Deployment trust boundary documented** — `clientIp()` and `docs/http-rate-limit-budgets.md` now spell out the requirement that the edge proxy MUST strip and replace any client-supplied `x-real-ip` and `x-forwarded-for` headers. Without that stripping (DO App Platform default; nginx requires explicit `proxy_set_header` directives), an attacker can rotate `x-real-ip` per request and bypass every per-IP rate limit. Includes a one-line `curl` smoke check operators can run post-deploy.

### Integrations (breaking for strict parsers)

- **CEF (Microsoft Sentinel / generic CEF relays):** Vendor and product fields in the CEF prefix are now `Blackglass` (previously `BLACKGLASS`). Signature IDs use the prefix `Blackglass-` (e.g. `Blackglass-PRIVILEGE_ESCALATION` instead of `BLACKGLASS-PRIVILEGE_ESCALATION`). Update SIEM correlation rules or allowlists that matched the old literal strings.
- **OCSF / Security Lake:** `metadata.product.name` is now `Blackglass` (previously `BLACKGLASS`).
- **Slack / Teams / generic markdown bodies:** Phrases such as “Review in BLACKGLASS” are now “Review in Blackglass”. Webhook `User-Agent` is `Blackglass-Webhook/1.0`.

### Public API

- **GET `/api/public/demo-report`:** Default response is a sample integrity report PDF. **`?format=json`** returns the JSON payload used to render that PDF (for tooling and demos).

### Branding (no API contract change)

- User-visible product name is **Blackglass** (title case) across the console, marketing pages, PDFs, and transactional emails. Environment variable names such as `BLACKGLASS_PLAN`, `BLACKGLASS_KEY`, and `BLACKGLASS_AIRGAPPED` are unchanged.
