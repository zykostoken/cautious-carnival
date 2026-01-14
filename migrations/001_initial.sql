-- Database Migration for Clinica Jose Ingenieros
-- Run this migration using: psql $SUPABASE_DATABASE_URL -f migrations/001_initial.sql
-- Also supports: psql $NETLIFY_DATABASE_URL -f migrations/001_initial.sql

-- ===========================================
-- USER SESSIONS AND ANALYTICS TABLES
-- ===========================================

-- User sessions tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    time_on_site_seconds INTEGER DEFAULT 0,
    sections_viewed INTEGER DEFAULT 0,
    user_agent TEXT,
    referrer TEXT
);

-- Section views tracking
CREATE TABLE IF NOT EXISTS section_views (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES user_sessions(session_id),
    section_id VARCHAR(64) NOT NULL,
    viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    view_count INTEGER DEFAULT 1,
    last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, section_id)
);

-- Modal opens tracking
CREATE TABLE IF NOT EXISTS modal_opens (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES user_sessions(session_id),
    modal_id VARCHAR(64) NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Contact interactions
CREATE TABLE IF NOT EXISTS contact_interactions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES user_sessions(session_id),
    contact_type VARCHAR(32) NOT NULL, -- 'phone', 'email', 'whatsapp'
    contact_value TEXT,
    clicked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Generic events for extensibility
CREATE TABLE IF NOT EXISTS generic_events (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ===========================================
-- SURVEY RESPONSES TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    survey_id VARCHAR(64) NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(session_id, survey_id)
);

-- ===========================================
-- TELEMEDICINE TABLES
-- ===========================================

-- Telemedicine users (patients)
CREATE TABLE IF NOT EXISTS telemedicine_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(32) UNIQUE,
    full_name VARCHAR(255),
    dni VARCHAR(20),
    credit_balance INTEGER NOT NULL DEFAULT 0,
    credits_on_hold INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Credit transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    amount INTEGER NOT NULL, -- Positive for credits, negative for debits
    transaction_type VARCHAR(32) NOT NULL, -- 'credit', 'debit', 'refund', 'hold', 'release'
    payment_reference VARCHAR(255),
    session_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Video call sessions
CREATE TABLE IF NOT EXISTS video_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    session_token VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled', 'failed', 'expired'
    call_type VARCHAR(32) DEFAULT 'immediate', -- 'immediate', 'scheduled'
    credits_held INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancel_reason TEXT,
    duration_minutes INTEGER,
    professional_id INTEGER, -- For future: assigned professional
    room_id VARCHAR(255), -- Video call room identifier
    recording_url TEXT -- Optional recording
);

-- Scheduled appointments
CREATE TABLE IF NOT EXISTS scheduled_appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'completed', 'cancelled', 'no_show'
    notes TEXT,
    professional_id INTEGER, -- For future: assigned professional
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reminder_sent BOOLEAN DEFAULT FALSE
);

-- ===========================================
-- INDEXES FOR PERFORMANCE
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_user_sessions_started ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_section_views_session ON section_views(session_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_session ON survey_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_telemedicine_users_email ON telemedicine_users(email);
CREATE INDEX IF NOT EXISTS idx_telemedicine_users_phone ON telemedicine_users(phone);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user ON video_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_status ON video_sessions(status);
CREATE INDEX IF NOT EXISTS idx_video_sessions_token ON video_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_scheduled_appointments_user ON scheduled_appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_appointments_date ON scheduled_appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);

-- ===========================================
-- COMMENTS FOR DOCUMENTATION
-- ===========================================

COMMENT ON TABLE user_sessions IS 'Tracks anonymous user sessions on the website';
COMMENT ON TABLE survey_responses IS 'Stores responses to innovation/digitalization surveys';
COMMENT ON TABLE telemedicine_users IS 'Registered telemedicine patients with credit balance';
COMMENT ON TABLE video_sessions IS 'Video call sessions with pre-authorization credit holds';
COMMENT ON TABLE scheduled_appointments IS 'Future scheduled telemedicine appointments';
COMMENT ON TABLE credit_transactions IS 'Audit log of all credit movements';
