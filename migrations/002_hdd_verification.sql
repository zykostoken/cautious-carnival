-- Migration: Add email verification columns to hdd_patients
-- Run after 001_initial.sql

-- Add email verification columns to hdd_patients table
ALTER TABLE hdd_patients
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS username VARCHAR(100);

-- Add 'pending' to status options (for unverified registrations)
-- Status can now be: 'active', 'discharged', 'suspended', 'pending'

-- Create index for verification lookups
CREATE INDEX IF NOT EXISTS idx_hdd_patients_email_verified ON hdd_patients(email_verified);

-- Add notification log table if not exists
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    recipient_type VARCHAR(50) NOT NULL, -- 'admin', 'professional', 'hdd_patient', etc.
    recipient_id INTEGER DEFAULT 0,
    channel VARCHAR(20) NOT NULL, -- 'email', 'whatsapp'
    destination VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL, -- 'new_call', 'call_taken', 'verification', etc.
    message_content TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    external_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_type, recipient_id);

COMMENT ON TABLE notification_log IS 'Log of all notification attempts (email, WhatsApp)';
