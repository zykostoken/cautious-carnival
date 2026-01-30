-- Migration: Seed Healthcare Professionals (Equipo Tecnico)
-- This migration inserts authorized healthcare professionals directly into the database
-- Run this on Netlify DB: psql $NETLIFY_DATABASE_URL -f migrations/007_seed_healthcare_professionals.sql
--
-- These professionals can then register via the portal with their institutional email
-- and will be pre-approved for access.

-- Step 1: Alter table to allow NULL password_hash for pre-seeded professionals
-- This enables the "first login sets password" workflow similar to HDD patients
ALTER TABLE healthcare_professionals ALTER COLUMN password_hash DROP NOT NULL;

-- Step 2: Insert healthcare professionals with pre-verified status
-- password_hash is NULL - professionals will set their password when they first register/login
-- Using institutional email format: firstname.lastname@clinicajoseingenieros.ar or role-based
INSERT INTO healthcare_professionals (
    email,
    full_name,
    specialty,
    is_active,
    email_verified,
    created_at
)
VALUES
    -- Director Medico - Gonzalo Joaquin Perez Cortizo (DNI: 30542195)
    ('direccionmedica@clinicajoseingenieros.ar', 'Gonzalo Joaquin Perez Cortizo', 'Psiquiatra - Director Medico', TRUE, TRUE, NOW()),

    -- Gerencia Administrativa - Andrea Roxana Martin (DNI: 25178661)
    ('gerencia@clinicajoseingenieros.ar', 'Andrea Roxana Martin', 'Gerencia Administrativa', TRUE, TRUE, NOW()),

    -- Psiquiatra - Carlos Daniel Rodriguez (DNI: 22610308)
    ('carlos.rodriguez@clinicajoseingenieros.ar', 'Carlos Daniel Rodriguez', 'Psiquiatra', TRUE, TRUE, NOW()),

    -- Psicologa - Cardenau Maria Jose (DNI: 30519253)
    ('maria.cardenau@clinicajoseingenieros.ar', 'Cardenau Maria Jose', 'Psicologa', TRUE, TRUE, NOW()),

    -- Aquino Maria Daniela (DNI: 23111618)
    ('daniela.aquino@clinicajoseingenieros.ar', 'Aquino Maria Daniela', 'Profesional de Salud', TRUE, TRUE, NOW())

ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    specialty = EXCLUDED.specialty,
    is_active = TRUE,
    email_verified = TRUE;

-- Note: password_hash is NULL - professionals will set their password on first registration
-- The registration flow handles password setup for pre-verified accounts

COMMENT ON TABLE healthcare_professionals IS 'Healthcare professionals authorized to access the clinic system - seeded with equipo tecnico';
