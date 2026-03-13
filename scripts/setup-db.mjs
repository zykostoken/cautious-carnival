#!/usr/bin/env node
// =============================================================================
// SEC-012 NOTE: This file is BOOTSTRAP-ONLY for initial DB setup.
// For schema changes, ALWAYS create a new migration in migrations/ directory.
// The build command (npm run build) runs: setup-db.mjs THEN migrate.mjs
// setup-db.mjs = CREATE IF NOT EXISTS (idempotent bootstrap)
// migrate.mjs  = Versioned migrations with checksum tracking (source of truth)
// =============================================================================
// Database setup script for Clinica Jose Ingenieros
// Run this script during build to create tables if they don't exist
// Uses Supabase PostgreSQL

import postgres from "postgres";
import dns from "dns";

// Force IPv4 resolution to avoid Netlify build IPv6 connectivity issues
dns.setDefaultResultOrder('ipv4first');

const migrationSQL = `
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
    contact_type VARCHAR(32) NOT NULL,
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

-- Survey responses
CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    survey_id VARCHAR(64) NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(session_id, survey_id)
);

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
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    payment_reference VARCHAR(255),
    session_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Video call sessions
CREATE TABLE IF NOT EXISTS video_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    session_token VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    call_type VARCHAR(32) DEFAULT 'immediate',
    credits_held INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancel_reason TEXT,
    duration_minutes INTEGER,
    professional_id INTEGER,
    room_id VARCHAR(255),
    recording_url TEXT
);

-- Scheduled appointments
CREATE TABLE IF NOT EXISTS scheduled_appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    professional_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reminder_sent BOOLEAN DEFAULT FALSE
);

-- Performance indexes
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

-- Healthcare professionals (psychiatrists, psychologists, etc.)
CREATE TABLE IF NOT EXISTS healthcare_professionals (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(100) NOT NULL DEFAULT 'Psiquiatría',
    license_number VARCHAR(50),
    phone VARCHAR(32),
    whatsapp VARCHAR(32),
    is_active BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    verification_expires TIMESTAMP WITH TIME ZONE,
    max_concurrent_calls INTEGER DEFAULT 1,
    current_calls INTEGER DEFAULT 0,
    notify_email BOOLEAN DEFAULT TRUE,
    notify_whatsapp BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    session_token VARCHAR(255)
);

-- Add email verification columns to healthcare_professionals if they don't exist (migration)
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;

-- MFA/TOTP columns (ReNaPDiS compliance)
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN DEFAULT TRUE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS refeps_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS refeps_verification_date TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS sisa_id VARCHAR(32);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS matricula_provincial VARCHAR(32);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS matricula_nacional VARCHAR(32);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ;

-- MFA challenge log
CREATE TABLE IF NOT EXISTS mfa_challenge_log (
    id SERIAL PRIMARY KEY,
    professional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    challenge_type VARCHAR(16) NOT NULL DEFAULT 'totp',
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenge_professional ON mfa_challenge_log(professional_id, created_at DESC);

-- Call queue for managing incoming call requests
CREATE TABLE IF NOT EXISTS call_queue (
    id SERIAL PRIMARY KEY,
    video_session_id INTEGER NOT NULL REFERENCES video_sessions(id),
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    patient_name VARCHAR(255),
    patient_email VARCHAR(255),
    patient_phone VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    priority INTEGER DEFAULT 0,
    assigned_professional_id INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE,
    answered_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Notification log for tracking sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    recipient_type VARCHAR(32) NOT NULL,
    recipient_id INTEGER NOT NULL,
    channel VARCHAR(32) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    message_type VARCHAR(64) NOT NULL,
    message_content TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    external_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Bulletin board / announcements
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_name VARCHAR(100),
    type VARCHAR(32) DEFAULT 'info',
    color VARCHAR(20) DEFAULT '#e8dcc8',
    is_active BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    show_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    show_until TIMESTAMP WITH TIME ZONE,
    created_by INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Add author_name and color columns to announcements if they don't exist (migration)
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_name VARCHAR(100);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#e8dcc8';

-- Indexes for healthcare_professionals
CREATE INDEX IF NOT EXISTS idx_healthcare_professionals_email ON healthcare_professionals(email);
CREATE INDEX IF NOT EXISTS idx_healthcare_professionals_available ON healthcare_professionals(is_available);
CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status);
CREATE INDEX IF NOT EXISTS idx_call_queue_professional ON call_queue(assigned_professional_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, show_from, show_until);

-- =============================================
-- HDD (Hospital de Día) TABLES
-- =============================================

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
    status VARCHAR(32) DEFAULT 'active',
    notes TEXT,
    photo_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    verification_expires TIMESTAMP WITH TIME ZONE,
    username VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    session_token VARCHAR(255),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Add email verification columns to hdd_patients if they don't exist (migration)
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- HDD Community Posts - Photos, experiences shared by patients
CREATE TABLE IF NOT EXISTS hdd_community_posts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    content TEXT NOT NULL,
    post_type VARCHAR(32) DEFAULT 'text',
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
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT TRUE
);

-- Add missing columns to hdd_activities (audit finding #4)
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS location VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS professional VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================
-- OBRAS SOCIALES & SERVICE PLANS (audit finding #3)
-- =============================================
CREATE TABLE IF NOT EXISTS obras_sociales (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    billing_address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    plan_type VARCHAR(32) NOT NULL,
    description TEXT,
    price_ars DECIMAL(12, 2) DEFAULT 0,
    price_usd DECIMAL(10, 2) DEFAULT 0,
    billing_period VARCHAR(16) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_entitlements (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    service_type VARCHAR(32) NOT NULL,
    max_per_month INTEGER,
    max_per_week INTEGER,
    is_included BOOLEAN DEFAULT TRUE,
    requires_prescription BOOLEAN DEFAULT FALSE,
    notes TEXT,
    UNIQUE(plan_id, service_type)
);

CREATE TABLE IF NOT EXISTS patient_plans (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    obra_social_id INTEGER REFERENCES obras_sociales(id),
    obra_social_member_number VARCHAR(64),
    plan_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    payment_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_usage (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    service_type VARCHAR(32) NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    prescribed_by INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    service_type VARCHAR(32) NOT NULL,
    diagnosis TEXT,
    indication TEXT NOT NULL,
    frequency VARCHAR(64),
    max_sessions INTEGER,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    status VARCHAR(32) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_usage_monthly ON service_usage(patient_id, service_type, usage_date);

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

-- HDD Login Tracking - Tracks patient login sessions and interactions for cognitive metrics
CREATE TABLE IF NOT EXISTS hdd_login_tracking (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    logout_at TIMESTAMP WITH TIME ZONE,
    session_duration_minutes INTEGER,
    ip_address VARCHAR(50),
    user_agent TEXT,
    pages_visited INTEGER DEFAULT 0,
    activities_completed INTEGER DEFAULT 0,
    interactions JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for HDD login tracking
CREATE INDEX IF NOT EXISTS idx_hdd_login_patient ON hdd_login_tracking(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_login_date ON hdd_login_tracking(login_at);

-- Ensure hdd_activities has the weekly schedule columns
-- (migrate.mts may have created this table with a different schema as an activity log)
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Insert default HDD activities
INSERT INTO hdd_activities (name, description, day_of_week, start_time, end_time)
VALUES
    ('Música', 'Taller de música y expresión musical', 1, '10:00', '11:30'),
    ('Huerta', 'Actividades en la huerta orgánica', 2, '10:00', '12:00'),
    ('Carpintería', 'Taller de carpintería y manualidades', 3, '10:00', '12:00'),
    ('Cocina', 'Taller de cocina y nutrición', 4, '10:00', '12:00'),
    ('Expresión Corporal', 'Actividades de movimiento y expresión', 5, '10:00', '11:30')
ON CONFLICT DO NOTHING;

-- =============================================
-- MERCADO PAGO PAYMENT TABLES
-- =============================================

-- Mercado Pago Payments
CREATE TABLE IF NOT EXISTS mp_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    mp_payment_id VARCHAR(255) UNIQUE,
    mp_preference_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    status VARCHAR(32) DEFAULT 'pending',
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

-- Insert default telemedicine plans (on-demand pricing by time slot)
INSERT INTO telemedicine_plans (name, description, price, duration_minutes)
VALUES
    ('Consulta Diurna (09-13hs)', 'Videoconsulta on-demand 09:00-13:00 hs', 120000.00, 30),
    ('Consulta Vespertina (13-20hs)', 'Videoconsulta on-demand 13:00-20:00 hs', 150000.00, 30),
    ('Consulta Nocturna (20-09hs)', 'Videoconsulta on-demand 20:00-09:00 hs', 200000.00, 30)
ON CONFLICT DO NOTHING;

-- Ensure video_sessions has payment_reference (added by migrate.mts)
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);

-- Indexes for payment tables
CREATE INDEX IF NOT EXISTS idx_mp_payments_user ON mp_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_status ON mp_payments(status);
CREATE INDEX IF NOT EXISTS idx_mp_payments_mp_id ON mp_payments(mp_payment_id);

-- =============================================
-- CONSULTATIONS / INQUIRIES TABLE
-- =============================================

-- Contact inquiries from interested people
CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    consultation_type VARCHAR(64) DEFAULT 'general',
    status VARCHAR(32) DEFAULT 'pending',
    session_id VARCHAR(64),
    is_read BOOLEAN DEFAULT FALSE,
    notes TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure consultations has columns from migrate.mts schema
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS subject VARCHAR(255) DEFAULT 'Consulta General';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Telemedicine interest / pre-registration for service launch notifications
CREATE TABLE IF NOT EXISTS telemedicine_interest (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    full_name VARCHAR(255),
    session_id VARCHAR(64),
    source VARCHAR(64) DEFAULT 'web',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Ensure telemedicine_interest has all columns (migrate.mts creates with fewer columns)
ALTER TABLE telemedicine_interest ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE telemedicine_interest ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE telemedicine_interest ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE telemedicine_interest ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE telemedicine_interest ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);

-- Indexes for consultations
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_type ON consultations(consultation_type);
CREATE INDEX IF NOT EXISTS idx_consultations_email ON consultations(email);
CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at);
CREATE INDEX IF NOT EXISTS idx_telemedicine_interest_email ON telemedicine_interest(email);
CREATE INDEX IF NOT EXISTS idx_telemedicine_interest_created ON telemedicine_interest(created_at);

-- Add unique constraint on email if not exists (for telemedicine_interest)
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

-- =============================================
-- HDD THERAPEUTIC GAMES TABLES
-- =============================================

-- Game definitions
CREATE TABLE IF NOT EXISTS hdd_games (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    therapeutic_areas TEXT[],
    icon VARCHAR(10),
    difficulty_levels INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Game schedule (time-based availability)
CREATE TABLE IF NOT EXISTS hdd_game_schedule (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES hdd_games(id),
    day_of_week INTEGER,
    available_from TIME NOT NULL DEFAULT '08:00',
    available_until TIME NOT NULL DEFAULT '20:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Game sessions (individual play sessions)
CREATE TABLE IF NOT EXISTS hdd_game_sessions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
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

-- Game progress (aggregate per patient per game)
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

-- Indexes for game tables
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_patient ON hdd_game_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_game ON hdd_game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_sessions_date ON hdd_game_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_hdd_game_progress_patient ON hdd_game_progress(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_schedule_game ON hdd_game_schedule(game_id);

-- Insert default games
INSERT INTO hdd_games (slug, name, description, therapeutic_areas, icon, difficulty_levels)
VALUES
    ('lawn-mower', 'Cortadora de Cesped', 'Corta el pasto del jardin sin daniar las flores ni ensuciar la pileta. Trabaja motricidad fina, planificacion, atencion y capacidad de diferir recompensas.', ARRAY['motricidad_fina', 'planificacion', 'atencion', 'control_impulsos', 'agilidad_mental'], '🌿', 5),
    ('medication-memory', 'Memoria de Medicacion', 'Observa la receta medica y arma correctamente la dosis del dia. Estimula memoria de trabajo, atencion al detalle y responsabilidad terapeutica.', ARRAY['memoria', 'atencion', 'comprension_lectora', 'responsabilidad_terapeutica'], '💊', 5)
ON CONFLICT (slug) DO NOTHING;

-- Default schedules (games available Monday-Friday 08:00-20:00)
INSERT INTO hdd_game_schedule (game_id, day_of_week, available_from, available_until)
SELECT g.id, d.day, '08:00'::TIME, '20:00'::TIME
FROM hdd_games g
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(day)
WHERE g.slug IN ('lawn-mower', 'medication-memory')
ON CONFLICT DO NOTHING;

-- =============================================
-- GAME ACCESS CODES FOR EXTERNAL PARTNERS
-- =============================================

-- Access codes table for partners, researchers, colleagues
CREATE TABLE IF NOT EXISTS game_access_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    type VARCHAR(64) NOT NULL DEFAULT 'partner',
    notes TEXT,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Sessions for external game access
CREATE TABLE IF NOT EXISTS game_access_sessions (
    id SERIAL PRIMARY KEY,
    access_code_id INTEGER NOT NULL REFERENCES game_access_codes(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Game sessions for external users
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

-- Indexes for game access
CREATE INDEX IF NOT EXISTS idx_game_access_codes_code ON game_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_game_access_codes_active ON game_access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_game_access_sessions_token ON game_access_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_game_access_sessions_code ON game_access_sessions(access_code_id);
CREATE INDEX IF NOT EXISTS idx_external_game_sessions_session ON external_game_sessions(access_session_id);

-- Insert default access codes
INSERT INTO game_access_codes (code, name, type, notes, created_by)
VALUES
    ('DEMO2024', 'Demo - Acceso de Prueba', 'demo', 'Codigo de demostracion para pruebas internas', 'system'),
    ('PARTNER001', 'Partner Externo - Codigo 1', 'partner', 'Codigo generico para partners', 'system'),
    ('RESEARCH001', 'Investigador - Codigo 1', 'researcher', 'Codigo para investigadores academicos', 'system')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- HDD CLINICAL MONITORING TABLES
-- =============================================

-- Mood check-ins (mood_value nullable for 3-phase system)
CREATE TABLE IF NOT EXISTS hdd_mood_checkins (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
    mood_value INTEGER,
    note TEXT,
    color_hex VARCHAR(7),
    color_intensity VARCHAR(20),
    context VARCHAR(50) DEFAULT 'daily_checkin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fix NOT NULL/CHECK constraint on mood_value if migration 010 created it
DO $$ BEGIN
  ALTER TABLE hdd_mood_checkins ALTER COLUMN mood_value DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE hdd_mood_checkins DROP CONSTRAINT IF EXISTS hdd_mood_checkins_mood_value_check;
EXCEPTION WHEN others THEN NULL;
END $$;
ALTER TABLE hdd_mood_checkins ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);
ALTER TABLE hdd_mood_checkins ADD COLUMN IF NOT EXISTS color_intensity VARCHAR(20);
ALTER TABLE hdd_mood_checkins ADD COLUMN IF NOT EXISTS context VARCHAR(50) DEFAULT 'daily_checkin';

-- Crisis alerts
CREATE TABLE IF NOT EXISTS hdd_crisis_alerts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    mood_value INTEGER,
    note TEXT,
    game_session_id INTEGER REFERENCES hdd_game_sessions(id),
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES healthcare_professionals(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game color selections
CREATE TABLE IF NOT EXISTS hdd_game_color_selections (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
    game_session_id INTEGER REFERENCES hdd_game_sessions(id),
    color_hex VARCHAR(7) NOT NULL,
    color_intensity VARCHAR(20) NOT NULL DEFAULT 'vivid',
    context VARCHAR(50) NOT NULL DEFAULT 'during_game',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patient monthly summaries
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

-- Session interaction tracking
CREATE TABLE IF NOT EXISTS hdd_interaction_log (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin notifications
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

-- Indexes for clinical tables
CREATE INDEX IF NOT EXISTS idx_mood_checkins_patient_date ON hdd_mood_checkins(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_status ON hdd_crisis_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_patient ON hdd_crisis_alerts(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_color_patient ON hdd_game_color_selections(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_log_patient ON hdd_interaction_log(patient_id, created_at DESC);

-- =============================================
-- HDD BIOMETRIC GAME METRICS (longitudinal)
-- =============================================

-- Unified game metrics table - all games save here
-- metric_type: 'session_summary' | 'session_biomet' | 'color_eleccion' | etc.
CREATE TABLE IF NOT EXISTS hdd_game_metrics (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    patient_dni VARCHAR(20),
    game_slug VARCHAR(64) NOT NULL,
    session_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metric_type VARCHAR(64) NOT NULL DEFAULT 'session_summary',
    metric_value DECIMAL(10,4),
    metric_data JSONB DEFAULT '{}',
    duration_seconds INTEGER,
    score INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    level_reached INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure hdd_game_metrics has all columns from both schemas
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS game_session_id INTEGER;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS patient_dni VARCHAR(20);
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS session_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS level_reached INTEGER;

-- Indexes for fast longitudinal queries
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_id ON hdd_game_metrics(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_dni ON hdd_game_metrics(patient_dni);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_game_slug ON hdd_game_metrics(game_slug);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_metric_type ON hdd_game_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_session_date ON hdd_game_metrics(session_date);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_game ON hdd_game_metrics(patient_dni, game_slug);

-- =============================================
-- HDD MOOD / COLOR ENTRIES (post-activity)
-- =============================================

-- Records color selections post any activity (game, terapia, telemedicina, etc.)
-- NO clinical interpretation stored here - raw data only
CREATE TABLE IF NOT EXISTS hdd_mood_entries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    patient_dni VARCHAR(20),
    color_hex VARCHAR(7) NOT NULL,
    color_id VARCHAR(32) NOT NULL,
    context_type VARCHAR(64) DEFAULT 'game',
    source_activity VARCHAR(64),
    session_ordinal INTEGER,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Ensure hdd_mood_entries has all columns from migration 20260301000000
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS color_name VARCHAR(50);
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(30) DEFAULT 'post_activity';
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_patient_dni ON hdd_mood_entries(patient_dni);
CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_patient_id ON hdd_mood_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_context ON hdd_mood_entries(context_type);
CREATE INDEX IF NOT EXISTS idx_hdd_mood_entries_recorded_at ON hdd_mood_entries(recorded_at);

-- =============================================
-- RENAPDIS COMPLIANCE TABLES (migration 028)
-- =============================================

-- Electronic prescriptions (CUIR)
CREATE TABLE IF NOT EXISTS electronic_prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE RESTRICT,
    professional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    cuir_code VARCHAR(64) UNIQUE,
    prescription_type VARCHAR(32) NOT NULL DEFAULT 'general',
    medications JSONB NOT NULL,
    diagnosis_text TEXT,
    diagnosis_snomed VARCHAR(20),
    instructions TEXT,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    dispensed BOOLEAN DEFAULT FALSE,
    dispensed_at TIMESTAMPTZ,
    dispensed_by VARCHAR(255),
    pharmacy_name VARCHAR(255),
    firma_digital_hash VARCHAR(128),
    firma_nombre VARCHAR(255),
    firma_matricula VARCHAR(64),
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON electronic_prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_cuir ON electronic_prescriptions(cuir_code);

-- HCE evoluciones immutability columns
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_digital_hash VARCHAR(128);
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_digital_timestamp TIMESTAMPTZ;
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_ip_address VARCHAR(45);
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS is_addendum BOOLEAN DEFAULT FALSE;
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS parent_evolution_id INTEGER;
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS original_contenido TEXT;

-- SNOMED CT columns
ALTER TABLE hce_diagnosticos ADD COLUMN IF NOT EXISTS snomed_code VARCHAR(20);
ALTER TABLE hce_diagnosticos ADD COLUMN IF NOT EXISTS snomed_display TEXT;
ALTER TABLE hce_medicacion ADD COLUMN IF NOT EXISTS snomed_code VARCHAR(20);
ALTER TABLE hce_medicacion ADD COLUMN IF NOT EXISTS snomed_display TEXT;

-- Patient data protection columns (Ley 25.326)
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS data_processing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS data_processing_consent_date TIMESTAMPTZ;

-- =============================================
-- LONGITUDINAL VIEWS FOR PROFESSIONAL PANEL
-- =============================================

CREATE OR REPLACE VIEW v_patient_game_summary AS
SELECT
    patient_dni,
    game_slug,
    COUNT(*) AS total_sessions,
    MIN(session_date) AS first_session,
    MAX(session_date) AS last_session,
    AVG(score) AS avg_score,
    MAX(score) AS best_score,
    MIN(score) AS baseline_score,
    AVG(metric_value) AS avg_metric_value,
    COUNT(CASE WHEN completed THEN 1 END) AS completed_sessions,
    MAX(level_reached) AS max_level_reached
FROM hdd_game_metrics
WHERE metric_type = 'session_summary'
GROUP BY patient_dni, game_slug;

CREATE OR REPLACE VIEW v_patient_color_timeline AS
SELECT
    patient_dni,
    color_hex,
    color_id,
    context_type,
    source_activity,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY patient_dni ORDER BY recorded_at) AS global_ordinal
FROM hdd_mood_entries
ORDER BY patient_dni, recorded_at;

-- SEC-001 FIX: Rate limiting table (required by lib/auth.mts checkRateLimit)
CREATE TABLE IF NOT EXISTS rate_limit_entries (
    id SERIAL PRIMARY KEY,
    limit_key VARCHAR(255) NOT NULL,
    attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_entries (limit_key, attempt_at DESC);
`;

