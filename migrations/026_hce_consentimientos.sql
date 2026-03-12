-- Consent table for informed consent persistence (replaces localStorage)
-- Compliance: Ley 26.529, Res. 3316/2023 (telemedicina)

CREATE TABLE IF NOT EXISTS hce_consentimientos (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE RESTRICT,
  tipo VARCHAR(32) NOT NULL, -- 'tratamiento', 'hce', 'medicacion', 'estudios', 'internacion', 'telemedicina'
  otorgado BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones TEXT,
  otorgado_por VARCHAR(255),
  profesional_id INTEGER REFERENCES healthcare_professionals(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revocado_at TIMESTAMPTZ,
  revocado_motivo TEXT
);

ALTER TABLE hce_consentimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hce_consentimientos_service_role" ON hce_consentimientos;
CREATE POLICY "hce_consentimientos_service_role" ON hce_consentimientos FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_hce_consentimientos_patient ON hce_consentimientos(patient_id, tipo);
