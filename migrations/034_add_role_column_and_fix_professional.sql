-- Migration 034: Add role and last_activity columns to healthcare_professionals
-- FIX: audit.mts getProfessionalFromToken() queries SELECT ... role ... 
-- but column didn't exist, causing HTTP 500 on every admin action.

ALTER TABLE healthcare_professionals 
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'professional';

ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN healthcare_professionals.role IS 'Role: super_admin, limited_admin, professional. Used by audit.mts getProfessionalFromToken()';
