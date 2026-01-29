import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Simple password hashing (same as professionals)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (process.env.PASSWORD_SALT || 'clinica_salt_2024'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

      // Patient login with DNI and password
      if (action === "login") {
        const { dni, password } = body;

        if (!dni || !password) {
          return new Response(JSON.stringify({
            error: "DNI y contraseña son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          SELECT id, dni, full_name, email, phone, password_hash, status, photo_url
          FROM hdd_patients
          WHERE dni = ${dni}
        `;

        if (!patient) {
          return new Response(JSON.stringify({
            error: "DNI no registrado. Contacte a la administración."
          }), { status: 401, headers: corsHeaders });
        }

        if (patient.status !== 'active') {
          return new Response(JSON.stringify({
            error: "Su cuenta no está activa. Contacte a la administración."
          }), { status: 401, headers: corsHeaders });
        }

        // First login - set password
        if (!patient.password_hash) {
          const passwordHash = await hashPassword(password);
          const sessionToken = generateSessionToken();

          await sql`
            UPDATE hdd_patients
            SET password_hash = ${passwordHash},
                session_token = ${sessionToken},
                last_login = NOW(),
                updated_at = NOW()
            WHERE id = ${patient.id}
          `;

          // Track the first login session for metrics
          await sql`
            INSERT INTO hdd_login_tracking (patient_id, login_at, user_agent)
            VALUES (${patient.id}, NOW(), ${req.headers.get('user-agent') || null})
          `.catch(e => console.log('Login tracking failed:', e));

          return new Response(JSON.stringify({
            success: true,
            firstLogin: true,
            patient: {
              id: patient.id,
              dni: patient.dni,
              fullName: patient.full_name,
              email: patient.email,
              photoUrl: patient.photo_url
            },
            sessionToken,
            message: "Bienvenido/a! Su contraseña ha sido configurada."
          }), { status: 200, headers: corsHeaders });
        }

        // Normal login - verify password
        const validPassword = await verifyPassword(password, patient.password_hash);
        if (!validPassword) {
          return new Response(JSON.stringify({
            error: "Contraseña incorrecta"
          }), { status: 401, headers: corsHeaders });
        }

        const sessionToken = generateSessionToken();

        await sql`
          UPDATE hdd_patients
          SET session_token = ${sessionToken},
              last_login = NOW()
          WHERE id = ${patient.id}
        `;

        // Track the login session for metrics
        await sql`
          INSERT INTO hdd_login_tracking (patient_id, login_at, user_agent)
          VALUES (${patient.id}, NOW(), ${req.headers.get('user-agent') || null})
        `.catch(e => console.log('Login tracking failed:', e));

        return new Response(JSON.stringify({
          success: true,
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            photoUrl: patient.photo_url
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
          UPDATE hdd_patients
          SET session_token = NULL
          WHERE session_token = ${sessionToken}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Sesión cerrada"
        }), { status: 200, headers: corsHeaders });
      }

      // Update profile (email, phone)
      if (action === "update_profile") {
        const { sessionToken, email, phone } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          UPDATE hdd_patients
          SET email = COALESCE(${email}, email),
              phone = COALESCE(${phone}, phone),
              updated_at = NOW()
          WHERE session_token = ${sessionToken}
          RETURNING id, full_name, email, phone
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          patient: {
            id: patient.id,
            fullName: patient.full_name,
            email: patient.email,
            phone: patient.phone
          }
        }), { status: 200, headers: corsHeaders });
      }

      // Change password
      if (action === "change_password") {
        const { sessionToken, currentPassword, newPassword } = body;

        if (!sessionToken || !currentPassword || !newPassword) {
          return new Response(JSON.stringify({
            error: "Token, contraseña actual y nueva contraseña son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          SELECT id, password_hash FROM hdd_patients
          WHERE session_token = ${sessionToken}
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        const validPassword = await verifyPassword(currentPassword, patient.password_hash);
        if (!validPassword) {
          return new Response(JSON.stringify({ error: "Contraseña actual incorrecta" }),
            { status: 401, headers: corsHeaders });
        }

        const newPasswordHash = await hashPassword(newPassword);

        await sql`
          UPDATE hdd_patients
          SET password_hash = ${newPasswordHash}, updated_at = NOW()
          WHERE id = ${patient.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Contraseña actualizada exitosamente"
        }), { status: 200, headers: corsHeaders });
      }

      // Track activity/interaction for metrics
      if (action === "track_activity") {
        const { sessionToken, activityType, activityData } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          SELECT id FROM hdd_patients WHERE session_token = ${sessionToken} AND status = 'active'
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        // Update the latest login tracking record with interaction data
        await sql`
          UPDATE hdd_login_tracking
          SET interactions = COALESCE(interactions, '{}'::jsonb) ||
              jsonb_build_object(${activityType || 'general'}, COALESCE(interactions->${activityType || 'general'}, '0'::jsonb)::int + 1),
              activities_completed = activities_completed + 1
          WHERE patient_id = ${patient.id}
            AND logout_at IS NULL
          ORDER BY login_at DESC
          LIMIT 1
        `.catch(e => console.log('Activity tracking error:', e));

        return new Response(JSON.stringify({
          success: true,
          message: "Actividad registrada"
        }), { status: 200, headers: corsHeaders });
      }

      // ===========================================
      // SELF-REGISTRATION WITH EMAIL VERIFICATION
      // ===========================================

      // Step 1: Register new HDD patient (self-registration)
      if (action === "register") {
        const { dni, fullName, email, username, phone } = body;

        if (!dni || !fullName || !email) {
          return new Response(JSON.stringify({
            error: "DNI, nombre completo y email son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate DNI format (8-digit number)
        if (!/^\d{7,8}$/.test(dni.replace(/\./g, ''))) {
          return new Response(JSON.stringify({
            error: "DNI inválido. Debe ser un número de 7 u 8 dígitos."
          }), { status: 400, headers: corsHeaders });
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return new Response(JSON.stringify({
            error: "Formato de email inválido"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedDni = dni.replace(/\./g, '');

        // Check if DNI already exists
        const [existing] = await sql`
          SELECT id, email_verified, status FROM hdd_patients WHERE dni = ${normalizedDni}
        `;

        if (existing) {
          if (existing.email_verified && existing.status === 'active') {
            return new Response(JSON.stringify({
              error: "Ya existe una cuenta con ese DNI. Inicie sesión."
            }), { status: 400, headers: corsHeaders });
          } else if (!existing.email_verified) {
            // Re-send verification code
            const verificationCode = generateVerificationCode();
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

            await sql`
              UPDATE hdd_patients
              SET verification_code = ${verificationCode},
                  verification_expires = ${expiresAt.toISOString()},
                  email = ${email},
                  full_name = ${fullName}
              WHERE id = ${existing.id}
            `;

            // Send verification email (async)
            fetch(`${new URL(req.url).origin}/api/notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'send_hdd_verification_email',
                email,
                code: verificationCode,
                fullName
              })
            }).catch(e => console.log('Email notification failed:', e));

            return new Response(JSON.stringify({
              success: true,
              requiresVerification: true,
              patientId: existing.id,
              message: "Se ha enviado un nuevo código de verificación a tu email"
            }), { status: 200, headers: corsHeaders });
          }
        }

        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        const [patient] = await sql`
          INSERT INTO hdd_patients (
            dni, full_name, email, phone, username,
            status, email_verified, verification_code, verification_expires,
            admission_date, created_at
          )
          VALUES (
            ${normalizedDni}, ${fullName}, ${email},
            ${phone || null}, ${username || null},
            'pending', FALSE, ${verificationCode}, ${verificationExpires.toISOString()},
            CURRENT_DATE, NOW()
          )
          RETURNING id, dni, full_name, email
        `;

        // Send verification email (async)
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_hdd_verification_email',
            email,
            code: verificationCode,
            fullName
          })
        }).catch(e => console.log('Email notification failed:', e));

        return new Response(JSON.stringify({
          success: true,
          requiresVerification: true,
          patientId: patient.id,
          message: "Se ha enviado un código de verificación a tu email. Verificá tu bandeja de entrada."
        }), { status: 201, headers: corsHeaders });
      }

      // Step 2: Verify email with code
      if (action === "verify_email") {
        const { dni, code, password } = body;

        if (!dni || !code || !password) {
          return new Response(JSON.stringify({
            error: "DNI, código de verificación y contraseña son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedDni = dni.replace(/\./g, '');

        const [patient] = await sql`
          SELECT id, verification_code, verification_expires, email_verified
          FROM hdd_patients
          WHERE dni = ${normalizedDni}
        `;

        if (!patient) {
          return new Response(JSON.stringify({
            error: "DNI no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        if (patient.email_verified) {
          return new Response(JSON.stringify({
            error: "El email ya está verificado. Inicie sesión."
          }), { status: 400, headers: corsHeaders });
        }

        if (patient.verification_code !== code) {
          return new Response(JSON.stringify({
            error: "Código de verificación incorrecto"
          }), { status: 400, headers: corsHeaders });
        }

        if (new Date(patient.verification_expires) < new Date()) {
          return new Response(JSON.stringify({
            error: "El código de verificación ha expirado. Solicitá uno nuevo."
          }), { status: 400, headers: corsHeaders });
        }

        const passwordHash = await hashPassword(password);
        const sessionToken = generateSessionToken();

        await sql`
          UPDATE hdd_patients
          SET email_verified = TRUE,
              status = 'active',
              password_hash = ${passwordHash},
              verification_code = NULL,
              verification_expires = NULL,
              session_token = ${sessionToken},
              last_login = NOW()
          WHERE id = ${patient.id}
        `;

        // Track login
        await sql`
          INSERT INTO hdd_login_tracking (patient_id, login_at, user_agent)
          VALUES (${patient.id}, NOW(), ${req.headers.get('user-agent') || null})
        `.catch(e => console.log('Login tracking failed:', e));

        // Get patient data
        const [updatedPatient] = await sql`
          SELECT id, dni, full_name, email, phone, photo_url
          FROM hdd_patients WHERE id = ${patient.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          patient: {
            id: updatedPatient.id,
            dni: updatedPatient.dni,
            fullName: updatedPatient.full_name,
            email: updatedPatient.email,
            photoUrl: updatedPatient.photo_url
          },
          sessionToken,
          message: "Email verificado exitosamente. Ya podés acceder al portal."
        }), { status: 200, headers: corsHeaders });
      }

      // Resend verification code
      if (action === "resend_verification") {
        const { dni, email } = body;

        if (!dni) {
          return new Response(JSON.stringify({
            error: "DNI es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedDni = dni.replace(/\./g, '');

        const [patient] = await sql`
          SELECT id, email, full_name, email_verified
          FROM hdd_patients WHERE dni = ${normalizedDni}
        `;

        if (!patient) {
          return new Response(JSON.stringify({
            error: "DNI no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        if (patient.email_verified) {
          return new Response(JSON.stringify({
            error: "El email ya está verificado. Inicie sesión."
          }), { status: 400, headers: corsHeaders });
        }

        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        await sql`
          UPDATE hdd_patients
          SET verification_code = ${verificationCode},
              verification_expires = ${expiresAt.toISOString()},
              email = COALESCE(${email || null}, email)
          WHERE id = ${patient.id}
        `;

        // Send verification email
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_hdd_verification_email',
            email: email || patient.email,
            code: verificationCode,
            fullName: patient.full_name
          })
        }).catch(e => console.log('Email notification failed:', e));

        return new Response(JSON.stringify({
          success: true,
          message: "Se ha enviado un nuevo código de verificación a tu email"
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Return more details in development to help debug
      return new Response(JSON.stringify({
        error: "Error interno del servidor",
        details: errorMessage
      }), { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const action = url.searchParams.get("action");

    // Verify session
    if (action === "verify" && sessionToken) {
      try {
        const [patient] = await sql`
          SELECT id, dni, full_name, email, phone, photo_url, status
          FROM hdd_patients
          WHERE session_token = ${sessionToken} AND status = 'active'
        `;

        if (!patient) {
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión inválida o expirada"
          }), { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          valid: true,
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            phone: patient.phone,
            photoUrl: patient.photo_url
          }
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Session verification error:", error);
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
  path: "/api/hdd/auth"
};
