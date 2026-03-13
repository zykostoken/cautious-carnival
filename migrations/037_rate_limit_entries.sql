-- SEC-001 FIX: Create rate_limit_entries table
-- Referenced by lib/auth.mts checkRateLimit() but never created in any migration
-- Without this table, rate limiting fails open (allows all requests = brute-force possible)

CREATE TABLE IF NOT EXISTS rate_limit_entries (
    id SERIAL PRIMARY KEY,
    limit_key VARCHAR(255) NOT NULL,
    attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time 
    ON rate_limit_entries (limit_key, attempt_at DESC);

-- RLS: only backend (service_role via DATABASE_URL) should access
ALTER TABLE rate_limit_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rate_limit_entries' AND policyname = 'rate_limit_service_role') THEN
        CREATE POLICY "rate_limit_service_role" ON rate_limit_entries 
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

COMMENT ON TABLE rate_limit_entries IS 'DB-backed rate limiter for auth endpoints. SEC-001 audit fix.';
