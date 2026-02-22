-- ====================================================================
-- MIGRATION 04: Unified Game Metrics + Longitudinal Views
-- All games save to hdd_game_metrics with consistent schema
-- ====================================================================

-- Ensure hdd_game_metrics exists with proper schema
CREATE TABLE IF NOT EXISTS hdd_game_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES hdd_patients(id) ON DELETE CASCADE,
  game_session_id UUID,  -- optional FK to hdd_game_sessions
  game_slug VARCHAR(60) NOT NULL,
  metric_type VARCHAR(80) NOT NULL DEFAULT 'session_complete',
  metric_value NUMERIC,
  metric_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient ON hdd_game_metrics(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_slug ON hdd_game_metrics(game_slug);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_created ON hdd_game_metrics(created_at DESC);

-- ====================================================================
-- VIEW: Per patient, per game — first, last, avg, count
-- ====================================================================
CREATE OR REPLACE VIEW v_patient_game_summary AS
SELECT
  p.id AS patient_id,
  p.dni,
  p.full_name,
  m.game_slug,
  COUNT(*) AS total_sessions,
  MIN(m.created_at) AS first_session_at,
  MAX(m.created_at) AS last_session_at,
  ROUND(AVG(m.metric_value)) AS avg_score,
  MIN(m.metric_value) AS min_score,
  MAX(m.metric_value) AS max_score,
  -- First session score (baseline)
  (SELECT metric_value FROM hdd_game_metrics
    WHERE patient_id = m.patient_id AND game_slug = m.game_slug
    AND metric_type = 'session_complete'
    ORDER BY created_at ASC LIMIT 1) AS baseline_score,
  -- Last session score
  (SELECT metric_value FROM hdd_game_metrics
    WHERE patient_id = m.patient_id AND game_slug = m.game_slug
    AND metric_type = 'session_complete'
    ORDER BY created_at DESC LIMIT 1) AS latest_score,
  -- Progress = latest - baseline
  (SELECT metric_value FROM hdd_game_metrics
    WHERE patient_id = m.patient_id AND game_slug = m.game_slug
    AND metric_type = 'session_complete'
    ORDER BY created_at DESC LIMIT 1)
  -
  (SELECT metric_value FROM hdd_game_metrics
    WHERE patient_id = m.patient_id AND game_slug = m.game_slug
    AND metric_type = 'session_complete'
    ORDER BY created_at ASC LIMIT 1) AS score_progress
FROM hdd_game_metrics m
JOIN hdd_patients p ON m.patient_id = p.id
WHERE m.metric_type = 'session_complete'
GROUP BY p.id, p.dni, p.full_name, m.game_slug, m.patient_id;

-- ====================================================================
-- VIEW: Longitudinal series per patient per game (for charts)
-- ====================================================================
CREATE OR REPLACE VIEW v_patient_longitudinal AS
SELECT
  m.patient_id,
  p.full_name,
  p.dni,
  m.game_slug,
  m.id AS metric_id,
  m.metric_value AS score,
  m.metric_data,
  m.created_at,
  -- Extract common biometric fields from metric_data
  (m.metric_data->>'hesitation_count')::INT AS hesitation_count,
  (m.metric_data->>'total_time_ms')::BIGINT AS total_time_ms,
  (m.metric_data->>'action_count')::INT AS action_count,
  -- Tremor / motor
  (m.metric_data->>'tremor_index')::NUMERIC AS tremor_index,
  -- Errors
  (m.metric_data->>'errors')::INT AS errors,
  (m.metric_data->>'placement_pct')::NUMERIC AS placement_pct,
  (m.metric_data->>'selection_score')::NUMERIC AS selection_score,
  -- Sequence (for daily-routine)
  (m.metric_data->>'sequence_score')::NUMERIC AS sequence_score,
  -- Row number for session ordering
  ROW_NUMBER() OVER (PARTITION BY m.patient_id, m.game_slug ORDER BY m.created_at) AS session_number
FROM hdd_game_metrics m
JOIN hdd_patients p ON m.patient_id = p.id
WHERE m.metric_type = 'session_complete'
ORDER BY m.patient_id, m.game_slug, m.created_at;

-- ====================================================================
-- VIEW: All patients overview (for admin list)
-- ====================================================================
CREATE OR REPLACE VIEW v_patients_overview AS
SELECT
  p.id,
  p.dni,
  p.full_name,
  p.admission_date,
  COUNT(DISTINCT m.game_slug) AS games_played,
  COUNT(m.id) AS total_sessions,
  MAX(m.created_at) AS last_activity,
  ROUND(AVG(m.metric_value)) AS overall_avg_score
FROM hdd_patients p
LEFT JOIN hdd_game_metrics m ON m.patient_id = p.id AND m.metric_type = 'session_complete'
GROUP BY p.id, p.dni, p.full_name, p.admission_date
ORDER BY last_activity DESC NULLS LAST;

-- Permissions
GRANT SELECT ON v_patient_game_summary TO anon, authenticated;
GRANT SELECT ON v_patient_longitudinal TO anon, authenticated;
GRANT SELECT ON v_patients_overview TO anon, authenticated;
GRANT ALL ON hdd_game_metrics TO anon, authenticated, service_role;

SELECT 'Unified metrics migration complete';
