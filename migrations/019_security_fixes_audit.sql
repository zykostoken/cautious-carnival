-- ============================================================
-- MIGRATION 019: Correcciones de seguridad — Auditoría Habilitación
-- Fecha: 2026-03-08
-- Hallazgos: 7 SECURITY DEFINER views, 11 funciones sin search_path,
--            professional_audit_log sin políticas RLS
-- ============================================================

-- ===========================================
-- 1. CORREGIR VISTAS SECURITY DEFINER → SECURITY INVOKER
-- PostgreSQL 15+ soporta SECURITY INVOKER en vistas
-- ===========================================

-- Recrear vistas con SECURITY INVOKER (elimina escalamiento de privilegios)

CREATE OR REPLACE VIEW v_patient_game_summary
WITH (security_invoker = true)
AS
SELECT patient_id,
    game_slug,
    count(*) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')) AS total_sessions,
    min(created_at) AS first_session_at,
    max(created_at) AS last_session_at,
    avg(metric_value) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')) AS avg_score,
    min(metric_value) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')) AS min_score,
    max(metric_value) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')) AS max_score,
    (array_agg(metric_value ORDER BY created_at) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')))[1] AS baseline_score,
    (array_agg(metric_value ORDER BY created_at DESC) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')))[1] AS latest_score,
    (array_agg(metric_value ORDER BY created_at DESC) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')))[1]
    - (array_agg(metric_value ORDER BY created_at) FILTER (WHERE metric_type IN ('session_summary', 'session_complete')))[1] AS score_progress,
    avg((metric_data->>'reaction_time_ms')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_rt_ms,
    avg((metric_data->>'tremor_avg')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_tremor,
    avg((metric_data->>'false_alarms')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_commission_errors,
    avg((metric_data->>'misses')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_omission_errors,
    avg((metric_data->>'hesitation_count')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_hesitations,
    avg((metric_data->>'tremor_speed_var')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_movement_eff,
    avg((metric_data->>'d_prime')::numeric) FILTER (WHERE metric_type LIKE 'biometric_%') AS avg_d_prime
FROM hdd_game_metrics gm
WHERE patient_id IS NOT NULL
GROUP BY patient_id, game_slug;

CREATE OR REPLACE VIEW v_patient_clinical_profile
WITH (security_invoker = true)
AS
SELECT patient_id,
    count(DISTINCT game_slug) AS games_played,
    sum(total_sessions) AS total_sessions,
    max(last_session_at) AS last_activity_at,
    avg(avg_score) AS overall_avg_score,
    max(GREATEST(COALESCE(max_score, 0::numeric))) AS best_score_ever,
    avg(avg_rt_ms) AS avg_rt_ms,
    avg(avg_tremor) AS avg_tremor,
    avg(avg_commission_errors) AS avg_commission_errors,
    avg(avg_omission_errors) AS avg_omission_errors,
    avg(avg_hesitations) AS avg_hesitations,
    avg(avg_movement_eff) AS avg_movement_eff,
    avg(avg_d_prime) AS avg_d_prime,
    CASE
        WHEN sum(total_sessions) >= 5 THEN
            CASE WHEN avg(latest_score) > avg(avg_score) THEN 'improving' ELSE 'stable_or_declining' END
        ELSE 'insufficient_data'
    END AS global_score_trend,
    jsonb_agg(jsonb_build_object('game', game_slug, 'sessions', total_sessions, 'avg', round(COALESCE(avg_score, 0::numeric), 1))) AS game_breakdown
FROM v_patient_game_summary
GROUP BY patient_id;

CREATE OR REPLACE VIEW v_hce_resumen_paciente
WITH (security_invoker = true)
AS
SELECT p.id AS patient_id,
    p.numero_historia_clinica,
    p.dni,
    p.full_name,
    p.fecha_nacimiento,
    p.sexo,
    p.admission_date,
    p.status,
    (SELECT COUNT(*) FROM hce_evoluciones e WHERE e.patient_id = p.id) AS total_evoluciones,
    (SELECT COUNT(*) FROM hce_diagnosticos d WHERE d.patient_id = p.id AND d.estado = 'activo') AS diagnosticos_activos,
    (SELECT COUNT(*) FROM hce_medicacion m WHERE m.patient_id = p.id AND m.estado = 'activo') AS medicacion_activa,
    (SELECT COUNT(*) FROM hce_antecedentes a WHERE a.patient_id = p.id) AS total_antecedentes,
    (SELECT COUNT(*) FROM hce_estudios es WHERE es.patient_id = p.id) AS total_estudios,
    (SELECT fecha FROM hce_evoluciones e WHERE e.patient_id = p.id ORDER BY fecha DESC LIMIT 1) AS ultima_evolucion,
    (SELECT hp.full_name FROM hce_evoluciones e JOIN healthcare_professionals hp ON hp.id = e.profesional_id WHERE e.patient_id = p.id ORDER BY e.fecha DESC LIMIT 1) AS ultimo_profesional
FROM hdd_patients p;

CREATE OR REPLACE VIEW v_hdd_session_analysis
WITH (security_invoker = true)
AS
SELECT gs.id AS session_id,
    gs.patient_id,
    g.slug AS game_type,
    gs.score,
    gs.duration_seconds AS session_duration_seconds,
    gs.completed,
    gs.started_at,
    gs.completed_at,
    gs.metrics,
    me.color_hex AS post_color_hex,
    me.color_name AS post_intensity,
    CASE
        WHEN me.color_id IN ('red', 'rojo') THEN ARRAY['alerta', 'activacion']
        WHEN me.color_id IN ('blue', 'azul') THEN ARRAY['calma', 'introspección']
        WHEN me.color_id IN ('green', 'verde') THEN ARRAY['equilibrio', 'bienestar']
        WHEN me.color_id IN ('yellow', 'amarillo') THEN ARRAY['energía', 'optimismo']
        WHEN me.color_id IN ('purple', 'violeta') THEN ARRAY['creatividad', 'reflexión']
        ELSE ARRAY[]::text[]
    END AS psychological_tags
FROM hdd_game_sessions gs
LEFT JOIN hdd_games g ON g.id = gs.game_id
LEFT JOIN LATERAL (
    SELECT me2.* FROM hdd_mood_entries me2
    WHERE me2.patient_id = gs.patient_id
      AND me2.created_at >= gs.started_at
      AND me2.created_at <= COALESCE(gs.completed_at, gs.started_at + INTERVAL '2 hours')
    ORDER BY me2.created_at DESC LIMIT 1
) me ON true;

CREATE OR REPLACE VIEW v_professional_patient_interactions
WITH (security_invoker = true)
AS
SELECT a.professional_id,
    p_prof.full_name AS professional_name,
    a.patient_id,
    a.patient_name,
    count(*) AS total_interactions,
    count(CASE WHEN a.action_type = 'video_session' THEN 1 END) AS video_sessions,
    count(CASE WHEN a.action_type = 'view_patient_metrics' THEN 1 END) AS metrics_reviews,
    count(CASE WHEN a.action_type = 'update_patient' THEN 1 END) AS record_updates,
    COALESCE(sum(a.duration_seconds) FILTER (WHERE a.action_type = 'video_session'), 0) AS total_video_seconds,
    min(a.created_at) AS first_interaction,
    max(a.created_at) AS last_interaction
FROM professional_audit_log a
JOIN healthcare_professionals p_prof ON p_prof.id = a.professional_id
WHERE a.patient_id IS NOT NULL
GROUP BY a.professional_id, p_prof.full_name, a.patient_id, a.patient_name
ORDER BY max(a.created_at) DESC;

CREATE OR REPLACE VIEW v_professional_usage_summary
WITH (security_invoker = true)
AS
SELECT p.id AS professional_id,
    p.full_name AS professional_name,
    p.email,
    p.specialty,
    count(DISTINCT a.id) AS total_actions,
    count(DISTINCT CASE WHEN a.action_type = 'view_patient' THEN a.patient_id END) AS patients_viewed,
    count(CASE WHEN a.action_type = 'video_session' THEN 1 END) AS video_sessions,
    count(CASE WHEN a.action_type LIKE 'update%' OR a.action_type LIKE 'add%' THEN 1 END) AS modifications,
    COALESCE(sum(a.duration_seconds) FILTER (WHERE a.action_type = 'video_session'), 0) AS total_video_seconds,
    max(a.created_at) AS last_activity,
    min(a.created_at) AS first_activity,
    count(CASE WHEN a.created_at >= now() - INTERVAL '7 days' THEN 1 END) AS actions_last_7d,
    count(CASE WHEN a.created_at >= now() - INTERVAL '30 days' THEN 1 END) AS actions_last_30d
FROM healthcare_professionals p
LEFT JOIN professional_audit_log a ON a.professional_id = p.id
WHERE p.is_active = true
GROUP BY p.id, p.full_name, p.email, p.specialty;

CREATE OR REPLACE VIEW hdd_game_biometrics
WITH (security_invoker = true)
AS
SELECT id, patient_id, patient_dni, game_slug, game_session_id, session_id,
    metric_type, metric_value, metric_data, created_at,
    (metric_data->>'reaction_time_ms')::numeric AS reaction_time_ms,
    (metric_data->>'d_prime')::numeric AS d_prime,
    (metric_data->>'tremor_avg')::numeric AS tremor_avg,
    (metric_data->>'hesitation_count')::integer AS hesitation_count,
    (metric_data->>'hits')::integer AS hits,
    (metric_data->>'misses')::integer AS misses,
    (metric_data->>'false_alarms')::integer AS false_alarms,
    (metric_data->>'correct_rejects')::integer AS correct_rejects
FROM hdd_game_metrics gm
WHERE metric_type LIKE 'biometric_%';

-- ===========================================
-- 2. FIJAR search_path EN FUNCIONES HCE
-- Previene inyección de schema (search_path mutable)
-- ===========================================

DO $$
DECLARE
  func_name TEXT;
BEGIN
  FOR func_name IN
    SELECT unnest(ARRAY[
      'hce_log_sign', 'hce_log_insert', 'hce_prevent_delete',
      'hce_protect_patient_delete', 'hce_audit_immutable',
      'hce_prevent_hash_update', 'hce_prevent_unsign',
      'hce_prevent_content_update', 'generate_hc_number',
      'hce_auto_sign_timestamp', 'hce_generate_hash'
    ])
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public', func_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not alter function %: %', func_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ===========================================
-- 3. POLÍTICA RLS PARA professional_audit_log
-- Permite acceso via service_role (funciones serverless)
-- ===========================================

-- Service role bypass RLS by default, but add explicit policy for clarity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'professional_audit_log'
  ) THEN
    -- Allow service_role full access (already bypasses RLS, but explicit)
    EXECUTE 'CREATE POLICY service_all_audit ON professional_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true)';
    -- Allow authenticated users to read their own audit entries
    EXECUTE 'CREATE POLICY auth_select_own_audit ON professional_audit_log FOR SELECT TO authenticated USING (professional_email = current_setting(''request.jwt.claims'', true)::json->>''email'')';
  END IF;
END $$;

-- ===========================================
-- 4. GRANT SELECT en vistas a service_role
-- ===========================================
GRANT SELECT ON v_patient_game_summary TO service_role;
GRANT SELECT ON v_patient_clinical_profile TO service_role;
GRANT SELECT ON v_hce_resumen_paciente TO service_role;
GRANT SELECT ON v_hdd_session_analysis TO service_role;
GRANT SELECT ON v_professional_patient_interactions TO service_role;
GRANT SELECT ON v_professional_usage_summary TO service_role;
GRANT SELECT ON hdd_game_biometrics TO service_role;

SELECT 'Migration 019: Security fixes from audit — complete';
