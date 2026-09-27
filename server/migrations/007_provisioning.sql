-- Migration 007: Phase 2 provisioning — symposium slug + forced password change.
--
-- Part A: `symposiums.slug` — locked, auto-derived URL slug for public
-- per-symposium landing pages (/s/:slug). Immutable after creation (no
-- update route may ever touch it; enforced by application convention, same
-- as `name`). Derived from the name ("BootFete 2K26" → "bootfete-2k26");
-- collisions get a numeric suffix.
--
-- Part B: `users.must_change_password` — staff accounts provisioned with a
-- generated password must change it on first login. Defaults false; set
-- true at creation/reset, cleared when the user sets their own password.

-- ── Part A: slug ────────────────────────────────────────────────────────

ALTER TABLE symposiums ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: derive slugs for rows that predate this migration.
DO $$
DECLARE
  r RECORD;
  base_slug text;
  candidate text;
  suffix integer;
BEGIN
  FOR r IN SELECT id, name FROM symposiums WHERE slug IS NULL LOOP
    base_slug := regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
    IF base_slug = '' THEN
      base_slug := 'symposium';
    END IF;
    candidate := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM symposiums WHERE slug = candidate AND id <> r.id) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE symposiums SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce NOT NULL + uniqueness (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM symposiums WHERE slug IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 007 aborted: symposiums rows with NULL slug remain after backfill.';
  END IF;
END $$;

ALTER TABLE symposiums ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'symposiums_slug_unique'
  ) THEN
    ALTER TABLE symposiums ADD CONSTRAINT symposiums_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- ── Part B: must_change_password ────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
