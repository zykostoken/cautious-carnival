-- ============================================================
-- MIGRATION 020: Modalidad de atención del paciente
-- Permite agrupar pacientes por: internación, hospital de día, externo
-- ============================================================

-- Modalidad de atencion: internacion, hospital de dia, consultorio externo
ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS care_modality VARCHAR(30) DEFAULT 'hospital_de_dia';

-- Numero de HC en papel para vincular con la HC fisica existente
ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS numero_hc_papel VARCHAR(30);

-- Obra social / cobertura - texto libre como en DOX (IOMA, PAMI, PARTICULAR, etc.)
ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS obra_social VARCHAR(100);

-- Numero de afiliado / credencial
ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS obra_social_numero VARCHAR(64);

COMMENT ON COLUMN hdd_patients.care_modality IS 'Modalidad de atención: internacion, hospital_de_dia, externo';
COMMENT ON COLUMN hdd_patients.numero_hc_papel IS 'Número de HC en papel para vincular con registros físicos';
COMMENT ON COLUMN hdd_patients.obra_social IS 'Obra social o cobertura del paciente';

-- Update existing HDD seed patients to hospital_de_dia
UPDATE hdd_patients
SET care_modality = 'hospital_de_dia'
WHERE care_modality IS NULL;

CREATE INDEX IF NOT EXISTS idx_hdd_patients_care_modality ON hdd_patients(care_modality);
CREATE INDEX IF NOT EXISTS idx_hdd_patients_hc_papel ON hdd_patients(numero_hc_papel) WHERE numero_hc_papel IS NOT NULL;

SELECT 'Migration 020: care_modality + numero_hc_papel added';
