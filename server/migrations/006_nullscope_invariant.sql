-- Migration 006: Phase 1 hardening — null-scope invariant + per-symposium event name uniqueness.
--
-- Part A: DB-level CHECK constraint enforcing that scoped admin roles
-- (super_admin, event_admin, registration_committee) ALWAYS carry a
-- symposium_id. NULL symposium_id is only legal for ultimate_admin
-- (unscoped by role) and participant (tenant context derives from the event).
-- This makes the application-layer role-first invariant (assertTenantScope /
-- checkTenantAccess / logNullScopeAlert) regression-proof at the data layer:
-- a future migration or code path cannot silently reintroduce null-scoped
-- admins.
--
-- Part B: UNIQUE (symposium_id, name) on events. There was never a global
-- unique constraint on events.name (verified 2026-09-27: no unique
-- constraint or index on events.name in schema or migrations 001–005), so
-- two symposiums could already share an event name. This adds the composite
-- constraint to enforce per-symposium uniqueness at the DB level (closing the
-- app-level check-then-insert race in POST /api/events) while preserving
-- cross-symposium name reuse.

-- ── Part A ──────────────────────────────────────────────────────────────

-- Pre-check: abort with a clear message if any existing scoped admin row
-- violates the invariant (should be impossible after migration 005's
-- backfill, but fail loudly rather than silently).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE role IN ('super_admin', 'event_admin', 'registration_committee')
      AND symposium_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 006 aborted: users rows with role IN (super_admin, event_admin, registration_committee) have NULL symposium_id. Backfill them first, then re-run.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_symposium_required_for_scoped_roles'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_symposium_required_for_scoped_roles
      CHECK (
        role IN ('ultimate_admin', 'participant')
        OR symposium_id IS NOT NULL
      );
  END IF;
END $$;

-- ── Part B ──────────────────────────────────────────────────────────────

-- Pre-check: abort with a clear message if duplicate (symposium_id, name)
-- pairs already exist (no global constraint ever existed, so duplicates are
-- possible in legacy data).
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT symposium_id, name
    FROM events
    GROUP BY symposium_id, name
    HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration 006 aborted: % duplicate (symposium_id, name) pairs exist in events. Dedupe them first, then re-run.', dup_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_symposium_name_unique'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_symposium_name_unique
      UNIQUE (symposium_id, name);
  END IF;
END $$;
