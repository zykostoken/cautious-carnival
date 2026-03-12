import { hashSessionToken } from "./auth.mts";

// Shared admin role utilities for serverless functions
import { hashSessionToken } from './auth.mts';

// Super Admin - Only direccionmedica has full control
// Configured via SUPER_ADMIN_EMAILS env var (comma-separated)
export const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Limited Admin - Can login, view data, authorize patients, but restricted actions
// Configured via LIMITED_ADMIN_EMAILS env var (comma-separated)
export const LIMITED_ADMIN_EMAILS = (process.env.LIMITED_ADMIN_EMAILS || "")
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// All admin emails (combined for authentication)
export const ALL_ADMIN_EMAILS = [...SUPER_ADMIN_EMAILS, ...LIMITED_ADMIN_EMAILS];

// Admin role type
export type AdminRole = 'super_admin' | 'limited_admin' | null;

// Helper to get admin role from session
export async function getAdminRole(sql: any, sessionToken: string): Promise<{ role: AdminRole; email: string | null }> {
  const hashedToken = await hashSessionToken(sessionToken);
  const [professional] = await sql`
    SELECT email FROM healthcare_professionals
    WHERE session_token = ${hashedToken} AND is_active = TRUE
  `;

  if (!professional) {
    return { role: null, email: null };
  }

  const email = professional.email.toLowerCase();

  if (SUPER_ADMIN_EMAILS.includes(email)) {
    return { role: 'super_admin', email };
  }

  if (LIMITED_ADMIN_EMAILS.includes(email)) {
    return { role: 'limited_admin', email };
  }

  return { role: null, email };
}

// Helper to check if session belongs to any admin (for basic access)
// Also enforces 2-hour inactivity timeout and refreshes last_activity
export async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const { role } = await getAdminRole(sql, sessionToken);
  if (role === null) return false;

  // Check and update last_activity (2h timeout)
  const hashedToken = await hashSessionToken(sessionToken);
  const [session] = await sql`
    SELECT last_activity FROM healthcare_professionals
    WHERE session_token = ${hashedToken} AND is_active = TRUE
  `;
  if (session?.last_activity) {
    const elapsed = Date.now() - new Date(session.last_activity).getTime();
    if (elapsed > 2 * 60 * 60 * 1000) {
      // Session expired — clear token
      await sql`UPDATE healthcare_professionals SET session_token = NULL WHERE session_token = ${hashedToken}`;
      return false;
    }
  }
  // Touch last_activity (non-blocking)
  sql`UPDATE healthcare_professionals SET last_activity = NOW() WHERE session_token = ${hashedToken}`.catch(() => {});
  return true;
}

// Helper to check if session belongs to super admin
export async function isSuperAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const { role } = await getAdminRole(sql, sessionToken);
  return role === 'super_admin';
}

// Professional email domain validation
export const VALID_PROFESSIONAL_DOMAINS = [
  'clinicajoseingenieros.ar',
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'yahoo.com.ar'
];

export function isValidProfessionalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? VALID_PROFESSIONAL_DOMAINS.includes(domain) : false;
}

export function isAdminEmail(email: string): boolean {
  return ALL_ADMIN_EMAILS.includes(email.toLowerCase());
}
