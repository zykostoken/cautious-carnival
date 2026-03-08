-- H-060: Fix overly permissive grants on clinical data views
-- This migration revokes public/anon access to clinical tables and views

-- Revoke anon access from clinical tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'hdd_patients', 'healthcare_professionals', 'mood_checkins',
      'game_sessions', 'biometric_data', 'notification_log',
      'video_sessions', 'call_queue', 'mp_payments',
      'telemedicine_users', 'hdd_games', 'game_access_codes',
      'game_access_sessions', 'external_game_sessions',
      'patient_resources', 'patient_activities',
      'mood_alerts', 'mood_entries'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon', tbl);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated', tbl);
    RAISE NOTICE 'Revoked access on table: %', tbl;
  END LOOP;
END $$;

-- Revoke anon access from views if they exist
DO $$
DECLARE
  vw TEXT;
BEGIN
  FOR vw IN
    SELECT viewname FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon', vw);
    RAISE NOTICE 'Revoked access on view: %', vw;
  END LOOP;
END $$;

-- Enable RLS on critical clinical tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'hdd_patients', 'healthcare_professionals', 'mood_checkins',
      'game_sessions', 'biometric_data', 'notification_log',
      'video_sessions', 'call_queue', 'mp_payments',
      'mood_entries', 'mood_alerts'
    )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'Enabled RLS on: %', tbl;
  END LOOP;
END $$;

-- Grant service_role full access (used by Netlify functions via SUPABASE_SERVICE_ROLE_KEY)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT ALL ON %I TO service_role', tbl);
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'H-060: anon/authenticated access revoked. All data access goes through service_role via Netlify functions.';
