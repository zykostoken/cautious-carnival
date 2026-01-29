-- Migration: Add email verification columns to healthcare_professionals
-- Run after 001_initial.sql
-- This migration ensures the verification columns exist for databases
-- that were created before these columns were added to the schema

-- Add email verification columns to healthcare_professionals table
ALTER TABLE healthcare_professionals
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;

-- Create index for verification lookups if not exists
CREATE INDEX IF NOT EXISTS idx_professionals_email_verified ON healthcare_professionals(email_verified);

COMMENT ON COLUMN healthcare_professionals.verification_expires IS 'Expiration timestamp for email verification code';
