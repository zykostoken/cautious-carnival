-- ====================================================================
-- MIGRATION: Game Sessions System
-- Purpose: Track individual game sessions with pre/post mood data
-- Date: 2026-02-13
-- ====================================================================

CREATE TABLE IF NOT EXISTS hdd_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES hdd_patients(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL CHECK (game_type IN ('pill_organizer', 'lawn_mower', 'medication_memory')),
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  session_duration_seconds INT,
  
  -- Pre-game data
  pre_chat_responses JSONB,  -- [{question: "¿Cómo estás?", answer: "Bien"}]
  
  -- Post-game data
  post_intensity VARCHAR(20) CHECK (post_intensity IN ('vivid', 'soft', 'pastel', 'dark', 'muted')),
  post_color_hex VARCHAR(7),
  
  -- Game metrics
  game_metrics JSONB,  -- Specific to each game
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_duration CHECK (session_duration_seconds IS NULL OR session_duration_seconds >= 0)
);

-- Indexes for performance
CREATE INDEX idx_game_sessions_patient ON hdd_game_sessions(patient_id);
CREATE INDEX idx_game_sessions_game_type ON hdd_game_sessions(game_type);
CREATE INDEX idx_game_sessions_started_at ON hdd_game_sessions(started_at DESC);
CREATE INDEX idx_game_sessions_color ON hdd_game_sessions(post_color_hex) WHERE post_color_hex IS NOT NULL;

-- ====================================================================
-- COOLDOWN FUNCTION: Check if patient can play
-- ====================================================================

CREATE OR REPLACE FUNCTION check_game_cooldown(
  p_patient_id UUID,
  p_game_type VARCHAR(50)
)
RETURNS TABLE(
  can_play BOOLEAN,
  reason TEXT,
  next_available_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ
) AS $$
DECLARE
  v_last_session RECORD;
  v_hours_since NUMERIC;
BEGIN
  -- Get most recent completed session for this patient and game
  SELECT * INTO v_last_session
  FROM hdd_game_sessions
  WHERE patient_id = p_patient_id 
    AND game_type = p_game_type
    AND completed_at IS NOT NULL
  ORDER BY completed_at DESC
  LIMIT 1;
  
  -- If no previous session, allow play
  IF v_last_session IS NULL THEN
    RETURN QUERY SELECT 
      true AS can_play,
      'Primera partida'::TEXT AS reason,
      NULL::TIMESTAMPTZ AS next_available_at,
      NULL::TIMESTAMPTZ AS last_played_at;
    RETURN;
  END IF;
  
  -- Calculate hours since last play
  v_hours_since := EXTRACT(EPOCH FROM (NOW() - v_last_session.completed_at)) / 3600;
  
  -- Cooldown rule: 12 hours between plays
  IF v_hours_since < 12 THEN
    RETURN QUERY SELECT 
      false AS can_play,
      'Cooldown activo - Esperá ' || ROUND(12 - v_hours_since, 1) || ' horas más'::TEXT AS reason,
      (v_last_session.completed_at + INTERVAL '12 hours')::TIMESTAMPTZ AS next_available_at,
      v_last_session.completed_at AS last_played_at;
    RETURN;
  END IF;
  
  -- Allow play
  RETURN QUERY SELECT 
    true AS can_play,
    'Listo para jugar'::TEXT AS reason,
    NULL::TIMESTAMPTZ AS next_available_at,
    v_last_session.completed_at AS last_played_at;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- VIEW: Session Analysis
-- ====================================================================

CREATE OR REPLACE VIEW v_hdd_session_analysis AS
SELECT 
    gs.id AS session_id,
    gs.patient_id,
    p.full_name AS patient_name,
    gs.game_type,
    gs.started_at,
    gs.completed_at,
    gs.session_duration_seconds,
    gs.pre_chat_responses,
    gs.post_intensity,
    gs.post_color_hex,
    cp.color_family,
    cp.psychological_tags,
    gs.game_metrics,
    -- Calculate time since last session
    LAG(gs.completed_at) OVER (
        PARTITION BY gs.patient_id, gs.game_type 
        ORDER BY gs.completed_at
    ) AS previous_session_at,
    EXTRACT(EPOCH FROM (
        gs.completed_at - LAG(gs.completed_at) OVER (
            PARTITION BY gs.patient_id, gs.game_type 
            ORDER BY gs.completed_at
        )
    )) / 3600 AS hours_since_last_play
FROM hdd_game_sessions gs
LEFT JOIN hdd_patients p ON gs.patient_id = p.id
LEFT JOIN hdd_color_psychology cp ON gs.post_color_hex = cp.color_hex
WHERE gs.completed_at IS NOT NULL
ORDER BY gs.completed_at DESC;

-- ====================================================================
-- FUNCTION: Get Patient Game Stats
-- ====================================================================

CREATE OR REPLACE FUNCTION get_patient_game_stats(p_patient_id UUID)
RETURNS TABLE(
  game_type VARCHAR(50),
  total_sessions INT,
  avg_duration_seconds INT,
  most_common_intensity VARCHAR(20),
  most_common_color_family VARCHAR(20),
  last_played_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gs.game_type,
    COUNT(*)::INT AS total_sessions,
    ROUND(AVG(gs.session_duration_seconds))::INT AS avg_duration_seconds,
    MODE() WITHIN GROUP (ORDER BY gs.post_intensity) AS most_common_intensity,
    MODE() WITHIN GROUP (ORDER BY cp.color_family) AS most_common_color_family,
    MAX(gs.completed_at) AS last_played_at
  FROM hdd_game_sessions gs
  LEFT JOIN hdd_color_psychology cp ON gs.post_color_hex = cp.color_hex
  WHERE gs.patient_id = p_patient_id
    AND gs.completed_at IS NOT NULL
  GROUP BY gs.game_type;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- TRIGGER: Update updated_at timestamp
-- ====================================================================

CREATE TRIGGER update_hdd_game_sessions_updated_at 
    BEFORE UPDATE ON hdd_game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- TRIGGER: Calculate session duration on complete
-- ====================================================================

CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    NEW.session_duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_duration_on_complete
    BEFORE UPDATE ON hdd_game_sessions
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
    EXECUTE FUNCTION calculate_session_duration();

-- ====================================================================
-- GRANT PERMISSIONS
-- ====================================================================

GRANT SELECT ON hdd_game_sessions TO authenticated;
GRANT INSERT, UPDATE ON hdd_game_sessions TO authenticated;
GRANT SELECT ON v_hdd_session_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION check_game_cooldown(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_patient_game_stats(UUID) TO authenticated;

GRANT ALL ON hdd_game_sessions TO service_role;

-- ====================================================================
-- COMPLETE
-- ====================================================================

SELECT 'Game sessions system created successfully!';
