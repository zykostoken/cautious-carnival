-- Migration: initial_schema
-- Tablas existentes en producción desde el inicio del proyecto.
-- Esta migración se marca como aplicada sin ejecutarse (ya existen).

CREATE TABLE IF NOT EXISTS hdd_patients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    dni VARCHAR(20) UNIQUE,
    email VARCHAR(255),
    phone VARCHAR(50),
    birth_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hdd_activities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS hdd_login_tracking (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    patient_dni VARCHAR(20),
    login_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hdd_game_results (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    game_slug VARCHAR(50),
    score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hdd_community_posts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hdd_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES hdd_community_posts(id),
    patient_id INTEGER REFERENCES hdd_patients(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hdd_post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES hdd_community_posts(id),
    patient_id INTEGER REFERENCES hdd_patients(id),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
