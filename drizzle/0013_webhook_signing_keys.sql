-- Migration 0013: per-tenant rotated webhook signing keys.
--
-- Replaces the single shared WEBHOOK_SECRET env var (which stays as the
-- fallback) with per-tenant keys that can be rotated without operator
-- coordination. During rotation we keep the *previous* key valid for an
-- overlap window so receivers don't see a hard cutover; the dispatcher
-- emits both `X-Blackglass-Signature` (current) and
-- `X-Blackglass-Signature-Previous` (previous) headers while the previous
-- key is alive. After ROTATION_OVERLAP_HOURS the previous key is implicitly
-- retired (the next read drops it).
--
-- All three columns are nullable; null on every row keeps the env-var
-- fallback in place for legacy single-tenant deployments.

ALTER TABLE saas_tenant_notifications
  ADD COLUMN IF NOT EXISTS webhook_signing_key TEXT,
  ADD COLUMN IF NOT EXISTS webhook_signing_key_previous TEXT,
  ADD COLUMN IF NOT EXISTS webhook_signing_key_rotated_at TIMESTAMPTZ;
