-- Migration 018: Professional resource usage audit log
-- Tracks which professional uses what resource, how much, and with which patient
-- Essential for compliance reporting and finhealthtech analytics

CREATE TABLE IF NOT EXISTS professional_audit_log (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
  professional_email VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  -- action_type values:
  --   'view_patient'       - viewed patient detail/metrics
  --   'update_patient'     - modified patient record
  --   'add_patient'        - created new patient
  --   'discharge_patient'  - discharged patient
  --   'readmit_patient'    - readmitted patient
  --   'video_session'      - initiated video consultation
  --   'view_resources'     - accessed resource library
  --   'add_resource'       - created a new resource
  --   'view_activities'    - accessed activities list
  --   'add_activity'       - created an activity
  --   'view_game_stats'    - viewed game statistics
  --   'view_patient_metrics' - viewed patient metrics/charts
  --   'bulk_import'        - bulk patient import
  --   'reset_password'     - reset patient password
  --   'consultation_response' - responded to consultation
  resource_type VARCHAR(50),
  -- resource_type: 'patient', 'video', 'resource', 'activity', 'game_stats', 'consultation'
  patient_id INTEGER REFERENCES hdd_patients(id),
  patient_name VARCHAR(255),
  details JSONB DEFAULT '{}',
  duration_seconds INTEGER,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_professional ON professional_audit_log (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON professional_audit_log (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON professional_audit_log (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_date ON professional_audit_log (created_at DESC);

-- View: Professional usage summary (for admin dashboard)
CREATE OR REPLACE VIEW v_professional_usage_summary AS
SELECT
  p.id AS professional_id,
  p.full_name AS professional_name,
  p.email,
  p.specialty,
  COUNT(DISTINCT a.id) AS total_actions,
  COUNT(DISTINCT CASE WHEN a.action_type = 'view_patient' THEN a.patient_id END) AS patients_viewed,
  COUNT(CASE WHEN a.action_type = 'video_session' THEN 1 END) AS video_sessions,
  COUNT(CASE WHEN a.action_type LIKE 'update%' OR a.action_type LIKE 'add%' THEN 1 END) AS modifications,
  COALESCE(SUM(a.duration_seconds) FILTER (WHERE a.action_type = 'video_session'), 0) AS total_video_seconds,
  MAX(a.created_at) AS last_activity,
  MIN(a.created_at) AS first_activity,
  -- Actions in last 7 days
  COUNT(CASE WHEN a.created_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS actions_last_7d,
  COUNT(CASE WHEN a.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS actions_last_30d
FROM healthcare_professionals p
LEFT JOIN professional_audit_log a ON a.professional_id = p.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.full_name, p.email, p.specialty;

-- View: Professional-Patient interaction summary
CREATE OR REPLACE VIEW v_professional_patient_interactions AS
SELECT
  a.professional_id,
  p_prof.full_name AS professional_name,
  a.patient_id,
  a.patient_name,
  COUNT(*) AS total_interactions,
  COUNT(CASE WHEN a.action_type = 'video_session' THEN 1 END) AS video_sessions,
  COUNT(CASE WHEN a.action_type = 'view_patient_metrics' THEN 1 END) AS metrics_reviews,
  COUNT(CASE WHEN a.action_type = 'update_patient' THEN 1 END) AS record_updates,
  COALESCE(SUM(a.duration_seconds) FILTER (WHERE a.action_type = 'video_session'), 0) AS total_video_seconds,
  MIN(a.created_at) AS first_interaction,
  MAX(a.created_at) AS last_interaction
FROM professional_audit_log a
JOIN healthcare_professionals p_prof ON p_prof.id = a.professional_id
WHERE a.patient_id IS NOT NULL
GROUP BY a.professional_id, p_prof.full_name, a.patient_id, a.patient_name
ORDER BY MAX(a.created_at) DESC;

-- Permissions
GRANT SELECT, INSERT ON professional_audit_log TO anon, authenticated;
GRANT USAGE ON SEQUENCE professional_audit_log_id_seq TO anon, authenticated;
GRANT SELECT ON v_professional_usage_summary TO anon, authenticated;
GRANT SELECT ON v_professional_patient_interactions TO anon, authenticated;
