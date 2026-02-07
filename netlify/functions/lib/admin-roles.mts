// Shared admin role utilities for serverless functions

// Super Admin - Only direccionmedica has full control
export const SUPER_ADMIN_EMAILS = [
  'direccionmedica@clinicajoseingenieros.ar'
];

// Limited Admin - Can login, view data, authorize patients, but restricted actions
export const LIMITED_ADMIN_EMAILS = [
  'gerencia@clinicajoseingenieros.ar',
  'rrhh@clinicajoseingenieros.ar'
];

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

// Helper to check if session belongs to any admin (for basic access)
export async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const { role } = await getAdminRole(sql, sessionToken);
  return role !== null;
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
