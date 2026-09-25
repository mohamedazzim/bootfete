-- Performance Optimization: Add Database Indexes
-- This migration adds indexes to improve query performance across the application

-- Registrations table indexes
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_organizer_dept ON registrations(organizer_dept);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at DESC);

-- Team members table index
CREATE INDEX IF NOT EXISTS idx_team_members_registration_id ON team_members(registration_id);

-- Participants table indexes
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_event ON participants(user_id, event_id);

-- Event credentials table indexes
CREATE INDEX IF NOT EXISTS idx_event_credentials_user_id ON event_credentials(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_event_credentials_event_id ON event_credentials(event_id);
CREATE INDEX IF NOT EXISTS idx_event_credentials_user_event ON event_credentials(participant_user_id, event_id);

-- Test attempts table indexes
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_id ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_round_id ON test_attempts(round_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_round ON test_attempts(user_id, round_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_status ON test_attempts(status);
CREATE INDEX IF NOT EXISTS idx_test_attempts_submitted_at ON test_attempts(submitted_at);

-- Answers table indexes
CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);

-- Event admins table index
CREATE INDEX IF NOT EXISTS idx_event_admins_admin_id ON event_admins(admin_id);
CREATE INDEX IF NOT EXISTS idx_event_admins_event_id ON event_admins(event_id);

-- Rounds table index
CREATE INDEX IF NOT EXISTS idx_rounds_event_id ON rounds(event_id);

-- Questions table index
CREATE INDEX IF NOT EXISTS idx_questions_round_id ON questions(round_id);

-- DB-06: hot query paths that had no index even in the .sql files
-- (per-row lookups inside N+1 loops in storage.ts)
CREATE INDEX IF NOT EXISTS idx_participant_registry_email ON participant_registry(email);
CREATE INDEX IF NOT EXISTS idx_event_winners_event_id ON event_winners(event_id);
CREATE INDEX IF NOT EXISTS idx_manual_round_entries_event_round ON manual_round_entries(event_id, round_number);
CREATE INDEX IF NOT EXISTS idx_registrations_organizer_email ON registrations(organizer_email);
