-- Migration: Ensure all verification columns exist in healthcare_professionals
-- This migration fixes the missing 'verification_expires' column error
-- Run this on Supabase: psql $SUPABASE_DATABASE_URL -f migrations/004_healthcare_professionals_verification_columns.sql

-- Add verification columns if they don't exist
-- These are required for the email verification flow in the professionals registration

ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10);

ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;

-- Create index for faster verification lookups if not exists
CREATE INDEX IF NOT EXISTS idx_professionals_email_verified
ON healthcare_professionals(email_verified);

-- Add comment for documentation
COMMENT ON COLUMN healthcare_professionals.verification_expires IS 'Expiration timestamp for email verification code (30 minutes from generation)';
COMMENT ON COLUMN healthcare_professionals.verification_code IS '6-digit verification code sent via email';
COMMENT ON COLUMN healthcare_professionals.email_verified IS 'Whether the professional has verified their email address';
