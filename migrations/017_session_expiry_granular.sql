-- Migration 017: Granular session expiry rules
-- Patient sessions: 60 min
-- Professional sessions: 2hr inactivity timeout (needs last_activity column)
-- Gaming: 1hr/day per patient (enforced in app, index helps query)
-- Teleresource/video: 30 min (enforced via Daily.co room expiry)

-- Add last_activity column for professional inactivity tracking
ALTER TABLE healthcare_professionals
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;

-- Initialize last_activity from last_login for existing sessions
UPDATE healthcare_professionals
  SET last_activity = last_login
  WHERE last_activity IS NULL AND last_login IS NOT NULL;

-- Index for efficient daily gaming time queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_patient_daily
  ON hdd_game_sessions (patient_id, started_at)
  WHERE started_at >= CURRENT_DATE;

-- Index for professional inactivity checks
CREATE INDEX IF NOT EXISTS idx_professionals_last_activity
  ON healthcare_professionals (last_activity)
  WHERE is_active = TRUE AND session_token IS NOT NULL;
