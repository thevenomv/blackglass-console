-- Charon: persist last scan outcome without wiping findings on failure.

ALTER TABLE "janitor_accounts" ADD COLUMN IF NOT EXISTS "last_scan_status" text;
ALTER TABLE "janitor_accounts" ADD COLUMN IF NOT EXISTS "last_scan_error" text;
