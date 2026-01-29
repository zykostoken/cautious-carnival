-- Migration: Ensure ALL required columns exist in healthcare_professionals
-- This migration fixes the missing 'verification_expires' and 'last_login' column errors
-- Run this on Supabase: psql $SUPABASE_DATABASE_URL -f migrations/005_healthcare_professionals_all_columns.sql
--
-- IMPORTANT: This migration must be run manually on Supabase to fix the database schema
-- The code expects these columns to exist for the professional registration flow

-- Add email_verified column if it doesn't exist
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Add verification_code column if it doesn't exist
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);

-- Add verification_expires column if it doesn't exist
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;

-- Add last_login column if it doesn't exist
-- This column is used to track the last time a professional logged in
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Add session_token column if it doesn't exist (should already exist but just in case)
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS session_token VARCHAR(255);

-- Create indexes for faster lookups if they don't exist
CREATE INDEX IF NOT EXISTS idx_professionals_email_verified
ON healthcare_professionals(email_verified);

CREATE INDEX IF NOT EXISTS idx_professionals_session
ON healthcare_professionals(session_token);

CREATE INDEX IF NOT EXISTS idx_professionals_last_login
ON healthcare_professionals(last_login);

-- Add comments for documentation
COMMENT ON COLUMN healthcare_professionals.verification_expires IS 'Expiration timestamp for email verification code (30 minutes from generation)';
COMMENT ON COLUMN healthcare_professionals.verification_code IS '6-digit verification code sent via email';
COMMENT ON COLUMN healthcare_professionals.email_verified IS 'Whether the professional has verified their email address';
COMMENT ON COLUMN healthcare_professionals.last_login IS 'Timestamp of the professional last successful login';
COMMENT ON COLUMN healthcare_professionals.session_token IS 'Current active session token for the professional';
