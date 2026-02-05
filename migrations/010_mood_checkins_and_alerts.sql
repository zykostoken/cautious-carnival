-- Migration: Add mood check-ins and crisis alerts tables for HDD clinical monitoring
-- These tables support the Digital Therapeutics (DTx) functionality

-- Daily mood check-ins (emocional daily tracking)
CREATE TABLE IF NOT EXISTS hdd_mood_checkins (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  mood_value INTEGER NOT NULL CHECK (mood_value >= 1 AND mood_value <= 5),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient queries by patient and date
CREATE INDEX IF NOT EXISTS idx_mood_checkins_patient_date
  ON hdd_mood_checkins(patient_id, created_at DESC);

-- Crisis alerts for professional monitoring panel
CREATE TABLE IF NOT EXISTS hdd_crisis_alerts (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- 'mood_checkin', 'game_decline', 'inactivity', 'keyword'
  reason TEXT NOT NULL,
  mood_value INTEGER,
  note TEXT,
  game_session_id INTEGER REFERENCES hdd_game_sessions(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'reviewed', 'resolved', 'escalated'
  reviewed_by INTEGER REFERENCES healthcare_professionals(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for professionals to see pending alerts
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_status
  ON hdd_crisis_alerts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crisis_alerts_patient
  ON hdd_crisis_alerts(patient_id, created_at DESC);
