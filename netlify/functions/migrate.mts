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
    max_concurrent_calls INTEGER DEFAULT 1,
    current_calls INTEGER DEFAULT 0,
    notify_email BOOLEAN DEFAULT TRUE,
    notify_whatsapp BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    session_token VARCHAR(255)
);

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
    type VARCHAR(32) DEFAULT 'info',
    is_active BOOLEAN DEFAULT TRUE,
    is_pinned BOOLEAN DEFAULT FALSE,
    show_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    show_until TIMESTAMP WITH TIME ZONE,
    created_by INTEGER REFERENCES healthcare_professionals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

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
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

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
