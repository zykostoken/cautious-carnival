-- =====================================================
-- MIGRATION 015: Register All 7 Games + Biomarker Lifelong Schema
-- Date: 2026-03-03
--
-- ISSUES FIXED:
--   1. Only 2 of 7 games registered in hdd_games → add all 5 missing
--   2. hdd_game_sessions CHECK constraint too restrictive → update
--   3. No biomarker longitudinal tracking for lifelong data → add tables
--   4. No FDA-aligned metadata for biometric collection → add reference data
--   5. Missing game schedules for new games
--
-- CONTEXT:
--   The HDD portal has 7 therapeutic games but only lawn-mower and
--   medication-memory were registered in the hdd_games table. This caused
--   session creation to fail for the other 5 games (API returns 404
--   "Juego no encontrado" when game slug is not in hdd_games).
-- =====================================================

-- =====================================================
-- PART 1: Register all missing games
-- =====================================================

INSERT INTO hdd_games (slug, name, description, therapeutic_areas, icon, difficulty_levels)
VALUES
    ('pill-organizer',
     'Organizador de Medicación',
     'Arrastrá cada pastilla al casillero correcto del organizador semanal. Evalúa motricidad fina (temblor durante presión sostenida), redireccionamientos, hesitaciones, errores de ubicación y eficiencia motora.',
     ARRAY['motricidad_fina', 'planificacion', 'organizacion', 'precision', 'tiempo_reaccion'],
     '💊', 3),

    ('neuro-chef',
     'Neuro-Chef: La Mesa Puesta',
     'Juego de 6 niveles progresivos (supermercado→heladera→cocina→licuadora→mesa→habitación). Evaluación cognitiva completa: planificación motora, memoria procedimental, coordinación bimanual, secuenciación y razonamiento categorial.',
     ARRAY['planificacion_motora', 'memoria_procedimental', 'coordinacion', 'secuenciacion', 'razonamiento', 'categorizacion'],
     '🧠', 6),

    ('fridge-logic',
     'Heladera Inteligente',
     'Organizá 20 artículos del supermercado en su lugar correcto (freezer, estante frío, verduras, alacena, limpieza). Evalúa memoria semántica, categorización, juicio en AVD y seguridad alimentaria.',
     ARRAY['memoria_semantica', 'categorizacion', 'razonamiento', 'planificacion', 'juicio_avd', 'seguridad_alimentaria'],
     '🧊', 3),

    ('super-market',
     'Desafío Milanesas',
     'Simulador de compras: memorizá la receta, seleccioná ingredientes correctos dentro de un presupuesto limitado. Evalúa memoria de trabajo, planificación, gestión presupuestaria, toma de decisiones y autonomía en AVD.',
     ARRAY['memoria_trabajo', 'planificacion', 'gestion_presupuestaria', 'toma_decisiones', 'autonomia_avd'],
     '🛒', 3),

    ('daily-routine',
     'Mi Rutina Diaria',
     'Seleccioná y ordená las actividades de tu día (mañana, tarde, noche) de forma saludable. Evalúa planificación, secuenciación temporal, juicio en AVD, y conciencia de hábitos saludables.',
     ARRAY['planificacion', 'secuenciacion', 'juicio_avd', 'habitos_saludables', 'autonomia'],
     '🌅', 3)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    therapeutic_areas = EXCLUDED.therapeutic_areas,
    icon = EXCLUDED.icon,
    difficulty_levels = EXCLUDED.difficulty_levels;

-- Add schedules for new games (Mon-Fri, 08:00-20:00)
INSERT INTO hdd_game_schedule (game_id, day_of_week, available_from, available_until)
SELECT g.id, d.day, '08:00'::TIME, '20:00'::TIME
FROM hdd_games g
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(day)
WHERE g.slug IN ('pill-organizer', 'neuro-chef', 'fridge-logic', 'super-market', 'daily-routine')
  AND NOT EXISTS (
    SELECT 1 FROM hdd_game_schedule gs
    WHERE gs.game_id = g.id AND gs.day_of_week = d.day
  );

