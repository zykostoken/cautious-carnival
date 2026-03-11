-- =============================================
-- AUDIT REMEDIATION Phase 2: RLS, CASCADE, Hash Chain
-- Date: 2026-03-11
-- Applied to Supabase project: buzblnkpfydeheingzgn
-- =============================================

-- =============================================
-- 1. Fix USING(true) RLS policies on PHI tables
-- Replace open access with service_role-only
-- =============================================

-- hdd_patients: service_role for all, anon limited select
DROP POLICY IF EXISTS "anon_insert" ON hdd_patients;
DROP POLICY IF EXISTS "anon_select" ON hdd_patients;
DROP POLICY IF EXISTS "anon_update" ON hdd_patients;
DROP POLICY IF EXISTS "auth_all_hdd_patients" ON hdd_patients;
DROP POLICY IF EXISTS "hdd_patients_service_role" ON hdd_patients;
DROP POLICY IF EXISTS "hdd_patients_anon_select_limited" ON hdd_patients;
CREATE POLICY "hdd_patients_service_role" ON hdd_patients FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "hdd_patients_anon_select_limited" ON hdd_patients FOR SELECT TO anon
  USING (status = 'active');

-- healthcare_professionals: service_role for all, anon limited select
DROP POLICY IF EXISTS "anon_insert" ON healthcare_professionals;
DROP POLICY IF EXISTS "anon_select" ON healthcare_professionals;
DROP POLICY IF EXISTS "anon_update" ON healthcare_professionals;
DROP POLICY IF EXISTS "auth_all_healthcare_professionals" ON healthcare_professionals;
DROP POLICY IF EXISTS "hp_service_role" ON healthcare_professionals;
DROP POLICY IF EXISTS "hp_anon_select_limited" ON healthcare_professionals;
CREATE POLICY "hp_service_role" ON healthcare_professionals FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "hp_anon_select_limited" ON healthcare_professionals FOR SELECT TO anon
  USING (is_active = TRUE);

-- hce_clinical_entries: service_role only
DROP POLICY IF EXISTS "Allow all on hce_clinical_entries" ON hce_clinical_entries;
DROP POLICY IF EXISTS "hce_clinical_entries_service_role" ON hce_clinical_entries;
CREATE POLICY "hce_clinical_entries_service_role" ON hce_clinical_entries FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- hdd_game_metrics: service_role + anon insert/select for game telemetry
DROP POLICY IF EXISTS "anon_insert" ON hdd_game_metrics;
DROP POLICY IF EXISTS "anon_select" ON hdd_game_metrics;
DROP POLICY IF EXISTS "auth_all_game_metrics" ON hdd_game_metrics;
DROP POLICY IF EXISTS "game_metrics_service_role" ON hdd_game_metrics;
DROP POLICY IF EXISTS "game_metrics_anon_insert" ON hdd_game_metrics;
DROP POLICY IF EXISTS "game_metrics_anon_select" ON hdd_game_metrics;
CREATE POLICY "game_metrics_service_role" ON hdd_game_metrics FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "game_metrics_anon_insert" ON hdd_game_metrics FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "game_metrics_anon_select" ON hdd_game_metrics FOR SELECT TO anon USING (true);

-- hdd_game_sessions: service_role + anon insert/select/update
DROP POLICY IF EXISTS "anon_insert" ON hdd_game_sessions;
DROP POLICY IF EXISTS "anon_select" ON hdd_game_sessions;
DROP POLICY IF EXISTS "anon_update" ON hdd_game_sessions;
DROP POLICY IF EXISTS "game_sessions_service_role" ON hdd_game_sessions;
DROP POLICY IF EXISTS "game_sessions_anon_insert" ON hdd_game_sessions;
DROP POLICY IF EXISTS "game_sessions_anon_select" ON hdd_game_sessions;
DROP POLICY IF EXISTS "game_sessions_anon_update" ON hdd_game_sessions;
CREATE POLICY "game_sessions_service_role" ON hdd_game_sessions FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "game_sessions_anon_insert" ON hdd_game_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "game_sessions_anon_select" ON hdd_game_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "game_sessions_anon_update" ON hdd_game_sessions FOR UPDATE TO anon USING (true);

-- hdd_mood_checkins/entries: service_role + anon insert/select
DROP POLICY IF EXISTS "anon_insert" ON hdd_mood_checkins;
DROP POLICY IF EXISTS "anon_select" ON hdd_mood_checkins;
DROP POLICY IF EXISTS "mood_checkins_service_role" ON hdd_mood_checkins;
DROP POLICY IF EXISTS "mood_checkins_anon_insert" ON hdd_mood_checkins;
DROP POLICY IF EXISTS "mood_checkins_anon_select" ON hdd_mood_checkins;
CREATE POLICY "mood_checkins_service_role" ON hdd_mood_checkins FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "mood_checkins_anon_insert" ON hdd_mood_checkins FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "mood_checkins_anon_select" ON hdd_mood_checkins FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert" ON hdd_mood_entries;
DROP POLICY IF EXISTS "anon_select" ON hdd_mood_entries;
DROP POLICY IF EXISTS "auth_all_mood_entries" ON hdd_mood_entries;
DROP POLICY IF EXISTS "mood_entries_service_role" ON hdd_mood_entries;
DROP POLICY IF EXISTS "mood_entries_anon_insert" ON hdd_mood_entries;
DROP POLICY IF EXISTS "mood_entries_anon_select" ON hdd_mood_entries;
CREATE POLICY "mood_entries_service_role" ON hdd_mood_entries FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "mood_entries_anon_insert" ON hdd_mood_entries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "mood_entries_anon_select" ON hdd_mood_entries FOR SELECT TO anon USING (true);

