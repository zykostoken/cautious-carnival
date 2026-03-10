-- =====================================================
-- MIGRATION 014: Create ALL Missing Tables + Views + RLS
-- Applied: 2026-03-02 via Supabase MCP
-- 
-- CONTEXT: 17 tables/views referenced by code did not exist in DB.
-- This migration was applied in 4 parts:
--   1. create_missing_tables_part1_core_games
--   2. create_missing_tables_part2_clinical  
--   3. create_missing_tables_part3_access_and_views
--   4. rls_policies_new_tables
--
-- AUDIT FINDINGS:
-- - 14 tables missing (code referenced, DB didn't have)
-- - 3 views missing (code referenced, DB didn't have)
-- - 4 frontend files had WRONG Supabase anon key (different project)
-- - 1 frontend file had PLACEHOLDER credentials
-- - hdd_game_metrics was missing game_session_id column
--
-- TABLES CREATED:
--   hdd_games, hdd_game_schedule, hdd_game_sessions, hdd_game_progress,
--   hdd_mood_checkins, hdd_crisis_alerts, hdd_game_color_selections,
--   hdd_patient_monthly_summaries, hdd_interaction_log, hdd_resources,
--   game_access_codes, game_access_sessions, external_game_sessions
--
-- COLUMNS ADDED:
--   hdd_game_metrics.game_session_id (INTEGER, nullable)
--
-- VIEWS CREATED:
--   hdd_game_biometrics (biometric metrics from hdd_game_metrics)
--   v_hdd_session_analysis (game sessions + mood data for patient dashboard)
--   v_patient_game_summary (per-game longitudinal stats per patient)
--   v_patient_clinical_profile (cross-game clinical summary per patient)
--
-- FRONTEND CODE FIXES (same commit):
--   games/portal/dashboard.html - wrong anon key → fixed
--   games/play/neuro-chef/dashboard.html - wrong anon key → fixed
--   hdd/portal/metrics-dashboard.html - wrong anon key → fixed
--   hdd/portal/metrics.html - placeholder → fixed
--
-- SEED DATA:
--   6 therapeutic games registered in hdd_games
--   3 default access codes in game_access_codes
-- =====================================================

-- Originally applied via Supabase MCP in 4 parts. This file now contains
-- the critical column addition that was missing from the documentation-only stub.

-- Add game_session_id column to hdd_game_metrics (referenced by views and code)
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS game_session_id INTEGER;

-- Add patient_dni column (needed by setup-db views and HCE queries)
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS patient_dni VARCHAR(20);

-- Add session_id column (referenced by hdd_game_biometrics view)
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

-- Add session_date (needed by HCE get_patient_metrics)
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS session_date DATE DEFAULT CURRENT_DATE;

-- Add columns needed by HCE patient metrics queries
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_game_metrics ADD COLUMN IF NOT EXISTS level_reached INTEGER;

-- Add recorded_at to hdd_mood_entries (queried by HCE get_patient_metrics)
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS color_id VARCHAR(32);
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS context_type VARCHAR(64) DEFAULT 'game';
ALTER TABLE hdd_mood_entries ADD COLUMN IF NOT EXISTS source_activity VARCHAR(64);
