-- =============================================
-- Migration 027: Create missing tables + fix hdd_activities
-- Addresses audit findings #3 (6 phantom tables) and #4 (hdd_activities mismatch)
-- =============================================

-- =============================================
-- 1. OBRAS SOCIALES (Insurance Providers)
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
DROP POLICY IF EXISTS "obras_sociales_service_role" ON obras_sociales;
CREATE POLICY "obras_sociales_service_role" ON obras_sociales FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "obras_sociales_anon_select" ON obras_sociales;
CREATE POLICY "obras_sociales_anon_select" ON obras_sociales FOR SELECT TO anon
  USING (is_active = TRUE);

-- =============================================
-- 2. SERVICE PLANS
-- =============================================
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
DROP POLICY IF EXISTS "service_plans_service_role" ON service_plans;
CREATE POLICY "service_plans_service_role" ON service_plans FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "service_plans_anon_select" ON service_plans;
CREATE POLICY "service_plans_anon_select" ON service_plans FOR SELECT TO anon
  USING (is_active = TRUE);

-- =============================================
-- 3. PLAN ENTITLEMENTS
-- =============================================
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
DROP POLICY IF EXISTS "plan_entitlements_service_role" ON plan_entitlements;
CREATE POLICY "plan_entitlements_service_role" ON plan_entitlements FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');
DROP POLICY IF EXISTS "plan_entitlements_anon_select" ON plan_entitlements;
CREATE POLICY "plan_entitlements_anon_select" ON plan_entitlements FOR SELECT TO anon USING (true);

-- =============================================
-- 4. PATIENT PLANS
-- =============================================
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
DROP POLICY IF EXISTS "patient_plans_service_role" ON patient_plans;
CREATE POLICY "patient_plans_service_role" ON patient_plans FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- =============================================
-- 5. SERVICE USAGE TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS service_usage (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES hdd_patients(id),
    service_type VARCHAR(32) NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    session_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_usage_monthly
    ON service_usage(patient_id, service_type, usage_date);
ALTER TABLE service_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_usage_service_role" ON service_usage;
CREATE POLICY "service_usage_service_role" ON service_usage FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- =============================================
-- 6. DOCTOR PRESCRIPTIONS
-- =============================================
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
DROP POLICY IF EXISTS "doctor_prescriptions_service_role" ON doctor_prescriptions;
CREATE POLICY "doctor_prescriptions_service_role" ON doctor_prescriptions FOR ALL
  USING ((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role');

-- =============================================
-- 7. FIX hdd_activities: add missing columns
-- =============================================
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS location VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS professional VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================
-- 8. SEED: Default Plans
-- =============================================
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

-- =============================================
-- 9. SEED: Entitlements per plan
-- =============================================
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

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'telemedicina', null, null, true, false FROM service_plans WHERE code = 'telemedicina_sola'
ON CONFLICT (plan_id, service_type) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, service_type, max_per_month, max_per_week, is_included, requires_prescription)
SELECT id, 'gaming', null, null, false, true FROM service_plans WHERE code = 'telemedicina_sola'
ON CONFLICT (plan_id, service_type) DO NOTHING;

-- =============================================
-- 10. SEED: Common Obras Sociales
-- =============================================
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

-- =============================================
-- 11. Link telemedicine_users to hdd_patients
-- =============================================
ALTER TABLE telemedicine_users
    ADD COLUMN IF NOT EXISTS hdd_patient_id INTEGER REFERENCES hdd_patients(id);
ALTER TABLE hdd_patients
    ADD COLUMN IF NOT EXISTS patient_type VARCHAR(32) DEFAULT 'obra_social';
