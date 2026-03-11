-- =============================================
-- AUDIT REMEDIATION: Critical & High severity fixes
-- Date: 2026-03-11
-- Applied to Supabase project: buzblnkpfydeheingzgn
-- =============================================

-- =============================================
-- 1. CREATE 6 MISSING TABLES (Audit #3 CRITICAL)
-- Referenced in entitlements.mts and hdd-auth.mts
-- =============================================

CREATE TABLE IF NOT EXISTS obras_sociales (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    billing_address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE obras_sociales ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS service_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    plan_type VARCHAR(32) NOT NULL,
    description TEXT,
    price_ars DECIMAL(12, 2) DEFAULT 0,
    price_usd DECIMAL(10, 2) DEFAULT 0,
    billing_period VARCHAR(16) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS plan_entitlements (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    service_type VARCHAR(32) NOT NULL,
    max_per_month INTEGER,
    max_per_week INTEGER,
    is_included BOOLEAN DEFAULT TRUE,
    requires_prescription BOOLEAN DEFAULT FALSE,
    notes TEXT,
    UNIQUE(plan_id, service_type)
);
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS patient_plans (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    obra_social_id INTEGER REFERENCES obras_sociales(id),
    obra_social_member_number VARCHAR(64),
    plan_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    payment_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE patient_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS service_usage (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    service_type VARCHAR(32) NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_usage_monthly ON service_usage(patient_id, service_type, usage_date);
ALTER TABLE service_usage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS doctor_prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    prescribed_by INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    service_type VARCHAR(32) NOT NULL,
    diagnosis TEXT,
    indication TEXT NOT NULL,
    frequency VARCHAR(64),
    max_sessions INTEGER,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    status VARCHAR(32) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE doctor_prescriptions ENABLE ROW LEVEL SECURITY;

-- Patient columns
ALTER TABLE telemedicine_users ADD COLUMN IF NOT EXISTS hdd_patient_id INTEGER REFERENCES hdd_patients(id);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS patient_type VARCHAR(32) DEFAULT 'obra_social';
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS care_modality VARCHAR(30) DEFAULT 'hospital_de_dia';
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS numero_hc_papel VARCHAR(30);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS obra_social VARCHAR(100);
ALTER TABLE hdd_patients ADD COLUMN IF NOT EXISTS obra_social_numero VARCHAR(64);

-- Seed plans
INSERT INTO service_plans (name, code, plan_type, description, price_ars, billing_period) VALUES
    ('HDD Obra Social Completo', 'hdd_obra_social', 'obra_social', 'Plan completo obra social', 0, 'monthly'),
    ('Abono Completo Particular', 'abono_completo', 'direct_pay', 'Acceso completo HDD particular', 250000, 'monthly'),
    ('Telemedicina Sola', 'telemedicina_sola', 'direct_pay', 'Acceso solo a telemedicina', 0, 'per_session')
ON CONFLICT (code) DO NOTHING;

-- Seed Obras Sociales
INSERT INTO obras_sociales (name, code) VALUES
    ('OSDE', 'OSDE'), ('Swiss Medical', 'SWISS_MEDICAL'), ('Galeno', 'GALENO'),
    ('PAMI', 'PAMI'), ('OSECAC', 'OSECAC'), ('Medicus', 'MEDICUS'),
    ('Accord Salud', 'ACCORD'), ('IOMA', 'IOMA'),
    ('Hospital Italiano', 'HOSP_ITALIANO'), ('Particular (sin obra social)', 'PARTICULAR')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 2. FIX hdd_activities SCHEMA MISMATCH (Audit #4 CRITICAL)
-- =============================================

ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS day_of_week INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS icon VARCHAR(32);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS professional VARCHAR(255);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hdd_activities ALTER COLUMN activity_type DROP NOT NULL;
ALTER TABLE hdd_activities ALTER COLUMN activity_type SET DEFAULT 'general';

-- =============================================
-- 3. CONVERT ALL VIEWS TO SECURITY INVOKER (Audit #1 CRITICAL)
-- =============================================

ALTER VIEW hdd_game_biometrics SET (security_invoker = true);
ALTER VIEW v_hce_resumen_paciente SET (security_invoker = true);
ALTER VIEW v_hdd_session_analysis SET (security_invoker = true);
ALTER VIEW v_latencia_escena_paciente SET (security_invoker = true);
ALTER VIEW v_patient_clinical_profile SET (security_invoker = true);
ALTER VIEW v_patient_game_summary SET (security_invoker = true);
ALTER VIEW v_placard_elecciones SET (security_invoker = true);
ALTER VIEW v_professional_patient_interactions SET (security_invoker = true);
ALTER VIEW v_professional_usage_summary SET (security_invoker = true);
ALTER VIEW v_umbral_ruta SET (security_invoker = true);

-- =============================================
-- 4. FIX hce_evoluciones IMMUTABILITY
-- =============================================

CREATE OR REPLACE FUNCTION prevent_hce_evoluciones_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.editado = TRUE THEN
        RAISE EXCEPTION 'Cannot modify a signed/edited clinical evolution entry';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete clinical evolution entries (Ley 26.529)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hce_evoluciones_immutability ON hce_evoluciones;
CREATE TRIGGER trg_hce_evoluciones_immutability
    BEFORE UPDATE OR DELETE ON hce_evoluciones
    FOR EACH ROW
    EXECUTE FUNCTION prevent_hce_evoluciones_modification();

-- =============================================
-- 5. ADD HASH CHAIN TO hce_clinical_entries
-- =============================================

ALTER TABLE hce_clinical_entries ADD COLUMN IF NOT EXISTS previous_entry_hash VARCHAR(128);

-- =============================================
-- 6. FIX hdd_game_metrics.session_id TYPE
-- =============================================

-- Note: requires dropping/recreating hdd_game_biometrics view
-- See migration script for details
