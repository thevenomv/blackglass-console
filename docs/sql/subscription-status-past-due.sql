-- Migration 008: Add 'past_due' to subscription_status enum
-- Postgres requires adding new enum values with ALTER TYPE.
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'past_due';
