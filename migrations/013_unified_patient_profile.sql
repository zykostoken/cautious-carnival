-- ============================================================
-- MIGRATION 013: Unified Patient Clinical Profile
-- One flat table (hdd_game_metrics), no compartmentalization.
-- Views project the cross-game longitudinal patient profile.
-- ============================================================
--
-- DOMINIOS CLÍNICOS POR JUEGO
-- ─────────────────────────────────────────────────────────────
-- neuro-chef-v2
--   Cognitivo: atención selectiva e inhibición (d-prime, false_alarms),
--              memoria de trabajo (secuencia de pasos multi-nivel)
--   Motor:     temblor intencional (tremor_avg/speed_var durante drag),
--              redireccionamientos bruscos (abrupt_direction_changes),
--              latencia de acción (reaction_time_ms, hesitation_count)
--
-- pill-organizer
--   Motor fino: temblor durante presión sostenida (botón derecho hold-drag),
--               eficiencia de trayectoria (pathEfficiency),
--               redireccionamientos bruscos (abruptRedirections),
--               hesitaciones durante arrastre (hesitationMs, hesitationCount),
--               velocidad media (avgSpeed px/ms)
--   Cognitivo: planificación farmacológica, memoria prospectiva
--
-- super-market
--   Cognitivo: planificación y presupuesto (compras dentro de límite),
--              memoria de trabajo (receta/lista de compras),
--              atención y comprensión de consignas complejas,
--              bagaje cultural previo (recetas, listas de lavandería),
--              ejecución diferida del plan (plan → acción secuenciada)
--   Motor:     hesitation (avg_hesitation_ms), scan_score (eficiencia visual),
--              first_click_latency_ms (inicio de ejecución)
--
-- fridge-logic
--   Cognitivo: categorización y seriación práctica,
--              conocimiento cotidiano previo (seguridad alimentaria),
--              indemnidad del acervo ideativo (category_pct, safety_pct),
--              jerarquización ideativa, razonamiento y cálculo (presupuesto),
--              toma de decisiones bajo incertidumbre (clinical_flags)
--
-- lawn-mower
--   Atención:  dirigida, sostenida, mantenida, redireccionada (RT, RT-SD, CV)
--              detección de señal (omission_errors = silencio, commission_errors = impulsividad)
--   Ejecutivo: comprensión de consignas, planificación visuoespacial,
--              inhibición de impulso (commission_errors, impulsivity_ratio),
--              tenacidad vs compromise (perseveración en el error vs corrección),
--              frustración (reset_events, abandono)
--   Motor:     sistema neuromotor (movement_efficiency, path_efficiency),
--              temblor de reposo/trabajo (lawn-mower usa teclado → NO válido para temblor),
--              aleatoriedad y redirección brusca (rt_variability_sd, long_pauses)
--   NOTA: Si input_method = 'keyboard' → descartar métricas motoras finas.
--         Si input_method = 'mouse' → válido para RT y eficiencia motor.
--         Pantallas táctiles: criterios no homologados entre calidades de hardware.
--
-- daily-routine-v2
--   Cognitivo: abstracción y proyección de personalidad/timia,
--              bagaje cultural previo (higiene, orden, rutinas sociales),
--              secuenciación instrumental (tender cama, lavarse manos),
--              inhibición y selección (descartar hábitos no saludables)
--   Motor:     más fluido y espontáneo que pill-organizer (menor planificación),
--              usa biomet.js compartido → tremor reposo/inicio/terminal,
--              eficiencia de trayectoria, hesitaciones
--   Proyectivo: healthy_selected vs unhealthy_selected revela insight
--               sobre la propia conducta y la norma social percibida
--
-- NOTA GENERAL SOBRE HARDWARE
-- ─────────────────────────────────────────────────────────────
-- • Mouse:            mejor hardware para homologar métricas motoras.
--                     tremorIndex, pathEfficiency, abruptRedirections VÁLIDOS.
-- • Teclado:          LECTURA ERRÓNEA para temblor y destreza motora.
--                     Solo válido para RT y métricas cognitivas (tiempo de reacción,
--                     errores de omisión/comisión en lawn-mower).
-- • Pantalla táctil:  difícil homologar criterios entre calidades de hardware
--                     (sampling rate, área de contacto, latencia).
--                     Usar con cautela para índices motores finos.
-- ─────────────────────────────────────────────────────────────

-- ----------------------------------------------------------------
-- 1. Ensure hdd_game_metrics has patient_dni for DNI-based saves
--    (some games resolve UUID, others pass DNI directly)
-- ----------------------------------------------------------------
ALTER TABLE hdd_game_metrics
  ADD COLUMN IF NOT EXISTS patient_dni VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_id
  ON hdd_game_metrics(patient_id);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_dni
  ON hdd_game_metrics(patient_dni);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_game_slug
  ON hdd_game_metrics(game_slug);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_metric_type
  ON hdd_game_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_session_date
  ON hdd_game_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hdd_game_metrics_patient_game
  ON hdd_game_metrics(patient_id, game_slug, metric_type);

