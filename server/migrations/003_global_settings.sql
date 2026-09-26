-- ============================================================================
-- Bootfete migration 003 — global_settings table (Phase A white-label)
-- ============================================================================
-- Creates the global_settings singleton table for white-label branding.
-- Distinct from system_settings (migration 002: notification toggles).
--
-- RUN ONCE against the database, in a single transaction.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Order-independent: works whether or not the users table exists yet.
-- Note: `npm run db:push` also creates this table from shared/schema.ts;
-- this file is for operators who migrate via psql.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS global_settings (
  id VARCHAR PRIMARY KEY DEFAULT 'global',
  app_name TEXT NOT NULL DEFAULT 'BootFete 2K26',
  organizer_name TEXT NOT NULL DEFAULT 'MCA Dept, Bishop Heber College',
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#4F46E5',
  support_email TEXT NOT NULL DEFAULT 'Not configured',
  footer_text TEXT NOT NULL DEFAULT '© 2026 BootFete. All rights reserved.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR
);

-- Add FK to users only if the users table exists (order-independent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'global_settings_updated_by_fkey'
    ) THEN
      ALTER TABLE global_settings
        ADD CONSTRAINT global_settings_updated_by_fkey
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Seed the singleton defaults row if not present (never overwrites)
INSERT INTO global_settings (id) VALUES ('global')
ON CONFLICT (id) DO NOTHING;

COMMIT;
