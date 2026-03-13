-- SEC-009 FIX: Restrict anon RLS policies on game/mood tables
-- Previously: anon could INSERT/SELECT/UPDATE with USING(true)
-- Now: anon can only INSERT (telemetry from browser) but not SELECT all data

DROP POLICY IF EXISTS "game_metrics_anon_select" ON hdd_game_metrics;
DROP POLICY IF EXISTS "game_sessions_anon_select" ON hdd_game_sessions;
DROP POLICY IF EXISTS "game_sessions_anon_update" ON hdd_game_sessions;
DROP POLICY IF EXISTS "mood_checkins_anon_select" ON hdd_mood_checkins;
DROP POLICY IF EXISTS "mood_entries_anon_select" ON hdd_mood_entries;
DROP POLICY IF EXISTS "crisis_alerts_anon_insert" ON hdd_crisis_alerts;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hdd_crisis_alerts' AND policyname = 'crisis_alerts_anon_insert_only') THEN
        CREATE POLICY "crisis_alerts_anon_insert_only" ON hdd_crisis_alerts 
            FOR INSERT TO anon WITH CHECK (true);
    END IF;
END $$;