async function runMigration() {
  console.log("Starting database migration...");

  // Use SUPABASE_DATABASE_URL exclusively
  const databaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (!databaseUrl) {
    console.log("SUPABASE_DATABASE_URL not set - skipping migration");
    console.log("Database will be provisioned when SUPABASE_DATABASE_URL is configured");
    return;
  }

  console.log("Connecting to Supabase PostgreSQL...");

  try {
    const sql = postgres(databaseUrl, {
      ssl: 'require',
      connect_timeout: 10,
    });

    console.log("Creating tables...");
    await sql.unsafe(migrationSQL);

    // Verify tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tableNames = tables.map((t) => t.table_name);
    console.log("Migration completed successfully!");
    console.log("Tables in database:", tableNames.join(", "));

    // Close connection
    await sql.end();

  } catch (error) {
    console.error("========================================");
    console.error("⚠️  MIGRATION ERROR - REQUIRES ATTENTION");
    console.error("========================================");
    console.error("Error:", error.message);
    if (error.detail) console.error("Detail:", error.detail);
    if (error.hint) console.error("Hint:", error.hint);
    if (error.where) console.error("Where:", error.where);
    console.error("========================================");
    console.error("The build will continue but database may be incomplete.");
    console.error("Check Supabase dashboard or run migrations manually.");
    console.error("========================================");
    // Don't fail the build - DB might not be reachable during build
    // but make the error impossible to miss in deploy logs
    process.exit(0);
  }
}

// SEC-011: Health check — warn if critical env vars are missing
const criticalVars = ['SUPABASE_DATABASE_URL', 'DAILY_API_KEY', 'SUPER_ADMIN_EMAILS'];
const recommendedVars = ['ZOHO_SMTP_USER', 'ZOHO_SMTP_PASS', 'MP_ACCESS_TOKEN'];
criticalVars.forEach(v => { if (!process.env[v]) console.error(`🚨 CRITICAL: ${v} is NOT configured!`); });
recommendedVars.forEach(v => { if (!process.env[v]) console.warn(`⚠️  WARNING: ${v} not configured — related features will be disabled.`); });

runMigration();
