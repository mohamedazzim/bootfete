-- Performance Optimization Indexes
-- Created: 2025-12-05
-- Purpose: Add indexes to improve query performance across the application

-- Event Credentials Indexes
CREATE INDEX IF NOT EXISTS idx_event_credentials_participant_user ON event_credentials(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_event_credentials_event ON event_credentials(event_id);
CREATE INDEX IF NOT EXISTS idx_event_credentials_user_event ON event_credentials(participant_user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_credentials_username ON event_credentials(event_username);
CREATE INDEX IF NOT EXISTS idx_event_credentials_test_enabled ON event_credentials(test_enabled);

-- Rounds Indexes
CREATE INDEX IF NOT EXISTS idx_rounds_event ON rounds(event_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_event_status ON rounds(event_id, status);
CREATE INDEX IF NOT EXISTS idx_rounds_start_time ON rounds(start_time);
CREATE INDEX IF NOT EXISTS idx_rounds_end_time ON rounds(end_time);

-- Questions Indexes
CREATE INDEX IF NOT EXISTS idx_questions_round ON questions(round_id);
CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(question_type);
CREATE INDEX IF NOT EXISTS idx_questions_round_number ON questions(round_id, question_number);

-- Test Attempts Indexes
CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_round ON test_attempts(round_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_round ON test_attempts(user_id, round_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_status ON test_attempts(status);
CREATE INDEX IF NOT EXISTS idx_test_attempts_round_status ON test_attempts(round_id, status);
CREATE INDEX IF NOT EXISTS idx_test_attempts_submitted_at ON test_attempts(submitted_at);

-- Answers Indexes
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt_question ON answers(attempt_id, question_id);

-- Participants Indexes
CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_event ON participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_event ON participants(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);

-- Events Indexes
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);

-- Event Admins Indexes
CREATE INDEX IF NOT EXISTS idx_event_admins_admin ON event_admins(admin_id);
CREATE INDEX IF NOT EXISTS idx_event_admins_event ON event_admins(event_id);

-- Users Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);

-- Registrations Indexes
CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_organizer_rollno ON registrations(organizer_roll_no);
CREATE INDEX IF NOT EXISTS idx_registrations_event_status ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);

-- Team Members Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_registration ON team_members(registration_id);
CREATE INDEX IF NOT EXISTS idx_team_members_rollno ON team_members(member_roll_no);

-- Event Rules Indexes
CREATE INDEX IF NOT EXISTS idx_event_rules_event ON event_rules(event_id);

-- Round Rules Indexes
CREATE INDEX IF NOT EXISTS idx_round_rules_round ON round_rules(round_id);

-- Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Email Logs Indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_type ON email_logs(template_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);

-- Reports Indexes
CREATE INDEX IF NOT EXISTS idx_reports_event ON reports(event_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_generated_by ON reports(generated_by);

-- Registration Forms Indexes
CREATE INDEX IF NOT EXISTS idx_registration_forms_slug ON registration_forms(form_slug);
CREATE INDEX IF NOT EXISTS idx_registration_forms_active ON registration_forms(is_active);
