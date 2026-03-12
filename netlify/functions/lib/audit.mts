// Professional audit log utility
// Tracks resource usage per professional per patient for compliance and analytics
import { hashSessionToken } from './auth.mts';

interface AuditEntry {
  professionalId: number;
  professionalEmail: string;
  actionType: string;
  resourceType?: string;
  patientId?: number | null;
  patientName?: string | null;
  details?: Record<string, any>;
  durationSeconds?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logProfessionalAction(sql: any, entry: AuditEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO professional_audit_log
        (professional_id, professional_email, action_type, resource_type,
         patient_id, patient_name, details, duration_seconds, ip_address, user_agent)
      VALUES (
        ${entry.professionalId},
        ${entry.professionalEmail},
        ${entry.actionType},
        ${entry.resourceType ?? null},
        ${entry.patientId ?? null},
        ${entry.patientName ?? null},
        ${JSON.stringify(entry.details ?? {})},
        ${entry.durationSeconds ?? null},
        ${entry.ipAddress ?? null},
        ${entry.userAgent ?? null}
      )
    `;
  } catch (err) {
    // Audit logging should never break the main operation
    console.error('Audit log error:', err);
  }
}

// Helper to extract professional info from session token
export async function getProfessionalFromToken(sql: any, sessionToken: string): Promise<{
  id: number; email: string; fullName: string;
  specialty?: string; role?: string;
  matriculaProvincial?: string; matriculaNacional?: string;
} | null> {
  const hashedToken = await hashSessionToken(sessionToken);
  const [prof] = await sql`
    SELECT id, email, full_name, specialty, role,
           matricula_provincial, matricula_nacional
    FROM healthcare_professionals
    WHERE session_token = ${hashedToken} AND is_active = TRUE
  `;
  if (!prof) return null;
  return {
    id: prof.id, email: prof.email, fullName: prof.full_name,
    specialty: prof.specialty, role: prof.role,
    matriculaProvincial: prof.matricula_provincial,
    matriculaNacional: prof.matricula_nacional,
  };
}
