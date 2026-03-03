-- Migration 014: Two-tier patient access model
-- Supports:
--   1. Obra Social patients: insurance pays, pre-set schedule (2 group therapy/week, 1 telemedicine/month, daily activities + gaming)
--   2. Direct Pay patients: pay via MercadoPago, access only what they pay for (telemedicine per-session, or abono completo)
-- Gaming alone requires doctor prescription for direct-pay patients

-- ===========================================
-- OBRAS SOCIALES (Insurance Providers)
-- ===========================================
CREATE TABLE IF NOT EXISTS obras_sociales (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,       -- e.g. 'OSDE', 'SWISS_MEDICAL', 'GALENO', 'PAMI'
    contact_email VARCHAR(255),
    contact_phone VARCHAR(32),
    billing_address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICE PLANS (abonos / plans)
-- ===========================================
CREATE TABLE IF NOT EXISTS service_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,       -- 'hdd_obra_social', 'abono_completo', 'telemedicina_sola'
    plan_type VARCHAR(32) NOT NULL,         -- 'obra_social', 'direct_pay'
    description TEXT,
    price_ars DECIMAL(12, 2) DEFAULT 0,     -- 0 for obra_social (billed separately)
    price_usd DECIMAL(10, 2) DEFAULT 0,
    billing_period VARCHAR(16) DEFAULT 'monthly', -- 'monthly', 'per_session', 'annual'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICE ENTITLEMENTS PER PLAN
-- What each plan includes
-- ===========================================
CREATE TABLE IF NOT EXISTS plan_entitlements (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    service_type VARCHAR(32) NOT NULL,      -- 'telemedicina', 'terapia_grupal', 'actividades_hdd', 'gaming', 'terapia_ocupacional'
    max_per_month INTEGER,                  -- null = unlimited
    max_per_week INTEGER,                   -- null = unlimited
    is_included BOOLEAN DEFAULT TRUE,
    requires_prescription BOOLEAN DEFAULT FALSE, -- gaming for direct pay needs doctor approval
    notes TEXT,
    UNIQUE(plan_id, service_type)
);

-- ===========================================
-- PATIENT PLANS (links patient to their active plan)
-- ===========================================
CREATE TABLE IF NOT EXISTS patient_plans (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    plan_id INTEGER NOT NULL REFERENCES service_plans(id),
    obra_social_id INTEGER REFERENCES obras_sociales(id),  -- null for direct pay
    obra_social_member_number VARCHAR(64),                   -- credencial number
    plan_type VARCHAR(32) NOT NULL,         -- 'obra_social', 'direct_pay'
    status VARCHAR(32) DEFAULT 'active',    -- 'active', 'suspended', 'expired', 'cancelled'
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,                          -- null = ongoing
    payment_reference TEXT,                 -- MP preference ID for direct pay
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- SERVICE USAGE TRACKING
-- Counts usage per patient per month to enforce limits
-- ===========================================
CREATE TABLE IF NOT EXISTS service_usage (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    service_type VARCHAR(32) NOT NULL,      -- 'telemedicina', 'terapia_grupal', etc.
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_reference VARCHAR(255),          -- video_session_id, activity_id, etc.
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick monthly usage lookups
CREATE INDEX IF NOT EXISTS idx_service_usage_monthly
    ON service_usage(patient_id, service_type, usage_date);

-- ===========================================
-- DOCTOR PRESCRIPTIONS
-- For services that require medical indication
-- (e.g., gaming for direct-pay patients)
-- ===========================================
CREATE TABLE IF NOT EXISTS doctor_prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    prescribed_by INTEGER NOT NULL REFERENCES healthcare_professionals(id),
    service_type VARCHAR(32) NOT NULL,      -- 'gaming', 'terapia_grupal', etc.
    diagnosis TEXT,
    indication TEXT NOT NULL,               -- what the doctor prescribed
    frequency VARCHAR(64),                  -- 'diario', '3x/semana', 'semanal'
    max_sessions INTEGER,                   -- null = unlimited within period
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,                       -- null = indefinite
    status VARCHAR(32) DEFAULT 'active',    -- 'active', 'completed', 'cancelled', 'expired'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- LINK: telemedicine_users ↔ hdd_patients
-- Bridges the two user systems
-- ===========================================
ALTER TABLE telemedicine_users
    ADD COLUMN IF NOT EXISTS hdd_patient_id INTEGER REFERENCES hdd_patients(id);

-- Add plan_type to hdd_patients for quick access
ALTER TABLE hdd_patients
    ADD COLUMN IF NOT EXISTS patient_type VARCHAR(32) DEFAULT 'obra_social'; -- 'obra_social', 'direct_pay'

-- ===========================================
-- SEED: Default plans
-- ===========================================
INSERT INTO service_plans (name, code, plan_type, description, price_ars, billing_period)
VALUES
    ('HDD Obra Social Completo', 'hdd_obra_social', 'obra_social',
     'Plan completo para pacientes de obra social. Incluye terapia grupal (2/semana), telemedicina (1/mes), actividades HDD diarias, gaming diario.',
     0, 'monthly'),
    ('Abono Completo Particular', 'abono_completo', 'direct_pay',
     'Acceso completo al HDD para pacientes particulares. Incluye terapia grupal, telemedicina, actividades, gaming.',
     250000, 'monthly'),
    ('Telemedicina Sola', 'telemedicina_sola', 'direct_pay',
     'Acceso solo a telemedicina. Se cobra por sesion via MercadoPago.',
     0, 'per_session')
ON CONFLICT (code) DO NOTHING;

-- ===========================================
-- SEED: Entitlements per plan
-- ===========================================

-- Plan 1: Obra Social (full HDD)
INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'terapia_grupal', null, 2, true, false FROM service_plans WHERE code = 'hdd_obra_social'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'telemedicina', 1, null, true, false FROM service_plans WHERE code = 'hdd_obra_social'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'actividades_hdd', null, null, true, false FROM service_plans WHERE code = 'hdd_obra_social'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'gaming', null, null, true, false FROM service_plans WHERE code = 'hdd_obra_social'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'terapia_ocupacional', null, null, true, false FROM service_plans WHERE code = 'hdd_obra_social'
ON CONFLICT (plan_id, service_type) DO NOTHING;

-- Plan 2: Abono Completo Particular (full access, self-pay)
INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'terapia_grupal', null, 2, true, false FROM service_plans WHERE code = 'abono_completo'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'telemedicina', 2, null, true, false FROM service_plans WHERE code = 'abono_completo'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'actividades_hdd', null, null, true, false FROM service_plans WHERE code = 'abono_completo'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'gaming', null, null, true, false FROM service_plans WHERE code = 'abono_completo'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'terapia_ocupacional', null, null, true, false FROM service_plans WHERE code = 'abono_completo'
ON CONFLICT (plan_id, service_type) DO NOTHING;

-- Plan 3: Telemedicina Sola (only telemedicine, per-session pay)
INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'telemedicina', null, null, true, false FROM service_plans WHERE code = 'telemedicina_sola'
ON CONFLICT (plan_id, service_type) DO NOTHING;

-- Gaming for telemedicina_sola REQUIRES doctor prescription
INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'gaming', null, null, false, true FROM service_plans WHERE code = 'telemedicina_sola'
ON CONFLICT (plan_id, service_type) DO NOTHING;

-- ===========================================
-- SEED: Common Obras Sociales
-- ===========================================
INSERT INTO obras_sociales (name, code) VALUES
    ('OSDE', 'OSDE'),
    ('Swiss Medical', 'SWISS_MEDICAL'),
    ('Galeno', 'GALENO'),
    ('PAMI', 'PAMI'),
    ('OSECAC', 'OSECAC'),
    ('Medicus', 'MEDICUS'),
    ('Accord Salud', 'ACCORD'),
    ('IOMA', 'IOMA'),
    ('Hospital Italiano', 'HOSP_ITALIANO'),
    ('Particular (sin obra social)', 'PARTICULAR')
ON CONFLICT (code) DO NOTHING;
