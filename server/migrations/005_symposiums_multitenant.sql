-- Bootfete migration 005 — multi-tenant foundation (Phase 1)
--
-- Creates the `symposiums` table and adds `symposium_id` tenant columns to
-- users, events, reports, registration_forms, and email_logs.
--
-- BACKFILL (exact, NOT an approximation): before this migration the database
-- is single-tenant — every existing row belongs to the one implicit symposium.
-- Symposium #1 ("BootFete 2K26") is seeded from global_settings and every
-- pre-existing row is attributed to it. This is provably complete, unlike
-- migration 004's branding backfill.
--
--   * users: super_admin / event_admin / registration_committee → #1.
--            ultimate_admin keeps symposium_id NULL (unscoped, sees all).
--            participant users keep NULL — their tenant context derives from
--            the event they act on (one user may join events in several
--            symposiums), so a single column cannot represent it.
--   * events / reports / registration_forms / email_logs → #1, then
--     symposium_id is set NOT NULL.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / ON CONFLICT / IS NULL guards).

-- 1. symposiums table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS symposiums (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  -- Locked URL slug (/s/:slug). Nullable here; migration 007 backfills and
  -- enforces NOT NULL + uniqueness. Populated by the seed INSERT below.
  slug text,
  organizer_name text NOT NULL,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#4F46E5',
  support_email text NOT NULL DEFAULT 'Not configured',
  footer_text text NOT NULL DEFAULT '',
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Immutable-name enforcement is by construction: there is no PUT/PATCH
-- route for symposiums anywhere in the application.

-- 2. tenant columns (added nullable; NOT NULL applied after backfill) -------
ALTER TABLE users            ADD COLUMN IF NOT EXISTS symposium_id varchar REFERENCES symposiums(id) ON DELETE RESTRICT;
ALTER TABLE events           ADD COLUMN IF NOT EXISTS symposium_id varchar REFERENCES symposiums(id) ON DELETE RESTRICT;
ALTER TABLE reports          ADD COLUMN IF NOT EXISTS symposium_id varchar REFERENCES symposiums(id) ON DELETE RESTRICT;
ALTER TABLE registration_forms ADD COLUMN IF NOT EXISTS symposium_id varchar REFERENCES symposiums(id) ON DELETE RESTRICT;
ALTER TABLE email_logs       ADD COLUMN IF NOT EXISTS symposium_id varchar REFERENCES symposiums(id) ON DELETE RESTRICT;

-- 3. seed symposium #1 from global_settings (or column defaults when the
--    singleton row is absent, e.g. fresh installs) ---------------------------
WITH seed AS (
  INSERT INTO symposiums (name, slug, organizer_name, logo_url, primary_color, support_email, footer_text)
  SELECT
    'BootFete 2K26',
    -- Locked slug derived exactly as deriveSlug() in server/routes.ts and the
    -- migration 007 backfill: "BootFete 2K26" -> "bootfete-2k26".
    'bootfete-2k26',
    COALESCE(g.organizer_name, 'MCA Dept, Bishop Heber College'),
    g.logo_url,
    COALESCE(g.primary_color, '#4F46E5'),
    COALESCE(g.support_email, 'Not configured'),
    COALESCE(g.footer_text, '')
  FROM (SELECT 1) AS one
  LEFT JOIN global_settings g ON g.id = 'global'
  ON CONFLICT (name) DO NOTHING
  RETURNING id
),
s AS (
  SELECT id FROM seed
  UNION ALL
  SELECT id FROM symposiums WHERE name = 'BootFete 2K26'
  LIMIT 1
),
-- 4. backfill ----------------------------------------------------------------
be AS (
  UPDATE events
  SET symposium_id = (SELECT id FROM s)
  WHERE symposium_id IS NULL
  RETURNING 1
),
bu AS (
  UPDATE users
  SET symposium_id = (SELECT id FROM s)
  WHERE symposium_id IS NULL
    AND role IN ('super_admin', 'event_admin', 'registration_committee')
  RETURNING 1
),
br AS (
  UPDATE reports
  SET symposium_id = (SELECT id FROM s)
  WHERE symposium_id IS NULL
  RETURNING 1
),
bf AS (
  UPDATE registration_forms
  SET symposium_id = (SELECT id FROM s)
  WHERE symposium_id IS NULL
  RETURNING 1
),
bl AS (
  UPDATE email_logs
  SET symposium_id = (SELECT id FROM s)
  WHERE symposium_id IS NULL
  RETURNING 1
)
SELECT 1;

-- 5. enforce NOT NULL (users.symposium_id intentionally stays nullable) ------
ALTER TABLE events            ALTER COLUMN symposium_id SET NOT NULL;
ALTER TABLE reports           ALTER COLUMN symposium_id SET NOT NULL;
ALTER TABLE registration_forms ALTER COLUMN symposium_id SET NOT NULL;
ALTER TABLE email_logs        ALTER COLUMN symposium_id SET NOT NULL;

-- 6. helpful indexes ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_symposium_id ON users(symposium_id);
CREATE INDEX IF NOT EXISTS idx_events_symposium_id ON events(symposium_id);
CREATE INDEX IF NOT EXISTS idx_reports_symposium_id ON reports(symposium_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_symposium_id ON email_logs(symposium_id);