-- hdd_crisis_alerts: service_role + anon insert only
DROP POLICY IF EXISTS "anon_insert" ON hdd_crisis_alerts;
DROP POLICY IF EXISTS "anon_select" ON hdd_crisis_alerts;
DROP POLICY IF EXISTS "anon_update" ON hdd_crisis_alerts;
DROP POLICY IF EXISTS "crisis_alerts_service_role" ON hdd_crisis_alerts;
DROP POLICY IF EXISTS "crisis_alerts_anon_insert" ON hdd_crisis_alerts;
CREATE POLICY "crisis_alerts_service_role" ON hdd_crisis_alerts FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
CREATE POLICY "crisis_alerts_anon_insert" ON hdd_crisis_alerts FOR INSERT TO anon WITH CHECK (true);

-- hce_audit_log: service_role only
DROP POLICY IF EXISTS "hce_audit_insert" ON hce_audit_log;
DROP POLICY IF EXISTS "hce_audit_select" ON hce_audit_log;
DROP POLICY IF EXISTS "hce_audit_service_role" ON hce_audit_log;
CREATE POLICY "hce_audit_service_role" ON hce_audit_log FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- =============================================
-- 2. Add RLS policies to 7 unprotected HCE tables
-- =============================================

DROP POLICY IF EXISTS "hce_evoluciones_service_role" ON hce_evoluciones;
CREATE POLICY "hce_evoluciones_service_role" ON hce_evoluciones FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "hce_diagnosticos_service_role" ON hce_diagnosticos;
CREATE POLICY "hce_diagnosticos_service_role" ON hce_diagnosticos FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "hce_medicacion_service_role" ON hce_medicacion;
CREATE POLICY "hce_medicacion_service_role" ON hce_medicacion FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "hce_antecedentes_service_role" ON hce_antecedentes;
CREATE POLICY "hce_antecedentes_service_role" ON hce_antecedentes FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "hce_estudios_service_role" ON hce_estudios;
CREATE POLICY "hce_estudios_service_role" ON hce_estudios FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "hce_signos_vitales_service_role" ON hce_signos_vitales;
CREATE POLICY "hce_signos_vitales_service_role" ON hce_signos_vitales FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "professional_audit_log_service_role" ON professional_audit_log;
CREATE POLICY "professional_audit_log_service_role" ON professional_audit_log FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- =============================================
-- 3. Remove ON DELETE CASCADE from HCE tables
-- Replace with RESTRICT (Ley 26.529 - 10 year retention)
-- =============================================

ALTER TABLE hce_antecedentes DROP CONSTRAINT IF EXISTS hce_antecedentes_patient_id_fkey;
ALTER TABLE hce_antecedentes ADD CONSTRAINT hce_antecedentes_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_diagnosticos DROP CONSTRAINT IF EXISTS hce_diagnosticos_patient_id_fkey;
ALTER TABLE hce_diagnosticos ADD CONSTRAINT hce_diagnosticos_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_medicacion DROP CONSTRAINT IF EXISTS hce_medicacion_patient_id_fkey;
ALTER TABLE hce_medicacion ADD CONSTRAINT hce_medicacion_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_evoluciones DROP CONSTRAINT IF EXISTS hce_evoluciones_patient_id_fkey;
ALTER TABLE hce_evoluciones ADD CONSTRAINT hce_evoluciones_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_estudios DROP CONSTRAINT IF EXISTS hce_estudios_patient_id_fkey;
ALTER TABLE hce_estudios ADD CONSTRAINT hce_estudios_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_signos_vitales DROP CONSTRAINT IF EXISTS hce_signos_vitales_patient_id_fkey;
ALTER TABLE hce_signos_vitales ADD CONSTRAINT hce_signos_vitales_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

ALTER TABLE hce_clinical_entries DROP CONSTRAINT IF EXISTS hce_clinical_entries_patient_id_fkey;
ALTER TABLE hce_clinical_entries ADD CONSTRAINT hce_clinical_entries_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES hdd_patients(id) ON DELETE RESTRICT;

-- =============================================
-- 4. Block hard DELETE on hdd_patients (soft-delete only)
-- =============================================

CREATE OR REPLACE FUNCTION prevent_patient_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'No se permite eliminar pacientes. Use status=inactive (Ley 26.529 - retencion 10 anios)';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_patient_delete ON hdd_patients;
CREATE TRIGGER trg_prevent_patient_delete
  BEFORE DELETE ON hdd_patients
  FOR EACH ROW
  EXECUTE FUNCTION prevent_patient_hard_delete();

-- =============================================
-- 5. Hash chain trigger for hce_clinical_entries
-- =============================================

CREATE OR REPLACE FUNCTION hce_compute_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash VARCHAR(128);
BEGIN
  SELECT entry_hash INTO prev_hash
  FROM hce_clinical_entries
  WHERE patient_id = NEW.patient_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  NEW.previous_entry_hash := COALESCE(prev_hash, 'GENESIS');
  NEW.entry_hash := encode(
    sha256(convert_to(
      COALESCE(NEW.content, '') || '|' ||
      COALESCE(NEW.professional_id::text, '') || '|' ||
      COALESCE(NEW.created_at::text, NOW()::text) || '|' ||
      COALESCE(NEW.previous_entry_hash, 'GENESIS'),
      'UTF8'
    )), 'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hce_hash_chain ON hce_clinical_entries;
CREATE TRIGGER trg_hce_hash_chain
  BEFORE INSERT ON hce_clinical_entries
  FOR EACH ROW
  EXECUTE FUNCTION hce_compute_hash_chain();
