-- Migration 0007: add firewall_id to saas_sandboxes
-- Stores the DO Cloud Firewall UUID so the cleanup path can delete it.
ALTER TABLE saas_sandboxes ADD COLUMN IF NOT EXISTS firewall_id text;