-- ----------------------------------------------------------------
-- 2. Normalize biometric field aliases across games
--    Each game uses slightly different field names for the same
--    clinical markers. This view normalizes them.
--
--    Canonical field → game-specific fallbacks:
--      mean_rt_ms        : reaction_time_ms (neuro-chef) | mean_rt_ms (lawn-mower, pill-organizer)
--      tremor_index      : tremor_avg (neuro-chef) | tremor_index (pill-organizer)
--      commission_errors : false_alarms (neuro-chef) | commission_errors (lawn-mower)
--      omission_errors   : misses (neuro-chef) | omission_errors (lawn-mower)
--      hesitation_count  : hesitation_count (all)
--      movement_eff      : movement_efficiency (pill-organizer, lawn-mower)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_game_metrics_normalized AS
SELECT
  m.id,
  m.patient_id,
  m.patient_dni,
  m.game_slug,
  m.metric_type,
  m.metric_value,
  m.created_at,

  -- Canonical reaction time (ms)
  COALESCE(
    (m.metric_data->>'mean_rt_ms')::NUMERIC,
    (m.metric_data->>'reaction_time_ms')::NUMERIC
  ) AS mean_rt_ms,

  -- Canonical tremor index
  COALESCE(
    (m.metric_data->>'tremor_index')::NUMERIC,
    (m.metric_data->>'tremor_avg')::NUMERIC
  ) AS tremor_index,

  -- Commission errors (false alarms / wrong selections)
  COALESCE(
    (m.metric_data->>'commission_errors')::INT,
    (m.metric_data->>'false_alarms')::INT,
    (m.metric_data->>'errors')::INT
  ) AS commission_errors,

  -- Omission errors (misses / items not processed)
  COALESCE(
    (m.metric_data->>'omission_errors')::INT,
    (m.metric_data->>'misses')::INT
  ) AS omission_errors,

  -- Hesitation count
  (m.metric_data->>'hesitation_count')::INT AS hesitation_count,

  -- Movement / path efficiency (0–1)
  COALESCE(
    (m.metric_data->>'movement_efficiency')::NUMERIC,
    (m.metric_data->>'placement_pct')::NUMERIC
  ) AS movement_efficiency,

  -- d-prime (signal detection, neuro-chef only)
  (m.metric_data->>'d_prime')::NUMERIC AS d_prime,

  -- Duration
  COALESCE(
    (m.metric_data->>'duration_sec')::INT,
    (m.metric_data->>'duration_seconds')::INT
  ) AS duration_sec,

  -- Redireccionamientos bruscos (motor: ataxia, temblor intencional, impulsividad)
  COALESCE(
    (m.metric_data->>'avg_abrupt_redirections')::NUMERIC,
    (m.metric_data->>'abrupt_direction_changes')::NUMERIC
  ) AS abrupt_redirections,

  -- Dispositivo de entrada (mouse | touch | keyboard | unknown)
  -- CRÍTICO: descartar métricas motoras finas si input_device = 'keyboard'
  COALESCE(
    m.metric_data->>'input_device',
    m.metric_data->>'input_method'
  ) AS input_device,

  -- Score
  m.metric_value AS score

FROM hdd_game_metrics m
WHERE m.metric_type = 'session_complete';

-- ----------------------------------------------------------------
-- 3. Per-patient per-game longitudinal summary
--    baseline → latest → progress, per canonical metric
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_patient_game_summary AS
SELECT
  n.patient_id,
  n.game_slug,
  COUNT(*)                         AS total_sessions,
  MIN(n.created_at)                AS first_session_at,
  MAX(n.created_at)                AS last_session_at,
  ROUND(AVG(n.score))              AS avg_score,
  MIN(n.score)                     AS min_score,
  MAX(n.score)                     AS max_score,

  -- Baseline (first session)
  (SELECT score FROM v_game_metrics_normalized
    WHERE patient_id = n.patient_id AND game_slug = n.game_slug
    ORDER BY created_at ASC LIMIT 1)            AS baseline_score,

  -- Latest session score
  (SELECT score FROM v_game_metrics_normalized
    WHERE patient_id = n.patient_id AND game_slug = n.game_slug
    ORDER BY created_at DESC LIMIT 1)           AS latest_score,

  -- Score progress (latest - baseline)
  (SELECT score FROM v_game_metrics_normalized
    WHERE patient_id = n.patient_id AND game_slug = n.game_slug
    ORDER BY created_at DESC LIMIT 1)
  -
  (SELECT score FROM v_game_metrics_normalized
    WHERE patient_id = n.patient_id AND game_slug = n.game_slug
    ORDER BY created_at ASC LIMIT 1)            AS score_progress,

  -- Biometric averages
  ROUND(AVG(n.mean_rt_ms))         AS avg_rt_ms,
  ROUND(AVG(n.tremor_index), 2)    AS avg_tremor,
  ROUND(AVG(n.commission_errors))  AS avg_commission_errors,
  ROUND(AVG(n.omission_errors))    AS avg_omission_errors,
  ROUND(AVG(n.hesitation_count))   AS avg_hesitations,
  ROUND(AVG(n.movement_efficiency), 2) AS avg_movement_eff,
  ROUND(AVG(n.d_prime), 2)         AS avg_d_prime,
  ROUND(AVG(n.abrupt_redirections), 2) AS avg_abrupt_redirections,

  -- Si alguna sesión usó teclado → las métricas motoras de esa sesión son inválidas
  -- El clínico debe filtrar por input_device = 'mouse' para análisis motor fino
  BOOL_OR(n.input_device = 'keyboard') AS has_keyboard_sessions,
  MODE() WITHIN GROUP (ORDER BY n.input_device) AS dominant_input_device