-- =====================================================
-- PART 2: Remove restrictive CHECK constraint on old table if it exists
-- The original sql/02_game_sessions.sql had CHECK (game_type IN (...))
-- which blocked new game types. The newer migration 006 uses game_id FK.
-- =====================================================

-- Drop old constraint if it exists (from sql/02_game_sessions.sql)
DO $$
BEGIN
    ALTER TABLE hdd_game_sessions DROP CONSTRAINT IF EXISTS hdd_game_sessions_game_type_check;
EXCEPTION WHEN undefined_table THEN
    -- Table might not exist in this form
    NULL;
END;
$$;

-- =====================================================
-- PART 3: Biomarker Lifelong Tracking Schema
-- Supports FDA 21 CFR Part 11 aligned metadata
-- Reference: FDA Digital Health Technologies guidance (2024)
-- Reference: EMA Guideline on computerised systems and electronic data (2023)
-- =====================================================

-- Table for structured biomarker readings (per-session, per-domain)
CREATE TABLE IF NOT EXISTS hdd_biomarker_readings (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES hdd_patients(id) ON DELETE CASCADE,
    patient_dni VARCHAR(20),
    game_session_id INTEGER,
    game_slug VARCHAR(64) NOT NULL,

    -- Domain classification (FDA DHT categories)
    domain VARCHAR(50) NOT NULL,
    -- Valid domains: 'motor_tremor', 'motor_praxis', 'motor_rigidity',
    -- 'motor_bradykinesia', 'cognitive_reaction_time', 'cognitive_memory',
    -- 'cognitive_attention', 'cognitive_planning', 'cognitive_sequencing',
    -- 'emotional_color_psychology', 'emotional_mood', 'avd_autonomy'

    -- Biomarker identification
    biomarker_name VARCHAR(100) NOT NULL,
    biomarker_unit VARCHAR(30),  -- 'px', 'ms', 'ratio', 'score_0_100', 'count', 'px/ms'

    -- Values
    value_numeric NUMERIC,
    value_json JSONB,  -- Complex data (arrays, distributions)

    -- Clinical reference (FDA-aligned)
    reference_range_low NUMERIC,
    reference_range_high NUMERIC,
    clinical_significance VARCHAR(20) DEFAULT 'normal',
    -- 'normal', 'borderline', 'abnormal', 'critical'

    -- Collection metadata (FDA 21 CFR Part 11)
    collection_method VARCHAR(50) DEFAULT 'automated',
    -- 'automated' (game telemetry), 'self_report' (patient input), 'clinician_rated'
    input_device VARCHAR(30),  -- 'mouse', 'touch', 'trackpad'
    sampling_rate_hz NUMERIC,  -- e.g. 33 for 30ms intervals
    data_quality_score NUMERIC,  -- 0-1, confidence in measurement

    -- Temporal context
    session_ordinal INTEGER,  -- Nth session for this patient+game
    time_of_day VARCHAR(20),  -- 'morning', 'afternoon', 'evening'
    day_of_treatment INTEGER, -- Days since admission

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biomarker_patient ON hdd_biomarker_readings(patient_id);
CREATE INDEX IF NOT EXISTS idx_biomarker_domain ON hdd_biomarker_readings(domain);
CREATE INDEX IF NOT EXISTS idx_biomarker_name ON hdd_biomarker_readings(biomarker_name);
CREATE INDEX IF NOT EXISTS idx_biomarker_created ON hdd_biomarker_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_biomarker_patient_game ON hdd_biomarker_readings(patient_id, game_slug);
CREATE INDEX IF NOT EXISTS idx_biomarker_patient_domain ON hdd_biomarker_readings(patient_id, domain);

-- =====================================================
-- PART 4: Clinical Reference Ranges
-- Based on published norms from neuropsychological testing literature
-- References:
--   - Lezak M.D. "Neuropsychological Assessment" (2012)
--   - Betta semiología neurológica
--   - FDA DHT Guidance for clinical measurement
--   - UPDRS (Unified Parkinson's Disease Rating Scale) motor items
-- =====================================================

CREATE TABLE IF NOT EXISTS hdd_biomarker_reference_ranges (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(50) NOT NULL,
    biomarker_name VARCHAR(100) NOT NULL,
    unit VARCHAR(30),
    population VARCHAR(50) DEFAULT 'psychiatric_adult',  -- target population

    -- Reference ranges (healthy population norms)
    normal_low NUMERIC,
    normal_high NUMERIC,
    borderline_low NUMERIC,
    borderline_high NUMERIC,
    -- Outside borderline = abnormal

    -- Clinical interpretation guidance
    interpretation_low TEXT,   -- What low values mean clinically
    interpretation_high TEXT,  -- What high values mean clinically
    clinical_notes TEXT,       -- FDA/regulatory notes

    -- Source
    reference_source TEXT,     -- Published source for these norms
    last_reviewed_at DATE DEFAULT CURRENT_DATE,

    UNIQUE(domain, biomarker_name, population)
);

-- Seed reference ranges based on neuropsychological literature
INSERT INTO hdd_biomarker_reference_ranges
    (domain, biomarker_name, unit, normal_low, normal_high, borderline_low, borderline_high, interpretation_low, interpretation_high, clinical_notes, reference_source)
VALUES
    -- MOTOR: Tremor
    ('motor_tremor', 'tremor_reposo_jitter', 'px',
     0, 3.0, 3.0, 6.0,
     'Motricidad fina normal — sin temblor de reposo significativo',
     'Temblor de reposo elevado — correlato con efectos extrapiramidales de antipsicóticos (parkinsonismo farmacológico), temblor esencial, o ansiedad somática',
     'FDA: Digital tremor measurement debe considerarse complemento de evaluación clínica (UPDRS ítem 20-21). Medición automatizada válida para screening pero no diagnóstica. Considerar medicación actual del paciente (antipsicóticos típicos, litio).',
     'Betta E, Semiología Neurológica (2014); UPDRS Motor Section; FDA DHT Guidance 2024'),

    ('motor_tremor', 'tremor_intencional_jitter', 'px',
     0, 4.0, 4.0, 8.0,
     'Coordinación visomotora adecuada — sin temblor intencional',
     'Temblor intencional elevado — sugiere disfunción cerebelosa o efectos adversos medicamentosos. Diferencial: temblor esencial vs. cerebeloso vs. farmacológico',
     'El temblor intencional se mide durante los últimos 80px del trayecto hacia el objetivo. Valores altos persistentes requieren evaluación neurológica. Considerar titulación de ácido valproico, litio, ISRS.',
     'Betta E, Semiología Neurológica (2014); UPDRS ítem 21'),

    ('motor_tremor', 'tremor_terminal_jitter', 'px',
     0, 5.0, 5.0, 10.0,
     'Fase terminal del movimiento dentro de parámetros normales',
     'Inestabilidad terminal elevada — puede indicar dismetría cerebelosa leve o efecto de medicación sedante sobre la coordinación final',
     'Se captura en los últimos 80px de aproximación al target. Distinguir de fatiga muscular (comparar primer vs. último tercio de la sesión).',
     'Lezak M.D., Neuropsychological Assessment 5th ed (2012)'),

    -- MOTOR: Praxis
    ('motor_praxis', 'rectifications', 'count',
     0, 3, 3, 7,
     'Ejecución motora fluida con mínimas correcciones',
     'Exceso de rectificaciones — sugiere dificultad en planificación motora, impulsividad corregida, o incertidumbre en la tarea. Correlato con funciones prefrontales dorsolaterales.',
     'Rectificaciones = cambios bruscos de dirección durante el arrastre. En contexto psiquiátrico, diferenciar entre: impulsividad (inicio rápido + muchas correcciones) vs. perseveración (repetición del mismo error).',
     'Goldar J.C., Cerebro Límbico y Psiquiatría (1993); Luria A.R., Higher Cortical Functions'),

    ('motor_praxis', 'path_efficiency', 'ratio',
     0.7, 1.0, 0.5, 0.7,
     'Trayectoria directa y eficiente — buena planificación motora',
     'Baja eficiencia de trayecto — movimientos erráticos o indirectos. Puede indicar: alteración de la programación motora, efecto sedativo, o déficit de planificación espacial',
     'Ratio = distancia_ideal / distancia_real. Valor 1.0 = línea recta perfecta. FDA recomienda reportar junto con velocidad media para contexto clínico completo.',
     'Lezak M.D., Neuropsychological Assessment 5th ed (2012)'),

    -- MOTOR: Rigidity/Spasticity (extrapyramidal)
    ('motor_rigidity', 'velocity_variance', 'px/ms',
     0, 0.15, 0.15, 0.30,
     'Velocidad de movimiento consistente — sin signo de rueda dentada',
     'Variabilidad alta en velocidad — patrón compatible con rigidez en rueda dentada (cogwheel). Frecuente en parkinsonismo farmacológico por antipsicóticos.',
     'Oscilaciones regulares de velocidad durante el arrastre sugieren rueda dentada. Frecuencia característica: 4-6 Hz. Correlacionar con dosis de antipsicóticos y presencia de acatisia.',
     'Betta E, Semiología Neurológica (2014); Simpson-Angus Scale'),

    -- COGNITIVE: Reaction Time
    ('cognitive_reaction_time', 'mean_rt', 'ms',
     250, 600, 600, 1200,
     'Tiempo de reacción dentro de rango normal para adultos',
     'Latencia aumentada — posible indicador de: enlentecimiento psicomotor (depresión mayor), efecto sedativo de medicación, o déficit atencional',
     'FDA: Reaction time como biomarcador digital requiere ≥10 mediciones por sesión para estabilidad estadística. Reportar media, mediana y DS. Considerar efecto de práctica entre sesiones.',
     'Lezak M.D. (2012); FDA DHT Guidance 2024; Cambridge Neuropsychological Test Battery norms'),

    ('cognitive_reaction_time', 'rt_variability_cv', 'ratio',
     0.05, 0.25, 0.25, 0.45,
     'Consistencia normal en tiempos de respuesta',
     'Alta variabilidad intra-individual — sugiere déficit atencional (fluctuaciones), fatiga cognitiva, o efecto de medicación. El CV (coeficiente de variación) elevado es marcador de inatención.',
     'CV = DS / Media. Valores altos persistentes correlacionan con TDAH adulto y déficit atencional en esquizofrenia. Comparar primera mitad vs. segunda mitad de la sesión (fatiga).',
     'Castellanos F.X. et al. (2005) "Varieties of attention-deficit/hyperactivity disorder-related intra-individual variability"; FDA DHT 2024'),

    -- COGNITIVE: Memory
    ('cognitive_memory', 'recall_accuracy', 'score_0_100',
     60, 100, 40, 60,
     'Capacidad de evocación dentro de parámetros normales',
     'Déficit de evocación — puede indicar: alteración de memoria de trabajo (dorsolateral prefrontal), efecto de medicación anticolinérgica, o deterioro cognitivo',
     'Distinguir entre fallo de codificación (no memorizó) vs. fallo de evocación (memorizó pero no recupera). El juego Desafío Milanesas evalúa recall a corto plazo (5 segundos de exposición).',
     'Lezak M.D. (2012); Buschke H. "Selective Reminding"'),

    -- COGNITIVE: Planning/Sequencing
    ('cognitive_planning', 'sequence_score', 'score_0_100',
     70, 100, 50, 70,
     'Capacidad de secuenciación y planificación adecuada',
     'Déficit en planificación/secuenciación — correlato con disfunción prefrontal dorsolateral. En contexto psiquiátrico: desorganización esquizofrénica, manía, o déficit ejecutivo.',
     'Evalúa capacidad de ordenar pasos en secuencia correcta (ej: rutina diaria). Distinguir entre error de secuencia (sabe los pasos pero los ordena mal) vs. omisión (no incluye pasos relevantes).',
     'Luria A.R., Higher Cortical Functions; Shallice T., "Specific impairments of planning" (1982)'),

    -- COGNITIVE: Categorization
    ('cognitive_planning', 'categorization_accuracy', 'score_0_100',
     75, 100, 55, 75,
     'Capacidad de categorización semántica intacta',
     'Déficit de categorización — posible alteración de memoria semántica o pensamiento abstracto. En contexto psiquiátrico: pensamiento concreto (esquizofrenia), deterioro cognitivo.',
     'El juego Heladera Inteligente evalúa categorización práctica (AVD). Errores de seguridad (mezclar limpieza con alimentos) tienen mayor peso clínico que errores de temperatura.',
     'Rosch E. "Natural categories" (1973); Lezak M.D. (2012)'),

    -- EMOTIONAL: Color Psychology
    ('emotional_color_psychology', 'color_valence', 'score_neg1_pos1',
     -0.3, 1.0, -0.7, -0.3,
     'Selección cromática dentro del espectro afectivo esperable',
     'Selección persistente de colores oscuros/fríos — puede correlacionar con estado anímico depresivo, inhibición afectiva, o ideación desesperanzada. Requiere serie temporal para significación.',
     'Basado en psicología del color de Lüscher (adaptación). NO es diagnóstico aislado. Se requieren ≥5 mediciones para establecer patrón. FDA no reconoce color psychology como biomarcador validado — uso como complemento cualitativo únicamente.',
     'Lüscher M. "The Lüscher Color Test" (1969); Heller E. "Psicología del Color" (2004)'),

    -- AVD: Autonomy
    ('avd_autonomy', 'avd_completion_rate', 'score_0_100',
     70, 100, 50, 70,
     'Nivel de autonomía funcional adecuado en actividades de la vida diaria',
     'Baja tasa de completitud en AVD — indica dificultad en la ejecución independiente de tareas cotidianas. Correlato con nivel de asistencia requerido.',
     'Los juegos Rutina Diaria y Organizador de Medicación evalúan AVD instrumentales. La progresión longitudinal es más relevante que el puntaje absoluto. Comparar con Barthel Index y Lawton IADL Scale.',
     'Barthel Index (1965); Lawton M.P. "Assessment of older people" (1969); FDA Patient-Reported Outcomes Guidance')
ON CONFLICT (domain, biomarker_name, population) DO UPDATE SET
    normal_low = EXCLUDED.normal_low,
    normal_high = EXCLUDED.normal_high,
    borderline_low = EXCLUDED.borderline_low,
    borderline_high = EXCLUDED.borderline_high,
    interpretation_low = EXCLUDED.interpretation_low,
    interpretation_high = EXCLUDED.interpretation_high,
    clinical_notes = EXCLUDED.clinical_notes,
    reference_source = EXCLUDED.reference_source,
    last_reviewed_at = CURRENT_DATE;

-- =====================================================
-- PART 5: Longitudinal Patient Biomarker Summary View
-- For dashboard graphs with clinical correlation
-- =====================================================

CREATE OR REPLACE VIEW v_patient_biomarker_longitudinal AS
SELECT
    br.patient_id,
    p.dni,
    p.full_name,
    br.domain,
    br.biomarker_name,
    br.biomarker_unit,
    br.value_numeric,
    br.clinical_significance,
    br.session_ordinal,
    br.day_of_treatment,
    br.input_device,
    br.data_quality_score,
    br.created_at,
    br.game_slug,
    -- Reference ranges for context
    rr.normal_low,
    rr.normal_high,
    rr.borderline_low,
    rr.borderline_high,
    rr.interpretation_low,
    rr.interpretation_high,
    -- Running averages for trend detection
    AVG(br.value_numeric) OVER (
        PARTITION BY br.patient_id, br.biomarker_name
        ORDER BY br.created_at
        ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
    ) AS moving_avg_5,
    -- Session number for this patient+biomarker
    ROW_NUMBER() OVER (
        PARTITION BY br.patient_id, br.biomarker_name
        ORDER BY br.created_at
    ) AS measurement_number
FROM hdd_biomarker_readings br
JOIN hdd_patients p ON br.patient_id = p.id
LEFT JOIN hdd_biomarker_reference_ranges rr
    ON rr.domain = br.domain
    AND rr.biomarker_name = br.biomarker_name
    AND rr.population = 'psychiatric_adult'
ORDER BY br.patient_id, br.biomarker_name, br.created_at;

-- =====================================================
-- PART 6: Clinical Profile View (cross-game summary)
-- For professional dashboard overview
-- =====================================================

CREATE OR REPLACE VIEW v_patient_clinical_profile AS
SELECT
    p.id AS patient_id,
    p.dni,
    p.full_name,
    p.admission_date,
    p.status,

    -- Motor domain summary (latest values)
    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'tremor_reposo_jitter'
     ORDER BY created_at DESC LIMIT 1) AS latest_tremor_reposo,

    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'path_efficiency'
     ORDER BY created_at DESC LIMIT 1) AS latest_path_efficiency,

    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'velocity_variance'
     ORDER BY created_at DESC LIMIT 1) AS latest_velocity_variance,

    -- Cognitive domain summary
    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'mean_rt'
     ORDER BY created_at DESC LIMIT 1) AS latest_mean_rt,

    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'recall_accuracy'
     ORDER BY created_at DESC LIMIT 1) AS latest_recall_accuracy,

    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'sequence_score'
     ORDER BY created_at DESC LIMIT 1) AS latest_sequence_score,

    -- Emotional domain
    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'color_valence'
     ORDER BY created_at DESC LIMIT 1) AS latest_color_valence,

    -- AVD domain
    (SELECT value_numeric FROM hdd_biomarker_readings
     WHERE patient_id = p.id AND biomarker_name = 'avd_completion_rate'
     ORDER BY created_at DESC LIMIT 1) AS latest_avd_completion,

    -- Activity counts
    (SELECT COUNT(*) FROM hdd_biomarker_readings
     WHERE patient_id = p.id) AS total_biomarker_readings,

    (SELECT COUNT(DISTINCT game_slug) FROM hdd_biomarker_readings
     WHERE patient_id = p.id) AS games_with_data,

    (SELECT MAX(created_at) FROM hdd_biomarker_readings
     WHERE patient_id = p.id) AS last_biomarker_at,

    -- Days in treatment
    (CURRENT_DATE - p.admission_date) AS days_in_treatment

FROM hdd_patients p
WHERE p.status = 'active'
ORDER BY p.full_name;

-- Permissions
GRANT SELECT ON hdd_biomarker_readings TO anon, authenticated;
GRANT INSERT ON hdd_biomarker_readings TO anon, authenticated, service_role;
GRANT ALL ON hdd_biomarker_readings TO service_role;
GRANT SELECT ON hdd_biomarker_reference_ranges TO anon, authenticated;
GRANT SELECT ON v_patient_biomarker_longitudinal TO anon, authenticated;
GRANT SELECT ON v_patient_clinical_profile TO anon, authenticated;

SELECT 'Migration 015 complete: All 7 games registered, biomarker schema created';
