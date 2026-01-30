-- Migration 006: HDD Therapeutic Games
-- Adds tables for game sessions, scores, schedules, and progress tracking

-- ===========================================
-- HDD GAME DEFINITIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS hdd_games (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL, -- 'lawn-mower', 'medication-memory'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    therapeutic_areas TEXT[], -- ['motricidad_fina', 'planificacion', 'atencion', 'memoria']
    icon VARCHAR(10),
    difficulty_levels INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===========================================
-- HDD GAME SCHEDULE (time-based availability)
-- ===========================================

CREATE TABLE IF NOT EXISTS hdd_game_schedule (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES hdd_games(id),
    day_of_week INTEGER, -- 0=Sunday..6=Saturday, NULL=every day
    available_from TIME NOT NULL DEFAULT '08:00',
    available_until TIME NOT NULL DEFAULT '20:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===========================================
-- HDD GAME SESSIONS (individual play sessions)
-- ===========================================

CREATE TABLE IF NOT EXISTS hdd_game_sessions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    game_id INTEGER NOT NULL REFERENCES hdd_games(id),
    level INTEGER DEFAULT 1,
    score INTEGER DEFAULT 0,
    max_score INTEGER DEFAULT 0,
    duration_seconds INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    metrics JSONB DEFAULT '{}', -- game-specific metrics (errors, accuracy, reaction_time, etc.)
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ===========================================
-- HDD GAME PROGRESS (aggregate per patient per game)
-- ===========================================

CREATE TABLE IF NOT EXISTS hdd_game_progress (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    game_id INTEGER NOT NULL REFERENCES hdd_games(id),
    current_level INTEGER DEFAULT 1,
    max_level_reached INTEGER DEFAULT 1,
    total_sessions INTEGER DEFAULT 0,
    total_time_seconds INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    average_score DECIMAL(10,2) DEFAULT 0,
    last_played_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(patient_id, game_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_patient ON hdd_game_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_game ON hdd_game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_date ON hdd_game_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_hdd_game_progress_patient ON hdd_game_progress(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_schedule_game ON hdd_game_schedule(game_id);

-- ===========================================
-- INSERT DEFAULT GAMES
-- ===========================================

INSERT INTO hdd_games (slug, name, description, therapeutic_areas, icon, difficulty_levels)
VALUES
    ('lawn-mower', 'Cortadora de Cesped', 'Corta el pasto del jardin sin daniar las flores ni ensuciar la pileta. Trabaja motricidad fina, planificacion, atencion y capacidad de diferir recompensas.', ARRAY['motricidad_fina', 'planificacion', 'atencion', 'control_impulsos', 'agilidad_mental'], '🌿', 5),
    ('medication-memory', 'Memoria de Medicacion', 'Observa la receta medica y arma correctamente la dosis del dia. Estimula memoria de trabajo, atencion al detalle y responsabilidad terapeutica.', ARRAY['memoria', 'atencion', 'comprension_lectora', 'responsabilidad_terapeutica'], '💊', 5)
ON CONFLICT (slug) DO NOTHING;

-- Default schedules (games available every day during therapeutic hours)
INSERT INTO hdd_game_schedule (game_id, day_of_week, available_from, available_until)
SELECT g.id, d.day, '08:00'::TIME, '20:00'::TIME
FROM hdd_games g
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(day) -- Monday to Friday
WHERE g.slug IN ('lawn-mower', 'medication-memory')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE hdd_games IS 'Therapeutic game definitions for HDD portal';
COMMENT ON TABLE hdd_game_sessions IS 'Individual game play sessions with scores and metrics';
COMMENT ON TABLE hdd_game_progress IS 'Aggregate progress per patient per game';
COMMENT ON TABLE hdd_game_schedule IS 'Time-based availability schedule for games';

-- =============================================
-- HDD PATIENTS SEED DATA (from dox.com.ar clinical system)
-- =============================================

INSERT INTO hdd_patients (dni, full_name, phone, status, email_verified, admission_date, created_at)
VALUES
    ('17051100', 'Abregu Walter Humberto', '15540166', 'active', TRUE, CURRENT_DATE, NOW()),
    ('20716038', 'Amat Sandro Javier', '15489850', 'active', TRUE, CURRENT_DATE, NOW()),
    ('13207570', 'Arcomano Nora Estela', '2235951059', 'active', TRUE, CURRENT_DATE, NOW()),
    ('25235646', 'Arrieta Alejandro', '15499445', 'active', TRUE, CURRENT_DATE, NOW()),
    ('11345447', 'Arrivillaga Oscar', '15570771', 'active', TRUE, CURRENT_DATE, NOW()),
    ('38276142', 'Cabezas Lucas Gabriel', '15515988', 'active', TRUE, CURRENT_DATE, NOW()),
    ('21755736', 'Casas Guillermo', '15504574', 'active', TRUE, CURRENT_DATE, NOW()),
    ('24094852', 'Castro Arturo Anibal', '15613722', 'active', TRUE, CURRENT_DATE, NOW()),
    ('25927210', 'De Battista Jorgelina', '2983481077', 'active', TRUE, CURRENT_DATE, NOW()),
    ('12651036', 'Del Prette Juan Carlos', '2262621850', 'active', TRUE, CURRENT_DATE, NOW()),
    ('13207364', 'Etchemendy Norma Adriana', '2262470774', 'active', TRUE, CURRENT_DATE, NOW()),
    ('27332925', 'Gomez Leal Jorge Daniel', '539518', 'active', TRUE, CURRENT_DATE, NOW()),
    ('12130808', 'Kessler Hortensia Lidia', '15644185', 'active', TRUE, CURRENT_DATE, NOW()),
    ('44830962', 'Khulmann Diego Leonel', '15571698', 'active', TRUE, CURRENT_DATE, NOW()),
    ('16721815', 'Lozano Norma Beatriz', '15356500', 'active', TRUE, CURRENT_DATE, NOW()),
    ('28041501', 'Luayza Martha Lorena', '15564370', 'active', TRUE, CURRENT_DATE, NOW()),
    ('24444302', 'Marambio Ricardo', '2262414211', 'active', TRUE, CURRENT_DATE, NOW()),
    ('10614344', 'Peshnaski Amalia Liliana', '301214', 'active', TRUE, CURRENT_DATE, NOW()),
    ('14446656', 'Revelo Claudio Marcelo', '412953', 'active', TRUE, CURRENT_DATE, NOW()),
    ('26463141', 'Romero Natalia Raquel', '2914464421', 'active', TRUE, CURRENT_DATE, NOW()),
    ('28151900', 'Sampron Agustin Elias', '579654', 'active', TRUE, CURRENT_DATE, NOW()),
    ('18405535', 'Suarez Ana Carolina', '436214', 'active', TRUE, CURRENT_DATE, NOW()),
    ('11105752', 'Vomero Jose Luis', '15369404', 'active', TRUE, CURRENT_DATE, NOW())
ON CONFLICT (dni) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    status = 'active',
    email_verified = TRUE,
    updated_at = NOW();
