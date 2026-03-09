-- ============================================================
-- MIGRATION 020: Modalidad de atención del paciente
-- Permite agrupar pacientes por: internación, hospital de día, externo
-- ============================================================

ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS care_modality VARCHAR(30) DEFAULT 'hospital_de_dia';
  -- 'internacion', 'hospital_de_dia', 'externo'

COMMENT ON COLUMN hdd_patients.care_modality IS 'Modalidad de atención: internacion, hospital_de_dia, externo';

-- Update existing HDD seed patients to hospital_de_dia
UPDATE hdd_patients
SET care_modality = 'hospital_de_dia'
WHERE care_modality IS NULL;

CREATE INDEX IF NOT EXISTS idx_hdd_patients_care_modality ON hdd_patients(care_modality);

SELECT 'Migration 020: care_modality column added';
