#!/usr/bin/env node
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
    console.error("Migration error:", error.message);
    // Don't fail the build - just log the error
    process.exit(0);
  }
}

runMigration();
