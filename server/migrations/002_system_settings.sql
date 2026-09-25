-- ============================================================================
-- Bootfete migration 002 — system_settings table (QA-1102)
-- ============================================================================
-- Creates the system_settings table for PostgreSQL-backed system settings.
-- Previously settings were process-memory only and did not survive restarts.
--
-- RUN ONCE against the database, in a single transaction.
-- Safe to run multiple times (IF NOT EXISTS).
-- Order-independent: works whether or not the users table exists yet.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR
);

-- Add FK to users only if the users table exists (order-independent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_updated_by_fkey'
    ) THEN
      ALTER TABLE system_settings
        ADD CONSTRAINT system_settings_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Seed default notification settings if not present
INSERT INTO system_settings (key, value) VALUES
  ('emailNotifications', 'true'::jsonb),
  ('registrationNotifications', 'true'::jsonb),
  ('eventUpdates', 'true'::jsonb),
  ('systemAlerts', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
