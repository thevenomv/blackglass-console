# Changelog

All notable user-facing and integration-facing changes are summarized here. Internal refactors and comment-only edits are omitted unless they affect operators or integrators.

## Unreleased

### Integrations (breaking for strict parsers)

- **CEF (Microsoft Sentinel / generic CEF relays):** Vendor and product fields in the CEF prefix are now `Blackglass` (previously `BLACKGLASS`). Signature IDs use the prefix `Blackglass-` (e.g. `Blackglass-PRIVILEGE_ESCALATION` instead of `BLACKGLASS-PRIVILEGE_ESCALATION`). Update SIEM correlation rules or allowlists that matched the old literal strings.
- **OCSF / Security Lake:** `metadata.product.name` is now `Blackglass` (previously `BLACKGLASS`).
- **Slack / Teams / generic markdown bodies:** Phrases such as “Review in BLACKGLASS” are now “Review in Blackglass”. Webhook `User-Agent` is `Blackglass-Webhook/1.0`.

### Public API

- **GET `/api/public/demo-report`:** Default response is a sample integrity report PDF. **`?format=json`** returns the JSON payload used to render that PDF (for tooling and demos).

### Branding (no API contract change)

- User-visible product name is **Blackglass** (title case) across the console, marketing pages, PDFs, and transactional emails. Environment variable names such as `BLACKGLASS_PLAN`, `BLACKGLASS_KEY`, and `BLACKGLASS_AIRGAPPED` are unchanged.
