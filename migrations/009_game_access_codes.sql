-- Migration 009: Game Access Codes for External Partners
-- System for granting game access to partners, colleagues, researchers, etc.
-- Separate from HDD patient authentication

-- ===========================================
-- GAME ACCESS CODES TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS game_access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL, -- Access code (e.g., 'PARTNER2024', 'PSIQ001')
    name VARCHAR(255) NOT NULL, -- Name/identifier (e.g., 'Dr. Garcia - Hospital Italiano')
    email VARCHAR(255), -- Optional contact email
    type VARCHAR(64) NOT NULL DEFAULT 'partner', -- 'partner', 'researcher', 'colleague', 'demo'
    notes TEXT, -- Internal notes about this code
    max_uses INTEGER, -- NULL = unlimited
    current_uses INTEGER DEFAULT 0,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE, -- NULL = no expiration
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(255), -- Who created this code
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- ===========================================
-- GAME ACCESS SESSIONS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS game_access_sessions (
    id SERIAL PRIMARY KEY,
    access_code_id INTEGER NOT NULL REFERENCES game_access_codes(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255), -- Optional name they provide on login
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE -- Optional session expiration
);

-- ===========================================
-- EXTERNAL GAME SESSIONS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS external_game_sessions (
    id SERIAL PRIMARY KEY,
    access_session_id INTEGER NOT NULL REFERENCES game_access_sessions(id),
    game_id INTEGER NOT NULL REFERENCES hdd_games(id),
    level INTEGER DEFAULT 1,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    metrics JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_access_codes_code ON game_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_game_access_codes_active ON game_access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_game_access_sessions_token ON game_access_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_game_access_sessions_code ON game_access_sessions(access_code_id);
CREATE INDEX IF NOT EXISTS idx_external_game_sessions_session ON external_game_sessions(access_session_id);

-- ===========================================
-- INSERT DEFAULT ACCESS CODES
-- ===========================================

-- Demo code for testing
INSERT INTO game_access_codes (code, name, type, notes, created_by)
VALUES
    ('DEMO2024', 'Demo - Acceso de Prueba', 'demo', 'Codigo de demostracion para pruebas internas', 'system'),
    ('PARTNER001', 'Partner Externo - Codigo 1', 'partner', 'Codigo generico para partners', 'system'),
    ('RESEARCH001', 'Investigador - Codigo 1', 'researcher', 'Codigo para investigadores academicos', 'system')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE game_access_codes IS 'Access codes for external partners, researchers, and colleagues to access games';
COMMENT ON TABLE game_access_sessions IS 'Active sessions for external users accessing games via codes';
COMMENT ON TABLE external_game_sessions IS 'Game play tracking for external users (separate from HDD patients)';
