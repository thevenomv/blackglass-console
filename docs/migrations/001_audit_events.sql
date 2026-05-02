-- Optional Postgres sink for BLACKGLASS audit events (see AUDIT_DATABASE_URL).
-- Apply with: psql "$AUDIT_DATABASE_URL" -f docs/migrations/001_audit_events.sql

CREATE TABLE IF NOT EXISTS blackglass_audit (
  id UUID PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  actor TEXT,
  scan_id TEXT
);

CREATE INDEX IF NOT EXISTS blackglass_audit_ts_idx ON blackglass_audit (ts DESC);
CREATE INDEX IF NOT EXISTS blackglass_audit_action_idx ON blackglass_audit (action);
