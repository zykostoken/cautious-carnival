-- ===========================================
-- Migration 022: Signos vitales por guardia
-- Optimiza consultas de SV para 3500+ pacientes
-- Agrega indice compuesto para consultas por fecha
-- ===========================================

-- Indice compuesto: buscar ultimo SV por paciente ordenado por fecha
-- Critico para rendimiento con 3500 pacientes x 4 guardias/dia = 14000 registros/dia
CREATE INDEX IF NOT EXISTS idx_hce_sv_patient_fecha
  ON hce_signos_vitales(patient_id, fecha DESC);

-- Indice para consultas de SV vencidos (reportes de guardia)
CREATE INDEX IF NOT EXISTS idx_hce_sv_fecha
  ON hce_signos_vitales(fecha DESC);

SELECT 'Migration 022: signos vitales guardia indexes applied';
