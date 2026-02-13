-- Neuro-Chef Telemetry Tables
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.hdd_neurochef_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES hdd_patients(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  session_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hdd_neurochef_telemetry (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES hdd_neurochef_sessions(session_id) ON DELETE CASCADE,
  patient_id uuid REFERENCES hdd_patients(id) ON DELETE CASCADE,
  game_level text DEFAULT 'la_mesa_puesta_v1',
  telemetry jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neurochef_sessions_patient ON hdd_neurochef_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_neurochef_telemetry_patient ON hdd_neurochef_telemetry(patient_id);
CREATE INDEX IF NOT EXISTS idx_neurochef_telemetry_session ON hdd_neurochef_telemetry(session_id);

ALTER TABLE public.hdd_neurochef_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hdd_neurochef_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS neurochef_sessions_insert_policy ON public.hdd_neurochef_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY IF NOT EXISTS neurochef_telemetry_insert_policy ON public.hdd_neurochef_telemetry
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY IF NOT EXISTS neurochef_sessions_select_policy ON public.hdd_neurochef_sessions
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid()::uuid OR EXISTS (SELECT 1 FROM hdd_staff WHERE user_id = auth.uid()));

CREATE POLICY IF NOT EXISTS neurochef_telemetry_select_policy ON public.hdd_neurochef_telemetry
  FOR SELECT TO authenticated
  USING (patient_id = auth.uid()::uuid OR EXISTS (SELECT 1 FROM hdd_staff WHERE user_id = auth.uid()));

GRANT ALL ON public.hdd_neurochef_sessions TO service_role;
GRANT ALL ON public.hdd_neurochef_telemetry TO service_role;
