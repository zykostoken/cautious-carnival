import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { hashPassword, verifyPassword, generateSessionToken, generateVerificationCode, CORS_HEADERS, corsResponse, jsonResponse, errorResponse, checkRateLimit, isSessionExpired, hashSessionToken } from "./lib/auth.mts";
import { isAdminEmail, isValidProfessionalEmail } from "./lib/admin-roles.mts";

// Flag to track if migration has been run
let migrationRun = false;

// Ensure verification columns exist in healthcare_professionals table
async function ensureVerificationColumns(sql: ReturnType<typeof getDatabase>) {
  if (migrationRun) return;

  try {
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS verification_code VARCHAR(10)
    `;
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE
    `;
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE
    `;
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS session_token VARCHAR(255)
    `;
    await sql`
      ALTER TABLE healthcare_professionals
      ADD COLUMN IF NOT EXISTS dni VARCHAR(20)
    `;

    migrationRun = true;
    console.log('Healthcare professionals verification columns ensured');
  } catch (error) {
    console.error('Migration check failed:', error);
  }
}

// H-003: Admin emails from env vars only - no hardcoded personal emails
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.ADDITIONAL_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

// Helper to check if session belongs to admin
async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const hashedToken = await hashSessionToken(sessionToken);
  const [professional] = await sql`
    SELECT email FROM healthcare_professionals
    WHERE session_token = ${hashedToken} AND is_active = TRUE
  `;
  return professional && (isAdminEmail(professional.email) || ADMIN_EMAILS.some(a => a.toLowerCase() === professional.email.toLowerCase()));
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();

  // Ensure verification columns exist before any operations
  await ensureVerificationColumns(sql);

  const { getCorsHeaders } = await import("./lib/auth.mts");
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Register a new professional (requires @clinicajoseingenieros.ar email)
      if (action === "register") {
        const { email, password, fullName, specialty, licenseNumber, phone, whatsapp, dni } = body;

        if (!email || !password || !fullName) {
          return new Response(JSON.stringify({
            error: "Email, password y nombre completo son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate email domain - must be clinic staff
        if (!isValidProfessionalEmail(email)) {
          return new Response(JSON.stringify({
            error: "Solo se permite el registro con emails institucionales (@clinicajoseingenieros.ar)"
          }), { status: 400, headers: corsHeaders });
        }

        // Check if this is an admin email (skip verification for admins)
        const isAdmin = isAdminEmail(email);

        // Check if email already exists
        const [existing] = await sql`
          SELECT id, email_verified, password_hash FROM healthcare_professionals WHERE email = ${email}
        `;

        if (existing) {
          // Pre-seeded professional: verified but no password yet - allow them to complete registration
          if (existing.email_verified && !existing.password_hash) {
            const passwordHash = await hashPassword(password);
            const sessionToken = generateSessionToken();
            const hashedTokenReg = await hashSessionToken(sessionToken);

            await sql`
              UPDATE healthcare_professionals
              SET password_hash = ${passwordHash},
                  full_name = ${fullName},
                  specialty = COALESCE(${specialty}, specialty),
                  phone = COALESCE(${phone}, phone),
                  whatsapp = COALESCE(${whatsapp}, whatsapp),
                  dni = COALESCE(${dni || null}, dni),
                  session_token = ${hashedTokenReg},
                  last_login = NOW(),
                  last_activity = NOW()
              WHERE id = ${existing.id}
            `;

            return new Response(JSON.stringify({
              success: true,
              sessionToken,
              message: "Cuenta configurada exitosamente. Ya podés acceder al sistema."
            }), { status: 200, headers: corsHeaders });
          }

          if (existing.email_verified && existing.password_hash) {
            return new Response(JSON.stringify({
              error: "El email ya está registrado"
            }), { status: 400, headers: corsHeaders });
          } else if (isAdmin) {
            // Admin email exists but not verified - activate it directly
            const sessionToken = generateSessionToken();
            const hashedTokenAdmin = await hashSessionToken(sessionToken);
            await sql`
              UPDATE healthcare_professionals
              SET email_verified = TRUE,
                  is_active = TRUE,
                  verification_code = NULL,
                  verification_expires = NULL,
                  session_token = ${hashedTokenAdmin},
                  last_login = NOW(),
                  last_activity = NOW()
              WHERE id = ${existing.id}
            `;

            return new Response(JSON.stringify({
              success: true,
              sessionToken,
              message: "Cuenta admin activada exitosamente. Ya podés acceder al sistema."
            }), { status: 200, headers: corsHeaders });
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

        // Admin emails are pre-approved and skip verification
        if (isAdmin) {
          const sessionToken = generateSessionToken();
          const hashedTokenNewAdmin = await hashSessionToken(sessionToken);

          const [professional] = await sql`
            INSERT INTO healthcare_professionals (
              email, password_hash, full_name, specialty, license_number,
              phone, whatsapp, dni, email_verified, is_active, session_token,
              last_login, created_at
            )
            VALUES (
              ${email}, ${passwordHash}, ${fullName},
              ${specialty || 'Psiquiatría'}, ${licenseNumber || null},
              ${phone || null}, ${whatsapp || null}, ${dni || null}, TRUE, TRUE,
              ${hashedTokenNewAdmin}, NOW(), NOW()
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
            sessionToken,
            message: "Cuenta admin creada y activada exitosamente. Ya podés acceder al sistema."
          }), { status: 201, headers: corsHeaders });
        }

        // Regular registration flow with verification
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        const [professional] = await sql`
          INSERT INTO healthcare_professionals (
            email, password_hash, full_name, specialty, license_number,
            phone, whatsapp, dni, email_verified, verification_code, verification_expires,
            is_active, created_at
          )
          VALUES (
            ${email}, ${passwordHash}, ${fullName},
            ${specialty || 'Psiquiatría'}, ${licenseNumber || null},
            ${phone || null}, ${whatsapp || null}, ${dni || null}, FALSE,
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

      // Request password reset - check if professional exists and has DNI configured
      // Since email is not configured, we use the last 4 digits of DNI for verification
      if (action === "request_password_reset") {
        const { email } = body;

        if (!email) {
          return new Response(JSON.stringify({
            error: "Email es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id, email, full_name, dni
          FROM healthcare_professionals
          WHERE email = ${email}
        `;

        if (!professional) {
          // Don't reveal if email exists or not for security
          return new Response(JSON.stringify({
            success: true,
            canResetWithDni: false,
            message: "Si el email está registrado y tiene DNI configurado, podrás restablecer tu contraseña."
          }), { status: 200, headers: corsHeaders });
        }

        // Check if professional has DNI configured
        if (!professional.dni || professional.dni.length < 4) {
          return new Response(JSON.stringify({
            success: false,
            canResetWithDni: false,
            error: "Tu cuenta no tiene DNI configurado. Contactá al administrador para restablecer tu contraseña."
          }), { status: 400, headers: corsHeaders });
        }

        // Professional exists and has DNI - allow password reset with last 4 digits
        return new Response(JSON.stringify({
          success: true,
          canResetWithDni: true,
          message: "Ingresá los últimos 4 dígitos de tu DNI para restablecer tu contraseña."
        }), { status: 200, headers: corsHeaders });
      }

      // Reset password with last 4 digits of DNI (no email required)
      if (action === "reset_password") {
        const { email, dniLast4, newPassword } = body;

        // Rate limit password reset attempts - critical! Only 10k combinations (H-022)
        if (!checkRateLimit(`pwd_reset:${email}`, 3, 30 * 60 * 1000)) {
          return new Response(JSON.stringify({
            error: "Demasiados intentos. Intente nuevamente en 30 minutos."
          }), { status: 429, headers: corsHeaders });
        }

        if (!email || !dniLast4 || !newPassword) {
          return new Response(JSON.stringify({
            error: "Email, últimos 4 dígitos del DNI y nueva contraseña son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        if (dniLast4.length !== 4 || !/^\d{4}$/.test(dniLast4)) {
          return new Response(JSON.stringify({
            error: "Debés ingresar exactamente 4 dígitos numéricos"
          }), { status: 400, headers: corsHeaders });
        }

        if (newPassword.length < 12) {
          return new Response(JSON.stringify({
            error: "La contraseña debe tener al menos 12 caracteres"
          }), { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id, dni
          FROM healthcare_professionals
          WHERE email = ${email}
        `;

        if (!professional) {
          return new Response(JSON.stringify({
            error: "Email no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        if (!professional.dni || professional.dni.length < 4) {
          return new Response(JSON.stringify({
            error: "Tu cuenta no tiene DNI configurado. Contactá al administrador."
          }), { status: 400, headers: corsHeaders });
        }

        // Verify last 4 digits of DNI
        const actualLast4 = professional.dni.slice(-4);
        if (actualLast4 !== dniLast4) {
          return new Response(JSON.stringify({
            error: "Los últimos 4 dígitos del DNI son incorrectos"
          }), { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(newPassword);
        const sessionToken = generateSessionToken();
        const hashedTokenReset = await hashSessionToken(sessionToken);

        await sql`
          UPDATE healthcare_professionals
          SET password_hash = ${passwordHash},
              verification_code = NULL,
              verification_expires = NULL,
              email_verified = TRUE,
              is_active = TRUE,
              session_token = ${hashedTokenReset},
              last_login = NOW(),
              last_activity = NOW()
          WHERE id = ${professional.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          sessionToken,
          message: "Contraseña actualizada exitosamente. Ya podés acceder al sistema."
        }), { status: 200, headers: corsHeaders });
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
        const hashedTokenVerifyEmail = await hashSessionToken(sessionToken);

        await sql`
          UPDATE healthcare_professionals
          SET email_verified = TRUE,
              is_active = TRUE,
              verification_code = NULL,
              verification_expires = NULL,
              session_token = ${hashedTokenVerifyEmail},
              last_login = NOW(),
              last_activity = NOW()
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

        // Rate limit login attempts (H-006)
        if (!checkRateLimit(`prof_login:${email}`, 5, 15 * 60 * 1000)) {
          return new Response(JSON.stringify({
            error: "Demasiados intentos. Intente nuevamente en 15 minutos."
          }), { status: 429, headers: corsHeaders });
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
        const hashedTokenLogin = await hashSessionToken(sessionToken);

        await sql`
          UPDATE healthcare_professionals
          SET session_token = ${hashedTokenLogin}, last_login = NOW(), last_activity = NOW()
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

        const hashedTokenLogout = await hashSessionToken(sessionToken);
        await sql`
          UPDATE healthcare_professionals
          SET session_token = NULL, is_available = FALSE
          WHERE session_token = ${hashedTokenLogout}
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

        const hashedTokenAvail = await hashSessionToken(sessionToken);
        const [professional] = await sql`
          UPDATE healthcare_professionals
          SET is_available = ${isAvailable}
          WHERE session_token = ${hashedTokenAvail}
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

        const hashedTokenNotif = await hashSessionToken(sessionToken);
        const [professional] = await sql`
          UPDATE healthcare_professionals
          SET notify_email = ${notifyEmail ?? true},
              notify_whatsapp = ${notifyWhatsapp ?? true},
              whatsapp = ${whatsapp || null}
          WHERE session_token = ${hashedTokenNotif}
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

      // Admin: Create a new professional (pre-approved, no email verification needed)
      if (action === "admin_create_professional") {
        const { sessionToken, email, password, fullName, specialty, whatsapp, dni,
                role, matriculaProvincial, matriculaNacional, licenseNumber } = body;

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
            error: "Email/usuario, contraseña y nombre son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Check if email already exists
        const [existing] = await sql`
          SELECT id FROM healthcare_professionals WHERE email = ${email}
        `;

        if (existing) {
          return new Response(JSON.stringify({
            error: "El email/usuario ya está registrado"
          }), { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(password);

        const [professional] = await sql`
          INSERT INTO healthcare_professionals (
            email, password_hash, full_name, specialty, whatsapp, dni,
            role, matricula_provincial, matricula_nacional, license_number,
            is_active, email_verified, created_by_admin, created_at
          )
          VALUES (
            ${email}, ${passwordHash}, ${fullName},
            ${specialty || role || 'Profesional'},
            ${whatsapp || null}, ${dni || null},
            ${role || 'profesional'},
            ${matriculaProvincial || null},
            ${matriculaNacional || null},
            ${licenseNumber || null},
            TRUE, TRUE, TRUE, NOW()
          )
          RETURNING id, email, full_name, specialty, role
        `;

        return new Response(JSON.stringify({
          success: true,
          professional: {
            id: professional.id,
            email: professional.email,
            fullName: professional.full_name,
            specialty: professional.specialty,
            role: professional.role
          },
          message: "Profesional creado y activado exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Admin: Update professional (role, matrícula, specialty, etc.)
      if (action === "admin_update_professional") {
        const { sessionToken, professionalId, fullName, specialty, role,
                matriculaProvincial, matriculaNacional, licenseNumber, whatsapp, dni } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        if (!professionalId) {
          return new Response(JSON.stringify({ error: "ID de profesional requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [updated] = await sql`
          UPDATE healthcare_professionals
          SET full_name = COALESCE(${fullName || null}, full_name),
              specialty = COALESCE(${specialty || null}, specialty),
              role = COALESCE(${role || null}, role),
              matricula_provincial = COALESCE(${matriculaProvincial || null}, matricula_provincial),
              matricula_nacional = COALESCE(${matriculaNacional || null}, matricula_nacional),
              license_number = COALESCE(${licenseNumber || null}, license_number),
              whatsapp = COALESCE(${whatsapp || null}, whatsapp),
              dni = COALESCE(${dni || null}, dni)
          WHERE id = ${professionalId}
          RETURNING id, email, full_name, specialty, role, matricula_provincial, matricula_nacional
        `;

        if (!updated) {
          return new Response(JSON.stringify({ error: "Profesional no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          professional: {
            id: updated.id,
            email: updated.email,
            fullName: updated.full_name,
            specialty: updated.specialty,
            role: updated.role,
            matriculaProvincial: updated.matricula_provincial,
            matriculaNacional: updated.matricula_nacional
          },
          message: "Profesional actualizado"
        }), { status: 200, headers: corsHeaders });
      }

      // Admin: Reset password for a professional
      if (action === "admin_reset_password") {
        const { sessionToken, professionalId, newPassword } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        if (!professionalId || !newPassword) {
          return new Response(JSON.stringify({ error: "ID y nueva contraseña requeridos" }),
            { status: 400, headers: corsHeaders });
        }

        if (newPassword.length < 12) {
          return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 12 caracteres" }),
            { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(newPassword);

        const [updated] = await sql`
          UPDATE healthcare_professionals
          SET password_hash = ${passwordHash}
          WHERE id = ${professionalId}
          RETURNING id, full_name
        `;

        if (!updated) {
          return new Response(JSON.stringify({ error: "Profesional no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Contraseña de ${updated.full_name} actualizada`
        }), { status: 200, headers: corsHeaders });
      }

      // Admin: Set DNI for a professional (for password recovery)
      if (action === "admin_set_dni") {
        const { sessionToken, professionalId, dni } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        // Verify admin privileges
        if (!(await isAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({ error: "No autorizado" }),
            { status: 403, headers: corsHeaders });
        }

        if (!professionalId || !dni) {
          return new Response(JSON.stringify({
            error: "ID del profesional y DNI son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate DNI format (only digits, 7-8 characters)
        if (!/^\d{7,8}$/.test(dni)) {
          return new Response(JSON.stringify({
            error: "El DNI debe tener entre 7 y 8 dígitos"
          }), { status: 400, headers: corsHeaders });
        }

        const [updated] = await sql`
          UPDATE healthcare_professionals
          SET dni = ${dni}
          WHERE id = ${professionalId}
          RETURNING id, full_name, dni
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
            dni: updated.dni
          },
          message: "DNI actualizado exitosamente. El profesional puede usar los últimos 4 dígitos para recuperar su contraseña."
        }), { status: 200, headers: corsHeaders });
      }

      // Update professional's own DNI (logged in user)
      if (action === "update_dni") {
        const { sessionToken, dni } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        if (!dni) {
          return new Response(JSON.stringify({
            error: "DNI es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate DNI format (only digits, 7-8 characters)
        if (!/^\d{7,8}$/.test(dni)) {
          return new Response(JSON.stringify({
            error: "El DNI debe tener entre 7 y 8 dígitos"
          }), { status: 400, headers: corsHeaders });
        }

        const hashedTokenDni = await hashSessionToken(sessionToken);
        const [updated] = await sql`
          UPDATE healthcare_professionals
          SET dni = ${dni}
          WHERE session_token = ${hashedTokenDni} AND is_active = TRUE
          RETURNING id, full_name, dni
        `;

        if (!updated) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "DNI actualizado. Podés usarlo para recuperar tu contraseña si la olvidás."
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Professional management error:", error);
      return new Response(JSON.stringify({
        error: "Error interno del servidor"
      }), { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const action = url.searchParams.get("action");

    // Verify session and get professional info
    if (action === "verify" && sessionToken) {
      try {
        const hashedTokenVerify = await hashSessionToken(sessionToken);
        const [professional] = await sql`
          SELECT id, email, full_name, specialty, is_available,
                 notify_email, notify_whatsapp, whatsapp, last_activity, last_login
          FROM healthcare_professionals
          WHERE session_token = ${hashedTokenVerify} AND is_active = TRUE
        `;

        if (!professional) {
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión inválida o expirada"
          }), { status: 401, headers: corsHeaders });
        }

        // Check 2hr inactivity timeout (H-005)
        const { isProfessionalSessionExpired } = await import("./lib/auth.mts");
        const lastActive = professional.last_activity || professional.last_login;
        if (isProfessionalSessionExpired(lastActive)) {
          await sql`UPDATE healthcare_professionals SET session_token = NULL WHERE id = ${professional.id}`;
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión expirada por inactividad. Inicie sesión nuevamente."
          }), { status: 401, headers: corsHeaders });
        }

        // Touch last_activity on verify (keeps session alive while active)
        await sql`UPDATE healthcare_professionals SET last_activity = NOW() WHERE id = ${professional.id}`;

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
                 role, matricula_provincial, matricula_nacional, license_number, dni,
                 whatsapp, created_by_admin, created_at, last_login
          FROM healthcare_professionals
          ORDER BY is_active DESC, role, full_name ASC
        `;

        return new Response(JSON.stringify({
          professionals: professionals.map(p => ({
            id: p.id,
            email: p.email,
            fullName: p.full_name,
            specialty: p.specialty,
            role: p.role || 'profesional',
            matriculaProvincial: p.matricula_provincial,
            matriculaNacional: p.matricula_nacional,
            licenseNumber: p.license_number,
            dni: p.dni,
            whatsapp: p.whatsapp,
            isActive: p.is_active,
            isAvailable: p.is_available,
            isPending: !p.is_active && !p.last_login,
            createdByAdmin: p.created_by_admin,
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
