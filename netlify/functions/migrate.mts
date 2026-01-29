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
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'email_verified') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'verification_code') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN verification_code VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'verification_expires') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN verification_expires TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'current_calls') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN current_calls INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'max_concurrent_calls') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN max_concurrent_calls INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'is_available') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN is_available BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'notify_email') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN notify_email BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'healthcare_professionals' AND column_name = 'notify_whatsapp') THEN
        ALTER TABLE healthcare_professionals ADD COLUMN notify_whatsapp BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

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
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'video_session_id') THEN
        ALTER TABLE call_queue ADD COLUMN video_session_id INTEGER REFERENCES video_sessions(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'user_id') THEN
        ALTER TABLE call_queue ADD COLUMN user_id INTEGER REFERENCES telemedicine_users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'patient_name') THEN
        ALTER TABLE call_queue ADD COLUMN patient_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'patient_email') THEN
        ALTER TABLE call_queue ADD COLUMN patient_email VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'patient_phone') THEN
        ALTER TABLE call_queue ADD COLUMN patient_phone VARCHAR(32);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'priority') THEN
        ALTER TABLE call_queue ADD COLUMN priority INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'assigned_professional_id') THEN
        ALTER TABLE call_queue ADD COLUMN assigned_professional_id INTEGER REFERENCES healthcare_professionals(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'assigned_at') THEN
        ALTER TABLE call_queue ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'answered_at') THEN
        ALTER TABLE call_queue ADD COLUMN answered_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'notes') THEN
        ALTER TABLE call_queue ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_queue' AND column_name = 'status') THEN
        ALTER TABLE call_queue ADD COLUMN status VARCHAR(32) DEFAULT 'waiting';
    END IF;
END $$;

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
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'show_from') THEN
        ALTER TABLE announcements ADD COLUMN show_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'show_until') THEN
        ALTER TABLE announcements ADD COLUMN show_until TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'is_pinned') THEN
        ALTER TABLE announcements ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'author_name') THEN
        ALTER TABLE announcements ADD COLUMN author_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'color') THEN
        ALTER TABLE announcements ADD COLUMN color VARCHAR(32) DEFAULT '#e8dcc8';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'type') THEN
        ALTER TABLE announcements ADD COLUMN type VARCHAR(32) DEFAULT 'info';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'is_active') THEN
        ALTER TABLE announcements ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Add payment_reference column to video_sessions if it doesn't exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_sessions' AND column_name = 'payment_reference') THEN
        ALTER TABLE video_sessions ADD COLUMN payment_reference VARCHAR(255);
    END IF;
END $$;

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
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'email_verified') THEN
        ALTER TABLE hdd_patients ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'verification_code') THEN
        ALTER TABLE hdd_patients ADD COLUMN verification_code VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'verification_expires') THEN
        ALTER TABLE hdd_patients ADD COLUMN verification_expires TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'username') THEN
        ALTER TABLE hdd_patients ADD COLUMN username VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'photo_url') THEN
        ALTER TABLE hdd_patients ADD COLUMN photo_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hdd_patients' AND column_name = 'last_login') THEN
        ALTER TABLE hdd_patients ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

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
SELECT 'Consulta Diurna (09-13hs)', 'Videoconsulta de 30 minutos - Horario matutino', 120000, 'ARS', 30, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Consulta Diurna (09-13hs)');

INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes, is_active)
SELECT 'Consulta Vespertina (13-20hs)', 'Videoconsulta de 30 minutos - Horario vespertino', 150000, 'ARS', 30, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Consulta Vespertina (13-20hs)');

INSERT INTO telemedicine_plans (name, description, price, currency, duration_minutes, is_active)
SELECT 'Consulta Nocturna (20-09hs)', 'Videoconsulta de 30 minutos - Horario nocturno', 200000, 'ARS', 30, TRUE
WHERE NOT EXISTS (SELECT 1 FROM telemedicine_plans WHERE name = 'Consulta Nocturna (20-09hs)');
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
