-- Bootfete migration 004 — per-event branding snapshot (Phase B historical integrity)
--
-- Adds app_name / organizer_name / logo_url snapshot columns to events.
-- These are captured from global_settings at event-creation time and are the
-- event's OWN values — never a live join. Certificate, report, and email
-- generation must read the snapshot FIRST and consult live global_settings
-- only when the snapshot is absent.
--
-- BACKFILL (approximation, NOT historical truth): events that predate this
-- migration have no snapshot of the brand they were actually created under.
-- We fill them from whatever global_settings holds AT MIGRATION TIME as the
-- closest available record. This is documented here explicitly so nobody
-- mistakes the backfilled values for verified original branding.

ALTER TABLE events ADD COLUMN IF NOT EXISTS app_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_url TEXT;

UPDATE events
SET app_name = COALESCE(
      (SELECT app_name FROM global_settings WHERE id = 'global'),
      'BootFete 2K26'
    ),
    organizer_name = COALESCE(
      (SELECT organizer_name FROM global_settings WHERE id = 'global'),
      'MCA Dept, Bishop Heber College'
    ),
    logo_url = (SELECT logo_url FROM global_settings WHERE id = 'global')
WHERE app_name IS NULL OR organizer_name IS NULL;
