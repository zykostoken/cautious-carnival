-- Migration: Add color mood tracking and extended metrics for longitudinal clinical monitoring
-- Supports color-based emotional assessment without labels (clinical interpretation done by professionals)

-- Add color selection and intensity to mood check-ins
ALTER TABLE hdd_mood_checkins
  ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7),
  ADD COLUMN IF NOT EXISTS color_intensity VARCHAR(20),
  ADD COLUMN IF NOT EXISTS context VARCHAR(50) DEFAULT 'daily_checkin';

-- Game session color selections (during or after gameplay)
CREATE TABLE IF NOT EXISTS hdd_game_color_selections (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  game_session_id INTEGER REFERENCES hdd_game_sessions(id),
  color_hex VARCHAR(7) NOT NULL,
  color_intensity VARCHAR(20) NOT NULL DEFAULT 'vivid',
  context VARCHAR(50) NOT NULL DEFAULT 'during_game',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_color_patient
  ON hdd_game_color_selections(patient_id, created_at DESC);

-- Extended game metrics for detailed clinical analysis
CREATE TABLE IF NOT EXISTS hdd_game_metrics (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  game_session_id INTEGER REFERENCES hdd_game_sessions(id),
  game_slug VARCHAR(100),
  metric_type VARCHAR(50) NOT NULL,
  metric_value NUMERIC,
  metric_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_metrics_patient
  ON hdd_game_metrics(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_metrics_type
  ON hdd_game_metrics(patient_id, metric_type, created_at DESC);

-- Patient monthly summaries (auto-generated)
CREATE TABLE IF NOT EXISTS hdd_patient_monthly_summaries (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  month_year VARCHAR(7) NOT NULL,
  total_logins INTEGER DEFAULT 0,
  total_game_sessions INTEGER DEFAULT 0,
  total_game_time_seconds INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  avg_mood NUMERIC(3,1),
  mood_trend VARCHAR(20),
  color_distribution JSONB,
  game_performance JSONB,
  interaction_summary JSONB,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(patient_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_summary_patient
  ON hdd_patient_monthly_summaries(patient_id, month_year DESC);

-- Session interaction tracking (login/logout, page views, feature usage)
CREATE TABLE IF NOT EXISTS hdd_interaction_log (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_log_patient
  ON hdd_interaction_log(patient_id, created_at DESC);

-- Notification preferences and log for admin alerts
CREATE TABLE IF NOT EXISTS hdd_admin_notifications (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50) NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  recipient_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_status
  ON hdd_admin_notifications(status, created_at DESC);
