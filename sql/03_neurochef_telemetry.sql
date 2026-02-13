-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabla patients (simplificada)
CREATE TABLE public.patients (
  patient_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_id text,
  name text,
  dob date,
  diagnosis text
);

-- Tabla clinical_sessions
CREATE TABLE public.clinical_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(patient_id),
  started_at timestamptz,
  ended_at timestamptz
);

-- Tabla game_telemetry (JSONB)
CREATE TABLE public.game_telemetry (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES public.clinical_sessions(session_id),
  patient_id uuid REFERENCES public.patients(patient_id),
  game_level text,
  telemetry jsonb,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS y políticas (ejemplo mínimo: ajustar según claims)
ALTER TABLE public.game_telemetry ENABLE ROW LEVEL SECURITY;

-- Política de inserción: permitir a usuarios autenticados insertar (ajustar según auth.claims)
CREATE POLICY telemetry_insert_policy ON public.game_telemetry
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Bloquear updates y deletes para mantener append-only (controlar roles clínicos)
REVOKE UPDATE, DELETE ON public.game_telemetry FROM public;