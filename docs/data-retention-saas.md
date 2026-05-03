# SaaS audit & security event retention

`saas_audit_events` and `saas_security_events` grow with tenant activity. This repo does **not** ship an automatic purge job — operators should:

1. **Capacity plan** — index `created_at` (already default via primary key / insert order); add time-partitioning when exceeding ~tens of millions of rows.
2. **Export** — periodically export cold partitions to object storage for compliance archives (see `docs/audit-trail.md` for NDJSON digest tooling patterns).
3. **PII** — never store secrets, OTP payloads, or session tokens in `metadata` jsonb; keep opaque IDs only.

Enterprise deployments may attach lifecycle policies (e.g. 400-day hot retention + Glacier) outside this codebase.
