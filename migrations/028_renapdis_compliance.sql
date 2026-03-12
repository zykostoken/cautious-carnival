-- Migration 028: ReNaPDiS / Ministerio de Salud compliance
-- Covers: MFA/TOTP, hash chain integrity, firma electronica,
--         SNOMED CT, REFEPS/SISA, CUIR, retention policy,
--         HCE immutability enforcement, legacy table cleanup
-- Regulations: Ley 26.529, Ley 25.506, Ley 25.326, Res. 1959/2024, Res. 3316/2023

-- ===========================================
-- 1. MFA/TOTP FOR PROFESSIONALS (Res. 1959/2024 - security controls)
-- ===========================================

ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];  -- hashed backup codes
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN DEFAULT TRUE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;

-- MFA challenge log (audit trail for 2FA attempts)
CREATE TABLE IF NOT EXISTS mfa_challenge_log (
    id SERIAL PRIMARY KEY,
    professional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    challenge_type VARCHAR(16) NOT NULL DEFAULT 'totp',  -- 'totp', 'backup_code'
    success BOOLEAN NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mfa_challenge_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mfa_challenge_log_service_role" ON mfa_challenge_log;
CREATE POLICY "mfa_challenge_log_service_role" ON mfa_challenge_log FOR ALL
    USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_mfa_challenge_professional ON mfa_challenge_log(professional_id, created_at DESC);

-- ===========================================
-- 2. HASH CHAIN INTEGRITY (Ley 26.529 Art.18 - immutability)
-- ===========================================

-- Add previous_hash column to complete the chain
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS previous_entry_hash VARCHAR(128);

-- Update the hash chain trigger to include previous_hash
CREATE OR REPLACE FUNCTION compute_entry_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(128);
BEGIN
    -- Get hash of the most recent entry for this patient
    SELECT entry_hash INTO prev_hash
    FROM hce_clinical_entries
    WHERE patient_id = NEW.patient_id
    ORDER BY created_at DESC
    LIMIT 1;

    NEW.previous_entry_hash := COALESCE(prev_hash, 'GENESIS');

    -- Compute hash: SHA-256 of (content || professional_id || patient_id || previous_hash || timestamp)
    NEW.entry_hash := encode(
        digest(
            COALESCE(NEW.content, '') ||
            COALESCE(NEW.professional_id::text, '') ||
            COALESCE(NEW.patient_id::text, '') ||
            COALESCE(NEW.previous_entry_hash, 'GENESIS') ||
            COALESCE(NEW.created_at::text, NOW()::text),
            'sha256'
        ),
        'hex'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists, create new one
DROP TRIGGER IF EXISTS trg_compute_entry_hash ON hce_clinical_entries;
CREATE TRIGGER trg_compute_entry_hash
    BEFORE INSERT ON hce_clinical_entries
    FOR EACH ROW
    EXECUTE FUNCTION compute_entry_hash_chain();

-- ===========================================
-- 3. FIRMA ELECTRONICA (Ley 25.506)
-- ===========================================

-- Add electronic signature fields to hce_evoluciones (existing system)
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_digital_hash VARCHAR(128);
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_digital_timestamp TIMESTAMPTZ;
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS firma_ip_address VARCHAR(45);

-- Add electronic signature fields to hce_clinical_entries
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_digital_hash VARCHAR(128);
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_digital_timestamp TIMESTAMPTZ;
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_ip_address VARCHAR(45);
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_nombre VARCHAR(255);
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_matricula VARCHAR(64);
ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS firma_especialidad VARCHAR(100);

-- Trigger to compute firma digital hash on insert for evoluciones
CREATE OR REPLACE FUNCTION compute_firma_digital_evoluciones()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.firma_nombre IS NOT NULL AND NEW.firma_digital_hash IS NULL THEN
        NEW.firma_digital_hash := encode(
            digest(
                COALESCE(NEW.contenido, '') ||
                COALESCE(NEW.firma_nombre, '') ||
                COALESCE(NEW.firma_matricula, '') ||
                COALESCE(NEW.patient_id::text, '') ||
                COALESCE(NEW.created_at::text, NOW()::text),
                'sha256'
            ),
            'hex'
        );
        NEW.firma_digital_timestamp := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firma_digital_evoluciones ON hce_evoluciones;
CREATE TRIGGER trg_firma_digital_evoluciones
    BEFORE INSERT ON hce_evoluciones
    FOR EACH ROW
    EXECUTE FUNCTION compute_firma_digital_evoluciones();

-- ===========================================
-- 4. HCE EVOLUCIONES IMMUTABILITY (Ley 26.529 - no modification)
-- ===========================================

-- Convert UPDATE to addendum pattern: prevent direct content modification
-- Instead of editing, professionals must create an addendum
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS is_addendum BOOLEAN DEFAULT FALSE;
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS parent_evolution_id INTEGER REFERENCES hce_evoluciones(id);
ALTER TABLE hce_evoluciones ADD COLUMN IF NOT EXISTS original_contenido TEXT;  -- preserved on edit

-- Trigger: on UPDATE of contenido, save original and mark as edited
CREATE OR REPLACE FUNCTION preserve_evolution_original()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow status changes (borrador → evolucion) without immutability check
    IF OLD.tipo = 'borrador' THEN
        RETURN NEW;
    END IF;

    -- If content is being modified on a non-draft, save the original
    IF NEW.contenido IS DISTINCT FROM OLD.contenido AND OLD.original_contenido IS NULL THEN
        NEW.original_contenido := OLD.contenido;
    END IF;

    -- Always mark as edited if content changes
    IF NEW.contenido IS DISTINCT FROM OLD.contenido THEN
        NEW.editado := TRUE;
        NEW.editado_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_evolution ON hce_evoluciones;
CREATE TRIGGER trg_preserve_evolution
    BEFORE UPDATE ON hce_evoluciones
    FOR EACH ROW
    EXECUTE FUNCTION preserve_evolution_original();

-- Prevent DELETE on committed evoluciones (allow draft deletion)
CREATE OR REPLACE FUNCTION prevent_evolution_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.tipo != 'borrador' THEN
        RAISE EXCEPTION 'No se permite eliminar evoluciones confirmadas (Ley 26.529). Use addendum.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_evolution_delete ON hce_evoluciones;
CREATE TRIGGER trg_prevent_evolution_delete
    BEFORE DELETE ON hce_evoluciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_evolution_delete();

-- ===========================================
-- 5. SNOMED CT CODING (Interoperability - Res. 1959/2024)
-- ===========================================

ALTER TABLE hce_diagnosticos ADD COLUMN IF NOT EXISTS snomed_code VARCHAR(20);
ALTER TABLE hce_diagnosticos ADD COLUMN IF NOT EXISTS snomed_display TEXT;

ALTER TABLE hce_medicacion ADD COLUMN IF NOT EXISTS snomed_code VARCHAR(20);
ALTER TABLE hce_medicacion ADD COLUMN IF NOT EXISTS snomed_display TEXT;

-- Add coding system support to antecedentes
ALTER TABLE hce_antecedentes ADD COLUMN IF NOT EXISTS codigo_snomed VARCHAR(20);

-- ===========================================
-- 6. REFEPS/SISA PROFESSIONAL VERIFICATION (Res. 1959/2024)
-- ===========================================

ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS refeps_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS refeps_verification_date TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS sisa_id VARCHAR(32);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS matricula_provincial VARCHAR(32);
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS matricula_nacional VARCHAR(32);
-- Note: matricula columns may already exist from migration 021, IF NOT EXISTS handles that

-- ===========================================
-- 7. CUIR - CODIGO UNICO DE IDENTIFICACION DE RECETA (Jan 2025)
-- ===========================================

CREATE TABLE IF NOT EXISTS electronic_prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE RESTRICT,
    professional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    cuir_code VARCHAR(64) UNIQUE,  -- CUIR code generated per Res.
    prescription_type VARCHAR(32) NOT NULL DEFAULT 'general', -- 'general', 'psicotropico', 'estupefaciente'
    medications JSONB NOT NULL, -- array of {droga, dosis, frecuencia, duracion, snomed_code}
    diagnosis_text TEXT,
    diagnosis_snomed VARCHAR(20),
    instructions TEXT,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE, -- null = permanent for chronic
    dispensed BOOLEAN DEFAULT FALSE,
    dispensed_at TIMESTAMPTZ,
    dispensed_by VARCHAR(255),
    pharmacy_name VARCHAR(255),
    firma_digital_hash VARCHAR(128),
    firma_nombre VARCHAR(255),
    firma_matricula VARCHAR(64),
    status VARCHAR(16) DEFAULT 'active', -- 'active', 'dispensed', 'expired', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE electronic_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "electronic_prescriptions_service_role" ON electronic_prescriptions;
CREATE POLICY "electronic_prescriptions_service_role" ON electronic_prescriptions FOR ALL
    USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON electronic_prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_professional ON electronic_prescriptions(professional_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_cuir ON electronic_prescriptions(cuir_code);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON electronic_prescriptions(status);

-- ===========================================
-- 8. RETENTION POLICY (Ley 26.529 Art.18 - 10 years)
-- ===========================================

-- Add retention metadata to audit tables
ALTER TABLE hce_audit_log ADD COLUMN IF NOT EXISTS retention_until DATE;
ALTER TABLE professional_audit_log ADD COLUMN IF NOT EXISTS retention_until DATE;

-- Set retention = created_at + 10 years for new records
CREATE OR REPLACE FUNCTION set_retention_10_years()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retention_until IS NULL THEN
        NEW.retention_until := (COALESCE(NEW.created_at, NOW()) + INTERVAL '10 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_retention_hce_audit ON hce_audit_log;
CREATE TRIGGER trg_retention_hce_audit
    BEFORE INSERT ON hce_audit_log
    FOR EACH ROW EXECUTE FUNCTION set_retention_10_years();

DROP TRIGGER IF EXISTS trg_retention_prof_audit ON professional_audit_log;
CREATE TRIGGER trg_retention_prof_audit
    BEFORE INSERT ON professional_audit_log
    FOR EACH ROW EXECUTE FUNCTION set_retention_10_years();

-- Backfill existing records
UPDATE hce_audit_log SET retention_until = (created_at + INTERVAL '10 years')::date WHERE retention_until IS NULL;
UPDATE professional_audit_log SET retention_until = (created_at + INTERVAL '10 years')::date WHERE retention_until IS NULL;

-- Prevent deletion of records before retention date
CREATE OR REPLACE FUNCTION prevent_premature_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.retention_until IS NOT NULL AND OLD.retention_until > CURRENT_DATE THEN
        RAISE EXCEPTION 'No se permite eliminar registros antes de la fecha de retencion (%). Ley 26.529 Art.18.', OLD.retention_until;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_retention_guard_hce ON hce_audit_log;
CREATE TRIGGER trg_retention_guard_hce
    BEFORE DELETE ON hce_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_premature_deletion();

DROP TRIGGER IF EXISTS trg_retention_guard_prof ON professional_audit_log;
CREATE TRIGGER trg_retention_guard_prof
    BEFORE DELETE ON professional_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_premature_deletion();

-- ===========================================
-- 9. TELEMEDICINA CONSENT (Res. 3316/2023)
-- ===========================================

-- Ensure consent table supports telemedicine specifically
-- (table already exists from migration 026, add specific fields)
ALTER TABLE hce_consentimientos ADD COLUMN IF NOT EXISTS session_type VARCHAR(32);  -- 'presencial', 'telemedicina'
ALTER TABLE hce_consentimientos ADD COLUMN IF NOT EXISTS firma_digital_hash VARCHAR(128);

-- ===========================================
-- 10. PASSWORD POLICY ENFORCEMENT (NIST SP 800-63B)
-- ===========================================

-- Add password policy tracking
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- ===========================================
-- 11. REFRESH TOKEN ROTATION (session security)
-- ===========================================

ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
ALTER TABLE healthcare_professionals ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ;

-- ===========================================
-- 12. LEGACY TABLE CLEANUP (remove unused tables)
-- ===========================================

-- Drop orphan/duplicate tables with 0 rows that have no code references
-- These were identified by audit as unused

-- ROOTTINE-era tables (superseded by hdd_ tables)
DROP TABLE IF EXISTS eventos_interaccion CASCADE;
DROP TABLE IF EXISTS resultados_sesion CASCADE;
DROP TABLE IF EXISTS sesiones_juego CASCADE;
DROP TABLE IF EXISTS pacientes_auth CASCADE;
DROP TABLE IF EXISTS hotspots CASCADE;
DROP TABLE IF EXISTS escenas CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;

-- Original UUID-based tables (superseded by serial-based tables)
DROP TABLE IF EXISTS payments_webhooks CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS patients CASCADE;

-- Drop hdd_game_results (0 rows, superseded by hdd_game_metrics)
DROP TABLE IF EXISTS hdd_game_results CASCADE;

-- ===========================================
-- 13. DATA PROTECTION METADATA (Ley 25.326)
-- ===========================================

-- Track data processing basis for AAIP compliance
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS data_processing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS data_processing_consent_date TIMESTAMPTZ;
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS data_deletion_requested_at TIMESTAMPTZ;

-- ===========================================
-- 14. PROFESSIONAL AUDIT LOG ENHANCEMENTS
-- ===========================================

-- Add session fingerprint for forensic analysis
ALTER TABLE professional_audit_log ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(128);
