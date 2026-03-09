-- ============================================================
-- MIGRATION 021: Gestión de usuarios profesionales + Firma digital
-- - Rol profesional (enfermería, psicología, psiquiatría, TO, etc.)
-- - Firma y sello digital en evoluciones (HL7 / Ley 26.529)
-- - Matrícula provincial y nacional
-- ============================================================

-- ===========================================
-- 1. ROLES Y MATRÍCULA EN healthcare_professionals
-- ===========================================

-- Rol funcional dentro de la institución
ALTER TABLE healthcare_professionals
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'profesional';
-- Roles posibles: psiquiatra, psicologo, enfermero, terapista_ocupacional,
-- acompanante_terapeutico, trabajador_social, medico_clinico, nutricionista,
-- musicoterapeuta, farmaceutico, administrativo, direccion_medica

-- Matrícula provincial (la que más se usa en PBA)
ALTER TABLE healthcare_professionals
  ADD COLUMN IF NOT EXISTS matricula_provincial VARCHAR(30);

-- Matrícula nacional (MN)
ALTER TABLE healthcare_professionals
  ADD COLUMN IF NOT EXISTS matricula_nacional VARCHAR(30);

-- Profesional creado por admin (no necesita verificación de email)
ALTER TABLE healthcare_professionals
  ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN healthcare_professionals.role IS 'Rol funcional: psiquiatra, psicologo, enfermero, terapista_ocupacional, acompanante_terapeutico, trabajador_social, medico_clinico, etc.';
COMMENT ON COLUMN healthcare_professionals.matricula_provincial IS 'Matrícula profesional provincial (MP)';
COMMENT ON COLUMN healthcare_professionals.matricula_nacional IS 'Matrícula profesional nacional (MN)';

CREATE INDEX IF NOT EXISTS idx_professionals_role ON healthcare_professionals(role);

-- ===========================================
-- 2. FIRMA Y SELLO DIGITAL EN EVOLUCIONES
-- Según HL7 y Ley 26.529: cada acto médico debe llevar
-- identificación del profesional actuante
-- ===========================================

-- Snapshot de firma al momento de la evolución (inmutable)
ALTER TABLE hce_evoluciones
  ADD COLUMN IF NOT EXISTS firma_nombre VARCHAR(255);
ALTER TABLE hce_evoluciones
  ADD COLUMN IF NOT EXISTS firma_especialidad VARCHAR(100);
ALTER TABLE hce_evoluciones
  ADD COLUMN IF NOT EXISTS firma_matricula VARCHAR(60);
ALTER TABLE hce_evoluciones
  ADD COLUMN IF NOT EXISTS firma_role VARCHAR(50);

COMMENT ON COLUMN hce_evoluciones.firma_nombre IS 'Snapshot: nombre completo del profesional al firmar';
COMMENT ON COLUMN hce_evoluciones.firma_especialidad IS 'Snapshot: especialidad al momento de firmar';
COMMENT ON COLUMN hce_evoluciones.firma_matricula IS 'Snapshot: matrícula (MP/MN) al momento de firmar';
COMMENT ON COLUMN hce_evoluciones.firma_role IS 'Snapshot: rol funcional al momento de firmar';

-- ===========================================
-- 3. FIRMA EN MEDICACIÓN (quién indicó)
-- ===========================================
ALTER TABLE hce_medicacion
  ADD COLUMN IF NOT EXISTS indicado_por_nombre VARCHAR(255);
ALTER TABLE hce_medicacion
  ADD COLUMN IF NOT EXISTS indicado_por_matricula VARCHAR(60);

-- ===========================================
-- 4. FIRMA EN SIGNOS VITALES (quién registró)
-- ===========================================
ALTER TABLE hce_signos_vitales
  ADD COLUMN IF NOT EXISTS registrado_por_nombre VARCHAR(255);
ALTER TABLE hce_signos_vitales
  ADD COLUMN IF NOT EXISTS registrado_por_role VARCHAR(50);

SELECT 'Migration 021: roles, matricula, firma y sello digital added';
