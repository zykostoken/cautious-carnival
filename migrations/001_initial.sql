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

-- ===========================================
-- HDD (Hospital de Día) TABLES
-- ===========================================

-- HDD Patients - Active patients in Hospital de Día program
CREATE TABLE IF NOT EXISTS hdd_patients (
    id SERIAL PRIMARY KEY,
    dni VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    password_hash VARCHAR(255),
    admission_date DATE NOT NULL,
    discharge_date DATE,
    status VARCHAR(32) DEFAULT 'active', -- 'active', 'discharged', 'suspended'
    notes TEXT,
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    session_token VARCHAR(255),
    last_login TIMESTAMP WITH TIME ZONE
);

-- HDD Community Posts - Photos, experiences shared by patients
CREATE TABLE IF NOT EXISTS hdd_community_posts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    content TEXT NOT NULL,
    post_type VARCHAR(32) DEFAULT 'text', -- 'text', 'photo', 'experience'
    image_url TEXT,
    is_approved BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- HDD Post Comments
CREATE TABLE IF NOT EXISTS hdd_post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES hdd_community_posts(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- HDD Post Likes
CREATE TABLE IF NOT EXISTS hdd_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES hdd_community_posts(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, patient_id)
);

-- HDD Activities - Track patient participation in activities
CREATE TABLE IF NOT EXISTS hdd_activities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    day_of_week INTEGER, -- 0=Sunday, 1=Monday, etc.
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT TRUE
);

-- HDD Activity Attendance
CREATE TABLE IF NOT EXISTS hdd_attendance (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    activity_id INTEGER NOT NULL REFERENCES hdd_activities(id),
    attendance_date DATE NOT NULL,
    present BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(patient_id, activity_id, attendance_date)
);

-- Indexes for HDD tables
CREATE INDEX IF NOT EXISTS idx_hdd_patients_dni ON hdd_patients(dni);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_status ON hdd_patients(status);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_session ON hdd_patients(session_token);
CREATE INDEX IF NOT EXISTS idx_hdd_community_posts_patient ON hdd_community_posts(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_community_posts_approved ON hdd_community_posts(is_approved);
CREATE INDEX IF NOT EXISTS idx_hdd_post_comments_post ON hdd_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_hdd_attendance_patient ON hdd_attendance(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_attendance_date ON hdd_attendance(attendance_date);

-- Insert default HDD activities
INSERT INTO hdd_activities (name, description, day_of_week, start_time, end_time)
VALUES
    ('Música', 'Taller de música y expresión musical', 1, '10:00', '11:30'),
    ('Huerta', 'Actividades en la huerta orgánica', 2, '10:00', '12:00'),
    ('Carpintería', 'Taller de carpintería y manualidades', 3, '10:00', '12:00'),
    ('Cocina', 'Taller de cocina y nutrición', 4, '10:00', '12:00'),
    ('Expresión Corporal', 'Actividades de movimiento y expresión', 5, '10:00', '11:30')
ON CONFLICT DO NOTHING;

-- ===========================================
-- MERCADO PAGO PAYMENT TABLES
-- ===========================================

-- Mercado Pago Payments
CREATE TABLE IF NOT EXISTS mp_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    mp_payment_id VARCHAR(255) UNIQUE,
    mp_preference_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'refunded'
    status_detail VARCHAR(100),
    payment_type VARCHAR(50),
    payment_method VARCHAR(50),
    description TEXT,
    external_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Telemedicine Pricing Plans
CREATE TABLE IF NOT EXISTS telemedicine_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    duration_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert default telemedicine plans (updated pricing 2025)
INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes)
VALUES
    ('Consulta Inmediata', 'Videoconsulta inmediata con profesional de salud mental (~30 minutos). Acepta ARS, USD o Crypto.', 150000.00, 'ARS', 30),
    ('Consulta Diferida en el Día', 'Videoconsulta programada para el mismo día (~30 minutos). Acepta ARS, USD o Crypto.', 80000.00, 'ARS', 30)
ON CONFLICT DO NOTHING;

-- Update existing plans if they exist with old prices
UPDATE telemedicine_plans SET is_active = FALSE WHERE name IN ('Consulta Estándar', 'Consulta Extendida', 'Primera Consulta');

-- Indexes for payment tables
CREATE INDEX IF NOT EXISTS idx_mp_payments_user ON mp_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_status ON mp_payments(status);
CREATE INDEX IF NOT EXISTS idx_mp_payments_mp_id ON mp_payments(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_external_ref ON mp_payments(external_reference);

-- Comments for new tables
COMMENT ON TABLE hdd_patients IS 'Patients enrolled in Hospital de Día program';
COMMENT ON TABLE hdd_community_posts IS 'Community posts shared by HDD patients';
COMMENT ON TABLE hdd_activities IS 'Weekly activities in Hospital de Día';
COMMENT ON TABLE mp_payments IS 'Mercado Pago payment records for telemedicine';
COMMENT ON TABLE telemedicine_plans IS 'Pricing plans for telemedicine consultations';

-- ===========================================
-- TELEMEDICINE INTEREST / PRE-REGISTRATION TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS telemedicine_interest (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    session_id VARCHAR(64),
    source VARCHAR(64) DEFAULT 'web', -- 'web', 'banner', 'modal'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemedicine_interest_email ON telemedicine_interest(email);
CREATE INDEX IF NOT EXISTS idx_telemedicine_interest_created ON telemedicine_interest(created_at);

-- Add unique constraint if table exists without it (for existing deployments)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'telemedicine_interest_email_key'
    ) THEN
        ALTER TABLE telemedicine_interest ADD CONSTRAINT telemedicine_interest_email_key UNIQUE (email);
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

COMMENT ON TABLE telemedicine_interest IS 'Email registrations for telemedicine launch notifications';

-- ===========================================
-- CONSULTATIONS / INQUIRIES TABLE
-- ===========================================

-- Contact inquiries from interested people
CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    consultation_type VARCHAR(64) DEFAULT 'general', -- 'general', 'telemedicina', 'internacion', 'hdd', 'turnos'
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'read', 'responded', 'archived'
    session_id VARCHAR(64),
    is_read BOOLEAN DEFAULT FALSE,
    notes TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for consultations
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_type ON consultations(consultation_type);
CREATE INDEX IF NOT EXISTS idx_consultations_email ON consultations(email);
CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_consultations_read ON consultations(is_read);

COMMENT ON TABLE consultations IS 'Contact inquiries and questions from interested people';
