import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Admin emails that have full control
const ADMIN_EMAILS = ['gonzaloperezcortizo@gmail.com', 'gerencia@clinicajoseingenieros.com.ar'];

// Valid professional email domains - only clinic staff can register
const VALID_PROFESSIONAL_DOMAINS = ['clinicajoseingenieros.ar', 'clinicajoseingenieros.com.ar'];

// Check if email domain is valid for professionals
function isValidProfessionalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return VALID_PROFESSIONAL_DOMAINS.includes(domain);
}

// Simple password hashing (in production, use bcrypt)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (process.env.PASSWORD_SALT || 'clinica_salt_2024'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Helper to check if session belongs to admin
async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const [professional] = await sql`
    SELECT email FROM healthcare_professionals
    WHERE session_token = ${sessionToken} AND is_active = TRUE
  `;
  return professional && ADMIN_EMAILS.includes(professional.email);
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Register a new professional (requires @clinicajoseingenieros.ar email)
      if (action === "register") {
        const { email, password, fullName, specialty, licenseNumber, phone, whatsapp } = body;

        if (!email || !password || !fullName) {
          return new Response(JSON.stringify({
            error: "Email, password y nombre completo son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate email domain - must be clinic staff
        if (!isValidProfessionalEmail(email)) {
          return new Response(JSON.stringify({
            error: "Solo se permite el registro con emails institucionales (@clinicajoseingenieros.ar o @clinicajoseingenieros.com.ar)"
          }), { status: 400, headers: corsHeaders });
        }

        // Check if email already exists
        const [existing] = await sql`
          SELECT id, email_verified FROM healthcare_professionals WHERE email = ${email}
        `;

        if (existing) {
          if (existing.email_verified) {
            return new Response(JSON.stringify({
              error: "El email ya está registrado"
            }), { status: 400, headers: corsHeaders });
          } else {
            // Re-send verification code
            const verificationCode = generateVerificationCode();
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

            await sql`
              UPDATE healthcare_professionals
              SET verification_code = ${verificationCode},
                  verification_expires = ${expiresAt.toISOString()}
              WHERE id = ${existing.id}
            `;

            // Send verification email (async)
            fetch(`${new URL(req.url).origin}/api/notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'send_verification_email',
                email,
                code: verificationCode,
                fullName
              })
            }).catch(e => console.log('Email notification failed:', e));

            return new Response(JSON.stringify({
              success: true,
              requiresVerification: true,
              professionalId: existing.id,
              message: "Se ha enviado un nuevo código de verificación a tu email"
            }), { status: 200, headers: corsHeaders });
          }
        }

        const passwordHash = await hashPassword(password);
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        const [professional] = await sql`
          INSERT INTO healthcare_professionals (
            email, password_hash, full_name, specialty, license_number,
            phone, whatsapp, email_verified, verification_code, verification_expires,
            is_active, created_at
          )
          VALUES (
            ${email}, ${passwordHash}, ${fullName},
            ${specialty || 'Psiquiatría'}, ${licenseNumber || null},
            ${phone || null}, ${whatsapp || null}, FALSE,
            ${verificationCode}, ${verificationExpires.toISOString()},
            FALSE, NOW()
          )
          RETURNING id, email, full_name, specialty
        `;

        // Send verification email (async)
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_verification_email',
            email,
            code: verificationCode,
            fullName
          })
        }).catch(e => console.log('Email notification failed:', e));

        return new Response(JSON.stringify({
          success: true,
          requiresVerification: true,
          professionalId: professional.id,
          message: "Se ha enviado un código de verificación a tu email institucional. Verificá tu bandeja de entrada."
        }), { status: 201, headers: corsHeaders });
      }

      // Verify email with code
      if (action === "verify_email") {
        const { email, code } = body;

        if (!email || !code) {
          return new Response(JSON.stringify({
            error: "Email y código de verificación son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id, verification_code, verification_expires, email_verified
          FROM healthcare_professionals
          WHERE email = ${email}
        `;

        if (!professional) {
          return new Response(JSON.stringify({
            error: "Email no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        if (professional.email_verified) {
          return new Response(JSON.stringify({
            error: "El email ya está verificado"
          }), { status: 400, headers: corsHeaders });
        }

        if (professional.verification_code !== code) {
          return new Response(JSON.stringify({
            error: "Código de verificación incorrecto"
          }), { status: 400, headers: corsHeaders });
        }

        if (new Date(professional.verification_expires) < new Date()) {
          return new Response(JSON.stringify({
            error: "El código de verificación ha expirado. Solicitá uno nuevo."
          }), { status: 400, headers: corsHeaders });
        }

        const sessionToken = generateSessionToken();

        await sql`
          UPDATE healthcare_professionals
          SET email_verified = TRUE,
              is_active = TRUE,
              verification_code = NULL,
              verification_expires = NULL,
              session_token = ${sessionToken},
              last_login = NOW()
          WHERE id = ${professional.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          sessionToken,
          message: "Email verificado exitosamente. Ya podés acceder al sistema."
        }), { status: 200, headers: corsHeaders });
      }

      // Login
      if (action === "login") {
        const { email, password } = body;

        if (!email || !password) {
          return new Response(JSON.stringify({
            error: "Email y contraseña requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id, email, password_hash, full_name, specialty, is_active, email_verified
          FROM healthcare_professionals
          WHERE email = ${email}
        `;

        if (!professional) {
          return new Response(JSON.stringify({
            error: "Credenciales inválidas"
          }), { status: 401, headers: corsHeaders });
        }

        // Check if email is verified
        if (!professional.email_verified) {
          return new Response(JSON.stringify({
            error: "Tu email no está verificado. Revisá tu bandeja de entrada o solicitá un nuevo código.",
            requiresVerification: true
          }), { status: 401, headers: corsHeaders });
        }

        if (!professional.is_active) {
          return new Response(JSON.stringify({
            error: "Cuenta desactivada. Contacte al administrador."
          }), { status: 401, headers: corsHeaders });
        }

        const validPassword = await verifyPassword(password, professional.password_hash);
        if (!validPassword) {
          return new Response(JSON.stringify({
            error: "Credenciales inválidas"
          }), { status: 401, headers: corsHeaders });
        }

        const sessionToken = generateSessionToken();

        await sql`
          UPDATE healthcare_professionals
          SET session_token = ${sessionToken}, last_login = NOW()
          WHERE id = ${professional.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          professional: {
            id: professional.id,
            email: professional.email,
            fullName: professional.full_name,
            specialty: professional.specialty
          },
          sessionToken,
          message: "Inicio de sesión exitoso"
        }), { status: 200, headers: corsHeaders });
      }

      // Logout
      if (action === "logout") {
        const { sessionToken } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        await sql`
          UPDATE healthcare_professionals
          SET session_token = NULL, is_available = FALSE
          WHERE session_token = ${sessionToken}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Sesión cerrada"
        }), { status: 200, headers: corsHeaders });
      }

      // Toggle availability (professional goes online/offline)
      if (action === "toggle_availability") {
        const { sessionToken, isAvailable } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          UPDATE healthcare_professionals
          SET is_available = ${isAvailable}
          WHERE session_token = ${sessionToken}
          RETURNING id, full_name, is_available
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          isAvailable: professional.is_available,
          message: professional.is_available
            ? "Ahora estás disponible para recibir llamadas"
            : "Ya no recibirás nuevas llamadas"
        }), { status: 200, headers: corsHeaders });
      }

      // Update notification preferences
      if (action === "update_notifications") {
        const { sessionToken, notifyEmail, notifyWhatsapp, whatsapp } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          UPDATE healthcare_professionals
          SET notify_email = ${notifyEmail ?? true},
              notify_whatsapp = ${notifyWhatsapp ?? true},
              whatsapp = ${whatsapp || null}
          WHERE session_token = ${sessionToken}
          RETURNING id, notify_email, notify_whatsapp, whatsapp
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          notifications: {
            email: professional.notify_email,
            whatsapp: professional.notify_whatsapp,
            whatsappNumber: professional.whatsapp
          }
        }), { status: 200, headers: corsHeaders });
      }

      // ========== ADMIN ACTIONS ==========

      // Admin: Toggle professional active status
      if (action === "admin_toggle_active") {
        const { sessionToken, professionalId, isActive } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        // Verify admin privileges
        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        const [updated] = await sql`
          UPDATE healthcare_professionals
          SET is_active = ${isActive}
          WHERE id = ${professionalId}
          RETURNING id, full_name, is_active
        `;

        if (!updated) {
          return new Response(JSON.stringify({ error: "Profesional no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          professional: {
            id: updated.id,
            fullName: updated.full_name,
            isActive: updated.is_active
          },
          message: updated.is_active ? "Profesional activado" : "Profesional desactivado"
        }), { status: 200, headers: corsHeaders });
      }

      // Admin: Create a new professional (pre-approved)
      if (action === "admin_create_professional") {
        const { sessionToken, email, password, fullName, specialty, whatsapp } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        // Verify admin privileges
        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        if (!email || !password || !fullName) {
          return new Response(JSON.stringify({
            error: "Email, contraseña y nombre son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Check if email already exists
        const [existing] = await sql`
          SELECT id FROM healthcare_professionals WHERE email = ${email}
        `;

        if (existing) {
          return new Response(JSON.stringify({
            error: "El email ya está registrado"
          }), { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(password);

        const [professional] = await sql`
          INSERT INTO healthcare_professionals (
            email, password_hash, full_name, specialty, whatsapp,
            is_active, created_at
          )
          VALUES (
            ${email}, ${passwordHash}, ${fullName},
            ${specialty || 'Psiquiatría'}, ${whatsapp || null},
            TRUE, NOW()
          )
          RETURNING id, email, full_name, specialty
        `;

        return new Response(JSON.stringify({
          success: true,
          professional: {
            id: professional.id,
            email: professional.email,
            fullName: professional.full_name,
            specialty: professional.specialty
          },
          message: "Profesional creado y activado exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Professional management error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const action = url.searchParams.get("action");

    // Verify session and get professional info
    if (action === "verify" && sessionToken) {
      try {
        const [professional] = await sql`
          SELECT id, email, full_name, specialty, is_available,
                 notify_email, notify_whatsapp, whatsapp
          FROM healthcare_professionals
          WHERE session_token = ${sessionToken} AND is_active = TRUE
        `;

        if (!professional) {
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión inválida o expirada"
          }), { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          valid: true,
          professional: {
            id: professional.id,
            email: professional.email,
            fullName: professional.full_name,
            specialty: professional.specialty,
            isAvailable: professional.is_available,
            notifications: {
              email: professional.notify_email,
              whatsapp: professional.notify_whatsapp,
              whatsappNumber: professional.whatsapp
            }
          }
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Session verification error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    // Get list of available professionals (for admin/assignment)
    if (action === "available") {
      try {
        const professionals = await sql`
          SELECT id, full_name, specialty, is_available, current_calls, max_concurrent_calls
          FROM healthcare_professionals
          WHERE is_active = TRUE AND is_available = TRUE
          ORDER BY current_calls ASC, full_name ASC
        `;

        return new Response(JSON.stringify({
          professionals: professionals.map(p => ({
            id: p.id,
            fullName: p.full_name,
            specialty: p.specialty,
            availableSlots: p.max_concurrent_calls - p.current_calls
          }))
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Get available professionals error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    // Admin: Get list of all professionals for management
    if (action === "admin_list" && sessionToken) {
      try {
        // Verify admin privileges
        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        const professionals = await sql`
          SELECT id, email, full_name, specialty, is_active, is_available,
                 created_at, last_login
          FROM healthcare_professionals
          ORDER BY is_active DESC, created_at DESC
        `;

        return new Response(JSON.stringify({
          professionals: professionals.map(p => ({
            id: p.id,
            email: p.email,
            fullName: p.full_name,
            specialty: p.specialty,
            isActive: p.is_active,
            isAvailable: p.is_available,
            isPending: !p.is_active && !p.last_login, // Never logged in = pending approval
            createdAt: p.created_at,
            lastLogin: p.last_login
          }))
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Admin list error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Acción requerida" }),
      { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/professionals"
};
