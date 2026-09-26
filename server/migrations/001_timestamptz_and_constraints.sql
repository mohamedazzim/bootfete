-- ============================================================================
-- Bootfete migration 001 — round-2 audit remediation (C2, H6, H7, M2, M3, M7, M23)
-- ============================================================================
-- RUN ONCE against the production database, in a single transaction, during a
-- maintenance window. NOT YET RUN against any live database (no live DB is
-- reachable from the build environment) — the deploy operator must run it
-- explicitly with psql. Do NOT rely on `npm run db:push` for this: db:push is
-- interactive and will hang awaiting confirmation in automated deploys.
--
-- Part A: convert all 39 timestamp columns to timestamptz (round-2 C2).
--   ASSUMPTION — VERIFY BEFORE RUNNING: legacy `timestamp` (without time
--   zone) values were written as UTC. Drizzle serializes JS Dates as UTC ISO
--   strings, and `timestamp` columns interpret them in the *session* time
--   zone, so if the production Postgres `timezone` setting was UTC (the
--   common default), stored values ARE UTC and `AT TIME ZONE 'UTC'` is
--   correct. Verify with:
--     SHOW timezone;
--     SELECT started_at FROM test_attempts ORDER BY started_at DESC LIMIT 5;
--   and compare against known exam wall-clock times. If legacy data is in a
--   local zone (e.g. Asia/Kolkata), replace 'UTC' below with that zone name.
--
-- Part B: new uniqueness + integrity constraints (H6, H7, M2, M3).
--   Each block first FAILS LOUDLY (RAISE EXCEPTION) when existing duplicate
--   or invalid rows would violate the new constraint, so the operator can
--   dedupe/clean data and re-run instead of silently corrupting anything.
--
-- Part C: hot-path and retention indexes (M1, M7, M23).
-- ============================================================================

BEGIN;

-- ============================ Part A: timestamptz ============================
ALTER TABLE users ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE events ALTER COLUMN start_date TYPE timestamptz USING start_date AT TIME ZONE 'UTC';
ALTER TABLE events ALTER COLUMN end_date TYPE timestamptz USING end_date AT TIME ZONE 'UTC';
ALTER TABLE events ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE events ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE event_admins ALTER COLUMN assigned_at TYPE timestamptz USING assigned_at AT TIME ZONE 'UTC';
ALTER TABLE event_rules ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE event_rules ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN start_time TYPE timestamptz USING start_time AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN end_time TYPE timestamptz USING end_time AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN ended_at TYPE timestamptz USING ended_at AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE rounds ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE round_rules ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE round_rules ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE questions ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE questions ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE participants ALTER COLUMN registered_at TYPE timestamptz USING registered_at AT TIME ZONE 'UTC';
ALTER TABLE test_attempts ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC';
ALTER TABLE test_attempts ALTER COLUMN submitted_at TYPE timestamptz USING submitted_at AT TIME ZONE 'UTC';
ALTER TABLE test_attempts ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC';
ALTER TABLE answers ALTER COLUMN answered_at TYPE timestamptz USING answered_at AT TIME ZONE 'UTC';
ALTER TABLE reports ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE registration_forms ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE registration_forms ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE registrations ALTER COLUMN confirmed_at TYPE timestamptz USING confirmed_at AT TIME ZONE 'UTC';
ALTER TABLE registrations ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE registrations ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE team_members ALTER COLUMN added_at TYPE timestamptz USING added_at AT TIME ZONE 'UTC';
ALTER TABLE participant_registry ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE participant_registry ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE event_credentials ALTER COLUMN enabled_at TYPE timestamptz USING enabled_at AT TIME ZONE 'UTC';
ALTER TABLE event_credentials ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE audit_logs ALTER COLUMN timestamp TYPE timestamptz USING timestamp AT TIME ZONE 'UTC';
ALTER TABLE email_logs ALTER COLUMN sent_at TYPE timestamptz USING sent_at AT TIME ZONE 'UTC';
ALTER TABLE manual_round_entries ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
ALTER TABLE manual_round_entries ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE event_winners ALTER COLUMN declared_at TYPE timestamptz USING declared_at AT TIME ZONE 'UTC';

-- ============================ Part B: constraints ============================

-- H6: one credential row per (user, event) — makes credential creation idempotent
-- Pre-check: abort if duplicates exist for event_credentials_user_event_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT participant_user_id, event_id
    FROM event_credentials
    
    GROUP BY participant_user_id, event_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'event_credentials_user_event_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_credentials_user_event_unique') THEN
    ALTER TABLE event_credentials ADD CONSTRAINT event_credentials_user_event_unique UNIQUE (participant_user_id, event_id);
  END IF;
END $$;

-- H7: cancelled registrations must not block re-registration.
-- Drop the old all-status unique constraint and replace it with a partial
-- unique index covering only non-cancelled rows.
-- Pre-check: abort if duplicates exist for registrations_event_organizer_active_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, organizer_roll_no
    FROM registrations
    WHERE status <> 'cancelled'
    GROUP BY event_id, organizer_roll_no
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'registrations_event_organizer_active_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_event_organizer_unique') THEN
    ALTER TABLE registrations DROP CONSTRAINT registrations_event_organizer_unique;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_organizer_active_unique
  ON registrations (event_id, organizer_roll_no)
  WHERE status <> 'cancelled';

