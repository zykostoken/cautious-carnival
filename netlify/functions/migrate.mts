import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

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
`;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const sql = neon();
    const results: string[] = [];

    // Run table creation
    results.push("Creating tables...");
    await sql(migrationSQL);
    results.push("Tables created successfully");

    // Run index creation
    results.push("Creating indexes...");
    await sql(indexesSQL);
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
