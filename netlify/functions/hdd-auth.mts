import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Los pacientes autorizados ahora están directamente en la base de datos (tabla hdd_patients)
// Ya no se necesita una lista hardcodeada de DNIs - los admins pueden agregar pacientes
// directamente a través del panel de administración o la migración inicial

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
      // REGISTRO SIMPLIFICADO - PACIENTES EN BASE DE DATOS
      // ===========================================
      // El registro solo está disponible para pacientes que ya están en la base de datos.
      // Los pacientes son pre-cargados por la migración o agregados por administradores.

      // Registro directo - solo para DNIs que ya existen en la base de datos
      if (action === "register") {
        const { dni, fullName, email, password } = body;

        if (!dni || !fullName || !email || !password) {
          return new Response(JSON.stringify({
            error: "DNI, nombre completo, email y contraseña son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Validate DNI format (7-8 digit number)
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

        // Validate password length
        if (password.length < 6) {
          return new Response(JSON.stringify({
            error: "La contraseña debe tener al menos 6 caracteres"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedDni = dni.replace(/\./g, '');

        // Verificar si el DNI existe en la base de datos (pre-cargado por migración o admin)
        const [existing] = await sql`
          SELECT id, email_verified, status, password_hash, full_name FROM hdd_patients WHERE dni = ${normalizedDni}
        `;

        if (!existing) {
          return new Response(JSON.stringify({
            error: "Tu DNI no está registrado en Hospital de Día. Contactá con la clínica para más información."
          }), { status: 403, headers: corsHeaders });
        }

        if (existing.password_hash && existing.status === 'active') {
          return new Response(JSON.stringify({
            error: "Ya existe una cuenta con ese DNI. Iniciá sesión."
          }), { status: 400, headers: corsHeaders });
        }

        if (existing.status !== 'active') {
          return new Response(JSON.stringify({
            error: "Tu cuenta no está activa. Contactá con la clínica para más información."
          }), { status: 403, headers: corsHeaders });
        }

        // Cuenta existente sin contraseña - actualizar datos y activar
        const passwordHash = await hashPassword(password);
        const sessionToken = generateSessionToken();

        await sql`
          UPDATE hdd_patients
          SET full_name = ${fullName},
              email = ${email},
              password_hash = ${passwordHash},
              email_verified = TRUE,
              session_token = ${sessionToken},
              last_login = NOW(),
              updated_at = NOW()
          WHERE id = ${existing.id}
        `;

        // Track login
        await sql`
          INSERT INTO hdd_login_tracking (patient_id, login_at, user_agent)
          VALUES (${existing.id}, NOW(), ${req.headers.get('user-agent') || null})
        `.catch(e => console.log('Login tracking failed:', e));

        const [updatedPatient] = await sql`
          SELECT id, dni, full_name, email, phone, photo_url
          FROM hdd_patients WHERE id = ${existing.id}
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
          message: "Registro exitoso. Bienvenido/a al Hospital de Día."
        }), { status: 200, headers: corsHeaders });
      }

      // Verificar si un DNI está en la base de datos (para el frontend)
      if (action === "check_dni") {
        const { dni } = body;

        if (!dni) {
          return new Response(JSON.stringify({
            error: "DNI es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedDni = dni.replace(/\./g, '');

        // Buscar en la base de datos en lugar de lista hardcodeada
        const [patient] = await sql`
          SELECT id, status FROM hdd_patients WHERE dni = ${normalizedDni}
        `;

        const isAuthorized = patient && patient.status === 'active';

        return new Response(JSON.stringify({
          authorized: isAuthorized,
          message: isAuthorized
            ? "DNI autorizado. Podés completar tu registro."
            : "Tu DNI no está en la lista de pacientes autorizados para Hospital de Día."
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