-- M2: composite uniques against double-submits / concurrent inserts
-- Pre-check: abort if duplicates exist for event_winners_event_position_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, position
    FROM event_winners
    
    GROUP BY event_id, position
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'event_winners_event_position_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_winners_event_position_unique') THEN
    ALTER TABLE event_winners ADD CONSTRAINT event_winners_event_position_unique UNIQUE (event_id, position);
  END IF;
END $$;
-- Pre-check: abort if duplicates exist for event_winners_event_participant_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, participant_user_id
    FROM event_winners
    
    GROUP BY event_id, participant_user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'event_winners_event_participant_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_winners_event_participant_unique') THEN
    ALTER TABLE event_winners ADD CONSTRAINT event_winners_event_participant_unique UNIQUE (event_id, participant_user_id);
  END IF;
END $$;
-- Pre-check: abort if duplicates exist for event_admins_event_admin_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, admin_id
    FROM event_admins
    
    GROUP BY event_id, admin_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'event_admins_event_admin_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_admins_event_admin_unique') THEN
    ALTER TABLE event_admins ADD CONSTRAINT event_admins_event_admin_unique UNIQUE (event_id, admin_id);
  END IF;
END $$;
-- Pre-check: abort if duplicates exist for questions_round_number_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT round_id, question_number
    FROM questions
    
    GROUP BY round_id, question_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'questions_round_number_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_round_number_unique') THEN
    ALTER TABLE questions ADD CONSTRAINT questions_round_number_unique UNIQUE (round_id, question_number);
  END IF;
END $$;
-- Pre-check: abort if duplicates exist for rounds_event_number_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, round_number
    FROM rounds
    
    GROUP BY event_id, round_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'rounds_event_number_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_event_number_unique') THEN
    ALTER TABLE rounds ADD CONSTRAINT rounds_event_number_unique UNIQUE (event_id, round_number);
  END IF;
END $$;
-- Pre-check: abort if duplicates exist for team_members_registration_roll_unique
DO $$
BEGIN
  IF EXISTS (
    SELECT registration_id, member_roll_no
    FROM team_members
    
    GROUP BY registration_id, member_roll_no
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 001 aborted: duplicate rows violate %. Dedupe the rows first, then re-run.', 'team_members_registration_roll_unique';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_members_registration_roll_unique') THEN
    ALTER TABLE team_members ADD CONSTRAINT team_members_registration_roll_unique UNIQUE (registration_id, member_roll_no);
  END IF;
END $$;

-- M3: real CHECK constraints on status columns (Drizzle varchar({enum}) is TS-only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rounds WHERE NOT (status IN ('not_started','in_progress','paused','completed'))) THEN
    RAISE EXCEPTION 'Migration 001 aborted: rounds has rows violating %. Fix the status values first, then re-run.', 'rounds_status_check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_status_check') THEN
    ALTER TABLE rounds ADD CONSTRAINT rounds_status_check CHECK (status IN ('not_started','in_progress','paused','completed'));
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM test_attempts WHERE NOT (status IN ('in_progress','completed','auto_submitted','disqualified','expired'))) THEN
    RAISE EXCEPTION 'Migration 001 aborted: test_attempts has rows violating %. Fix the status values first, then re-run.', 'test_attempts_status_check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_attempts_status_check') THEN
    -- 'expired' is written by examTimerService.assertAttemptNotExpired on every
    -- timer-expiry auto-submit; omitting it would turn those submits into 500s.
    ALTER TABLE test_attempts ADD CONSTRAINT test_attempts_status_check CHECK (status IN ('in_progress','completed','auto_submitted','disqualified','expired'));
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM registrations WHERE NOT (status IN ('pending','confirmed','cancelled'))) THEN
    RAISE EXCEPTION 'Migration 001 aborted: registrations has rows violating %. Fix the status values first, then re-run.', 'registrations_status_check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_status_check') THEN
    ALTER TABLE registrations ADD CONSTRAINT registrations_status_check CHECK (status IN ('pending','confirmed','cancelled'));
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM participants WHERE NOT (status IN ('registered','completed','disqualified'))) THEN
    RAISE EXCEPTION 'Migration 001 aborted: participants has rows violating %. Fix the status values first, then re-run.', 'participants_status_check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participants_status_check') THEN
    ALTER TABLE participants ADD CONSTRAINT participants_status_check CHECK (status IN ('registered','completed','disqualified'));
  END IF;
END $$;

-- ============================ Part C: indexes ============================
-- M7: retention-range indexes for the append-only log tables
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs (sent_at);
-- M1: stale-pending sweep predicate
CREATE INDEX IF NOT EXISTS idx_registrations_status_created ON registrations (status, created_at);
-- M23: functional indexes so the dept-cap count queries inside the advisory-lock
-- window can use an index instead of seq-scanning with UPPER(TRIM(...)) predicates
CREATE INDEX IF NOT EXISTS idx_registrations_dept_cap ON registrations
  (UPPER(TRIM(organizer_dept)), UPPER(TRIM(organizer_college)))
  WHERE status IN ('confirmed','pending');
CREATE INDEX IF NOT EXISTS idx_team_members_dept_norm ON team_members (UPPER(TRIM(member_dept)));

COMMIT;
-- End of migration 001.
