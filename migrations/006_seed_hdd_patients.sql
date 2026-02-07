-- Migration: Seed HDD patients into the database
-- This migration inserts all 23 authorized patients directly into hdd_patients table
-- Run this on Supabase: psql $SUPABASE_DATABASE_URL -f migrations/006_seed_hdd_patients.sql
--
-- This removes the need for DNI validation during registration - patients will already
-- exist in the database and can log in directly with their DNI + password (first login sets password)

-- Insert all authorized HDD patients
-- ON CONFLICT DO NOTHING ensures we don't duplicate existing patients
INSERT INTO hdd_patients (dni, full_name, status, admission_date, created_at)
VALUES
    ('17051100', 'Abregu Walter Humberto', 'active', CURRENT_DATE, NOW()),
    ('20716038', 'Amat Sandro Javier', 'active', CURRENT_DATE, NOW()),
    ('13207570', 'Arcomano Nora Estela', 'active', CURRENT_DATE, NOW()),
    ('25235646', 'Arrieta Alejandro', 'active', CURRENT_DATE, NOW()),
    ('11345447', 'Arrivillaga Oscar', 'active', CURRENT_DATE, NOW()),
    ('38276142', 'Cabezas Lucas Gabriel', 'active', CURRENT_DATE, NOW()),
    ('21755736', 'Casas Guillermo', 'active', CURRENT_DATE, NOW()),
    ('24094852', 'Castro Arturo Anibal', 'active', CURRENT_DATE, NOW()),
    ('25927210', 'De Battista Jorgelina', 'active', CURRENT_DATE, NOW()),
    ('12651036', 'Del Prette Juan Carlos', 'active', CURRENT_DATE, NOW()),
    ('13207364', 'Etchemendy Norma Adriana', 'active', CURRENT_DATE, NOW()),
    ('27332925', 'Gomez Leal Jorge Daniel', 'active', CURRENT_DATE, NOW()),
    ('12130808', 'Kessler Hortensia Lidia', 'active', CURRENT_DATE, NOW()),
    ('44830962', 'Khulmann Diego Leonel', 'active', CURRENT_DATE, NOW()),
    ('16721815', 'Lozano Norma Beatriz', 'active', CURRENT_DATE, NOW()),
    ('28041501', 'Luayza Martha Lorena', 'active', CURRENT_DATE, NOW()),
    ('24444302', 'Marambio Ricardo', 'active', CURRENT_DATE, NOW()),
    ('10614344', 'Peshnaski Amalia Liliana', 'active', CURRENT_DATE, NOW()),
    ('14446656', 'Revelo Claudio Marcelo', 'active', CURRENT_DATE, NOW()),
    ('26463141', 'Romero Natalia Raquel', 'active', CURRENT_DATE, NOW()),
    ('28151900', 'Sampron Agustin Elias', 'active', CURRENT_DATE, NOW()),
    ('18405535', 'Suarez Ana Carolina', 'active', CURRENT_DATE, NOW()),
    ('11105752', 'Vomero Jose Luis', 'active', CURRENT_DATE, NOW())
ON CONFLICT (dni) DO NOTHING;

-- Comments
COMMENT ON TABLE hdd_patients IS 'Patients enrolled in Hospital de Dia program - seeded with 23 authorized patients';
