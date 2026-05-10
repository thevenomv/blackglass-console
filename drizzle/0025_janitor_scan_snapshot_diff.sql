-- Charon: persist last successful scan snapshot + diff summary for console / webhooks.

ALTER TABLE "janitor_accounts" ADD COLUMN IF NOT EXISTS "last_scan_snapshot" jsonb;
ALTER TABLE "janitor_accounts" ADD COLUMN IF NOT EXISTS "last_scan_diff" jsonb;
