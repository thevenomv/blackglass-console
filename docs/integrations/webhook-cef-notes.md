# Webhook output: CEF and OCSF branding

If you forward Blackglass drift webhooks to **Microsoft Sentinel** (CEF over syslog/HTTP) or **AWS Security Lake** (OCSF), correlation rules may reference vendor or product strings.

As of the release documented in the root [`CHANGELOG.md`](../../CHANGELOG.md):

- **CEF prefix:** `CEF:0|Blackglass|Blackglass|1.0|…` (device vendor and product are both `Blackglass`).
- **CEF signature:** `Blackglass-<CATEGORY>` with category uppercased from the finding (e.g. `Blackglass-PRIVILEGE_ESCALATION`).
- **OCSF:** `metadata.product.name` is `Blackglass`.

Environment variables and HMAC signing are unchanged; only human-readable and CEF/OCSF **display** fields were updated from the legacy all-caps `BLACKGLASS` literal.
