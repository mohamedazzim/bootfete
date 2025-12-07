-- Add organizer_college column to registrations table
-- Created: 2025-12-07
-- Purpose: Store college name for registration grouping and filtering

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS organizer_college TEXT;

-- Add index for college field to improve filtering performance
CREATE INDEX IF NOT EXISTS idx_registrations_college ON registrations(organizer_college);
