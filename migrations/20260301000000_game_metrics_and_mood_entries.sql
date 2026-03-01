-- Migration: game_metrics_and_mood_entries
-- Sistema central de biometrías y selección de color post-actividad.
-- Aplicada manualmente el 2026-03-01 via Supabase MCP.

CREATE TABLE IF NOT EXISTS hdd_game_metrics (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id) ON DELETE SET NULL,
    patient_dni VARCHAR(20),
    game_slug VARCHAR(50) NOT NULL,
    session_id VARCHAR(100),
    metric_type VARCHAR(50) NOT NULL,   -- 'session_summary', 'biomet', 'color_eleccion'
    metric_value NUMERIC,
    metric_data JSONB DEFAULT '{}',
    session_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_dni ON hdd_game_metrics(patient_dni);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_game_slug   ON hdd_game_metrics(game_slug);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_created_at  ON hdd_game_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_metric_type ON hdd_game_metrics(metric_type);

CREATE TABLE IF NOT EXISTS hdd_mood_entries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id) ON DELETE SET NULL,
    patient_dni VARCHAR(20),
    color_hex VARCHAR(7),
    color_id VARCHAR(30),
    color_name VARCHAR(50),
    context_type VARCHAR(50) DEFAULT 'game',    -- 'game','telemedicina','taller','chat'
    source_activity VARCHAR(100),
    session_id VARCHAR(100),
    session_ordinal INTEGER,
    entry_type VARCHAR(30) DEFAULT 'post_activity',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_patient_dni ON hdd_mood_entries(patient_dni);
CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_created_at  ON hdd_mood_entries(created_at);
