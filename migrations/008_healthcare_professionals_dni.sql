-- Migration: Add DNI column to healthcare_professionals for password recovery
-- This migration adds a DNI field that will be used for password recovery
-- instead of email-based verification codes (since email is not configured)
--
-- Run this on Netlify DB: psql $NETLIFY_DATABASE_URL -f migrations/008_healthcare_professionals_dni.sql

-- Add dni column if it doesn't exist
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS dni VARCHAR(20);

-- Create index for faster lookups by DNI
CREATE INDEX IF NOT EXISTS idx_professionals_dni
ON healthcare_professionals(dni);

-- Update existing professionals with their known DNIs (from equipo tecnico)
-- This allows password recovery using last 4 digits of DNI
UPDATE healthcare_professionals SET dni = '30542195' WHERE email = 'direccionmedica@clinicajoseingenieros.ar';
UPDATE healthcare_professionals SET dni = '25178661' WHERE email = 'gerencia@clinicajoseingenieros.ar';
UPDATE healthcare_professionals SET dni = '22610308' WHERE email = 'carlos.rodriguez@clinicajoseingenieros.ar';
UPDATE healthcare_professionals SET dni = '30519253' WHERE email = 'maria.cardenau@clinicajoseingenieros.ar';
UPDATE healthcare_professionals SET dni = '23111618' WHERE email = 'daniela.aquino@clinicajoseingenieros.ar';

COMMENT ON COLUMN healthcare_professionals.dni IS 'DNI of the healthcare professional - used for password recovery (last 4 digits)';
