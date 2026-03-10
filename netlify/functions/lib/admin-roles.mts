// Shared admin role utilities for serverless functions

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
  const [professional] = await sql`
    SELECT email FROM healthcare_professionals
    WHERE session_token = ${sessionToken} AND is_active = TRUE
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

// Helper to check if session belongs to any authenticated professional
// Also enforces 2-hour inactivity timeout and refreshes last_activity
export async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  // Any active professional with a valid session can access admin operations
  // Role-specific restrictions (super_admin only) are enforced per-action
  const [session] = await sql`
    SELECT email, last_activity FROM healthcare_professionals
    WHERE session_token = ${sessionToken} AND is_active = TRUE
  `;

  if (!session) return false;

  // Check 2h inactivity timeout
  if (session.last_activity) {
    const elapsed = Date.now() - new Date(session.last_activity).getTime();
    if (elapsed > 2 * 60 * 60 * 1000) {
      // Session expired — clear token
      await sql`UPDATE healthcare_professionals SET session_token = NULL WHERE session_token = ${sessionToken}`;
      return false;
    }
  }
  // Touch last_activity (non-blocking)
  sql`UPDATE healthcare_professionals SET last_activity = NOW() WHERE session_token = ${sessionToken}`.catch(() => {});
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
