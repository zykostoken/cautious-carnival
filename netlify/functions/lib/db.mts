// Database connection helper for Supabase PostgreSQL
// Uses postgres (postgresjs) - a fast PostgreSQL client for Node.js
import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getDatabase() {
  // Use SUPABASE_DATABASE_URL exclusively (this project uses Supabase)
  const databaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("SUPABASE_DATABASE_URL is not configured. Please set this environment variable in Netlify.");
  }

  // Create connection if not already created (connection pooling)
  if (!sql) {
    sql = postgres(databaseUrl, {
      ssl: 'require',
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return sql;
}
