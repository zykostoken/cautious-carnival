import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Migration SQL for all tables
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
    call_type VARCHAR(32) DEFAULT 'queue',
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

-- Add missing columns to healthcare_professionals if they don't exist
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS current_calls INTEGER DEFAULT 0;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS max_concurrent_calls INTEGER DEFAULT 1;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT TRUE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT TRUE;

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

-- Add missing columns to call_queue if they don't exist
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS video_session_id INTEGER REFERENCES video_sessions(id);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES telemedicine_users(id);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS patient_email VARCHAR(255);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(32);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS assigned_professional_id INTEGER REFERENCES healthcare_professionals(id);
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE call_queue ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'waiting';

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
    author_name VARCHAR(255),
    type VARCHAR(32) DEFAULT 'info',
    color VARCHAR(32) DEFAULT '#e8dcc8',
    is_active BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    show_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    show_until TIMESTAMP WITH TIME ZONE,
    created_by INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Add missing columns to announcements if they don't exist
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS show_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS show_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_name VARCHAR(255);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS color VARCHAR(32) DEFAULT '#e8dcc8';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS type VARCHAR(32) DEFAULT 'info';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add payment_reference column to video_sessions if it doesn't exist
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255);

-- Consultations / Inquiries from visitors
CREATE TABLE IF NOT EXISTS consultations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    subject VARCHAR(255) DEFAULT 'Consulta General',
    message TEXT NOT NULL,
    consultation_type VARCHAR(32) DEFAULT 'general',
    session_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'pending',
    responded_by INTEGER REFERENCES healthcare_professionals(id),
    response TEXT,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- Telemedicine interest / pre-registration
CREATE TABLE IF NOT EXISTS telemedicine_interest (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    session_id VARCHAR(64),
    source VARCHAR(64) DEFAULT 'modal',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Hospital de Día (HDD) patients
CREATE TABLE IF NOT EXISTS hdd_patients (
    id SERIAL PRIMARY KEY,
    dni VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(32),
    admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    discharge_date DATE,
    notes TEXT,
    status VARCHAR(32) DEFAULT 'active',
    password_hash VARCHAR(255),
    session_token VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    verification_expires TIMESTAMP WITH TIME ZONE,
    username VARCHAR(100),
    photo_url TEXT,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Add missing columns to hdd_patients if they don't exist
-- Using standard ALTER TABLE ADD COLUMN IF NOT EXISTS for reliability
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- HDD Community posts
CREATE TABLE IF NOT EXISTS hdd_community_posts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    content TEXT NOT NULL,
    post_type VARCHAR(32) DEFAULT 'text',
    image_url TEXT,
    is_approved BOOLEAN DEFAULT TRUE,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- HDD Post comments
CREATE TABLE IF NOT EXISTS hdd_post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES hdd_community_posts(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- HDD Post likes
CREATE TABLE IF NOT EXISTS hdd_post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES hdd_community_posts(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, patient_id)
);

-- HDD Activities log
CREATE TABLE IF NOT EXISTS hdd_activities (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id),
    activity_type VARCHAR(64) NOT NULL,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- HDD Login tracking for session metrics
CREATE TABLE IF NOT EXISTS hdd_login_tracking (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    logout_at TIMESTAMP WITH TIME ZONE,
    session_duration_minutes INTEGER,
    pages_visited INTEGER DEFAULT 0,
    activities_completed INTEGER DEFAULT 0,
    interactions JSONB DEFAULT '{}',
    user_agent TEXT
);

-- Telemedicine plans (pricing tiers)
CREATE TABLE IF NOT EXISTS telemedicine_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS',
    duration_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Mercado Pago payments
CREATE TABLE IF NOT EXISTS mp_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telemedicine_users(id),
    mp_preference_id VARCHAR(255),
    mp_payment_id VARCHAR(255),
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS',
    status VARCHAR(32) DEFAULT 'pending',
    status_detail VARCHAR(64),
    payment_type VARCHAR(32),
    payment_method VARCHAR(32),
    description TEXT,
    external_reference VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Insert default telemedicine plans if none exist
INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes, is_active)
SELECT 'Telemedicina con espera (15 min)', 'Videoconsulta con espera en linea (15 min)', 50000, 'ARS', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Telemedicina con espera (15 min)');

INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes, is_active)
SELECT 'Telemedicina sin cola (15 min)', 'Videoconsulta sin cola de espera (15 min)', 70000, 'ARS', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Telemedicina sin cola (15 min)');

INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes, is_active)
SELECT 'Telemedicina sin cola premium (15 min)', 'Videoconsulta con maxima prioridad (15 min)', 120000, 'ARS', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Telemedicina sin cola premium (15 min)');
`;

// Indexes SQL
const indexesSQL = `
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
CREATE INDEX IF NOT EXISTS idx_healthcare_professionals_email ON healthcare_professionals(email);
CREATE INDEX IF NOT EXISTS idx_healthcare_professionals_available ON healthcare_professionals(is_available);
CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status);
CREATE INDEX IF NOT EXISTS idx_call_queue_professional ON call_queue(assigned_professional_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, show_from, show_until);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_type ON consultations(consultation_type);
CREATE INDEX IF NOT EXISTS idx_telemedicine_interest_email ON telemedicine_interest(email);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_dni ON hdd_patients(dni);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_status ON hdd_patients(status);
CREATE INDEX IF NOT EXISTS idx_hdd_community_posts_patient ON hdd_community_posts(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_community_posts_approved ON hdd_community_posts(is_approved);
CREATE INDEX IF NOT EXISTS idx_hdd_post_comments_post ON hdd_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_hdd_post_likes_post ON hdd_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_hdd_activities_patient ON hdd_activities(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_login_tracking_patient ON hdd_login_tracking(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_login_tracking_login ON hdd_login_tracking(login_at);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_email_verified ON hdd_patients(email_verified);
CREATE INDEX IF NOT EXISTS idx_telemedicine_plans_active ON telemedicine_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_mp_payments_user ON mp_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_status ON mp_payments(status);
CREATE INDEX IF NOT EXISTS idx_mp_payments_external_ref ON mp_payments(external_reference);
`;

// Resources and activity management tables
const resourcesMigrationSQL = `
-- HDD Resources table
CREATE TABLE IF NOT EXISTS hdd_resources (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'link',
    url TEXT NOT NULL,
    duration VARCHAR(50),
    icon VARCHAR(10),
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- HDD Weekly Activities schedule table
CREATE TABLE IF NOT EXISTS hdd_weekly_activities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    icon VARCHAR(10),
    location VARCHAR(200),
    professional VARCHAR(200),
    max_capacity INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add extra columns to hdd_activities schedule if it already exists from 001_initial.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hdd_activities'
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_activities' AND column_name = 'day_of_week')) THEN
    ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
    ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS location VARCHAR(200);
    ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS professional VARCHAR(200);
    ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_activities' AND column_name = 'created_at') THEN
      ALTER TABLE hdd_activities ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- Seed default resources
INSERT INTO hdd_resources (title, description, resource_type, url, duration, sort_order)
VALUES
    ('Tecnicas de Relajacion', 'Video introductorio sobre tecnicas de respiracion y relajacion muscular progresiva.', 'video', 'https://www.youtube.com/watch?v=aXItOY0sLRY', '15 min', 1),
    ('Guia de Medicacion', 'Documento sobre manejo responsable de medicacion psiquiatrica.', 'document', '#', '10 paginas', 2),
    ('Curso: Habilidades Sociales', 'Curso de 4 modulos sobre desarrollo de habilidades sociales y comunicacion asertiva.', 'course', '#', '4 modulos', 3),
    ('Mindfulness para Principiantes', 'Sesion guiada de meditacion mindfulness para principiantes.', 'video', 'https://www.youtube.com/watch?v=ZToicYcHIqU', '20 min', 4),
    ('Portal de Salud Mental', 'Enlace al portal nacional de recursos de salud mental.', 'link', 'https://www.argentina.gob.ar/salud/mental', NULL, 5)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hdd_resources_type ON hdd_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_hdd_resources_active ON hdd_resources(is_active);
`;

// Seed HDD patients data
const seedHDDPatientsSQL = `
-- Insert all 23 authorized HDD patients
-- ON CONFLICT DO NOTHING ensures we don't duplicate existing patients
INSERT INTO hdd_patients (dni, full_name, status, admission_date, created_at)
VALUES
    ('17051100', 'Abregu Walter Humberto', 'active', CURRENT_DATE, NOW()),
    ('20716038', 'Amat Sandro Javier', 'active', CURRENT_DATE, NOW()),
    ('13207570', 'Arcomano Nora Estela', 'active', CURRENT_DATE, NOW()),
    ('25235646', 'Arrieta Alejandro', 'active', CURRENT_DATE, NOW()),
    ('11345447', 'Arrivillaga Oscar', 'active', CURRENT_DATE, NOW()),
    ('38276142', 'Cabezas Lucas Gabriel', 'active', CURRENT_DATE, NOW()),
    ('21755736', 'Casas Guillermo', 'active', CURRENT_DATE, NOW()),
    ('24094852', 'Castro Arturo Anibal', 'active', CURRENT_DATE, NOW()),
    ('25927210', 'De Battista Jorgelina', 'active', CURRENT_DATE, NOW()),
    ('12651036', 'Del Prette Juan Carlos', 'active', CURRENT_DATE, NOW()),
    ('13207364', 'Etchemendy Norma Adriana', 'active', CURRENT_DATE, NOW()),
    ('27332925', 'Gomez Leal Jorge Daniel', 'active', CURRENT_DATE, NOW()),
    ('12130808', 'Kessler Hortensia Lidia', 'active', CURRENT_DATE, NOW()),
    ('44830962', 'Khulmann Diego Leonel', 'active', CURRENT_DATE, NOW()),
    ('16721815', 'Lozano Norma Beatriz', 'active', CURRENT_DATE, NOW()),
    ('28041501', 'Luayza Martha Lorena', 'active', CURRENT_DATE, NOW()),
    ('24444302', 'Marambio Ricardo', 'active', CURRENT_DATE, NOW()),
    ('10614344', 'Peshnaski Amalia Liliana', 'active', CURRENT_DATE, NOW()),
    ('14446656', 'Revelo Claudio Marcelo', 'active', CURRENT_DATE, NOW()),
    ('26463141', 'Romero Natalia Raquel', 'active', CURRENT_DATE, NOW()),
    ('28151900', 'Sampron Agustin Elias', 'active', CURRENT_DATE, NOW()),
    ('18405535', 'Suarez Ana Carolina', 'active', CURRENT_DATE, NOW()),
    ('11105752', 'Vomero Jose Luis', 'active', CURRENT_DATE, NOW())
ON CONFLICT (dni) DO NOTHING;
`;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const sql = getDatabase();
    const results: string[] = [];

    // Run table creation
    results.push("Creating tables...");
    await sql.unsafe(migrationSQL);
    results.push("Tables created successfully");

    // Run index creation
    results.push("Creating indexes...");
    await sql.unsafe(indexesSQL);
    results.push("Indexes created successfully");

    // Seed HDD patients data
    results.push("Seeding HDD patients...");
    await sql.unsafe(seedHDDPatientsSQL);
    results.push("HDD patients seeded successfully");

    // Run resources and activity management migration
    results.push("Creating resources and activity management tables...");
    await sql.unsafe(resourcesMigrationSQL);
    results.push("Resources and activity tables created successfully");

    // Verify tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tableNames = tables.map((t: { table_name: string }) => t.table_name);
    results.push(`Tables in database: ${tableNames.join(", ")}`);

    return new Response(JSON.stringify({
      success: true,
      message: "Migration completed successfully",
      results,
      tables: tableNames
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Migration error:", error);
    return new Response(JSON.stringify({
      error: "Migration failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/migrate"
};