FROM v_game_metrics_normalized n
GROUP BY n.patient_id, n.game_slug;

-- ----------------------------------------------------------------
-- 4. Full cross-game clinical profile per patient
--    One row per patient — aggregates ALL games
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_patient_clinical_profile AS
SELECT
  p.id            AS patient_id,
  p.dni,
  p.full_name,
  p.admission_date,

  -- Activity
  COUNT(DISTINCT n.game_slug)      AS games_played,
  COUNT(n.id)                      AS total_sessions,
  MAX(n.created_at)                AS last_activity_at,

  -- Overall performance
  ROUND(AVG(n.score))              AS overall_avg_score,
  MAX(n.score)                     AS best_score_ever,

  -- Cross-game biometric averages (canonical)
  ROUND(AVG(n.mean_rt_ms))         AS avg_rt_ms,
  ROUND(AVG(n.tremor_index), 2)    AS avg_tremor,
  ROUND(AVG(n.commission_errors))  AS avg_commission_errors,
  ROUND(AVG(n.omission_errors))    AS avg_omission_errors,
  ROUND(AVG(n.hesitation_count))   AS avg_hesitations,
  ROUND(AVG(n.movement_efficiency), 2) AS avg_movement_eff,
  ROUND(AVG(n.d_prime), 2)         AS avg_d_prime,

  -- Trend: last 3 sessions avg vs first 3 sessions avg
  (
    SELECT ROUND(AVG(score)) FROM (
      SELECT score FROM v_game_metrics_normalized
      WHERE patient_id = p.id
      ORDER BY created_at DESC LIMIT 3
    ) recent
  ) -
  (
    SELECT ROUND(AVG(score)) FROM (
      SELECT score FROM v_game_metrics_normalized
      WHERE patient_id = p.id
      ORDER BY created_at ASC LIMIT 3
    ) early
  )                                AS global_score_trend,

  -- Per-game breakdown as JSON array
  (
    SELECT jsonb_agg(jsonb_build_object(
      'game_slug',      gs.game_slug,
      'sessions',       gs.total_sessions,
      'avg_score',      gs.avg_score,
      'baseline',       gs.baseline_score,
      'latest',         gs.latest_score,
      'progress',       gs.score_progress,
      'avg_rt_ms',      gs.avg_rt_ms,
      'avg_tremor',     gs.avg_tremor,
      'avg_hesitations',gs.avg_hesitations,
      'first_at',       gs.first_session_at,
      'last_at',        gs.last_session_at
    ) ORDER BY gs.last_session_at DESC)
    FROM v_patient_game_summary gs
    WHERE gs.patient_id = p.id
  )                                AS game_breakdown

FROM hdd_patients p
LEFT JOIN v_game_metrics_normalized n ON n.patient_id = p.id
GROUP BY p.id, p.dni, p.full_name, p.admission_date;

-- ----------------------------------------------------------------
-- 5. Longitudinal time series — all games, per patient (for charts)
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW v_patient_longitudinal AS
SELECT
  n.patient_id,
  n.game_slug,
  n.id              AS metric_id,
  n.score,
  n.created_at,
  n.mean_rt_ms,
  n.tremor_index,
  n.commission_errors,
  n.omission_errors,
  n.hesitation_count,
  n.movement_efficiency,
  n.d_prime,
  n.duration_sec,
  n.abrupt_redirections,
  n.input_device,
  ROW_NUMBER() OVER (
    PARTITION BY n.patient_id, n.game_slug
    ORDER BY n.created_at
  ) AS session_number
FROM v_game_metrics_normalized n
ORDER BY n.patient_id, n.game_slug, n.created_at;

-- ----------------------------------------------------------------
-- 6. Permissions
-- ----------------------------------------------------------------
GRANT SELECT ON v_game_metrics_normalized   TO anon, authenticated;
GRANT SELECT ON v_patient_game_summary      TO anon, authenticated;
GRANT SELECT ON v_patient_clinical_profile  TO anon, authenticated;
GRANT SELECT ON v_patient_longitudinal      TO anon, authenticated;
GRANT ALL    ON hdd_game_metrics            TO anon, authenticated, service_role;

SELECT 'Migration 013: unified patient clinical profile complete';
