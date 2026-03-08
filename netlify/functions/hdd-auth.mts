import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { hashPassword, verifyPassword, generateSessionToken, generateVerificationCode, CORS_HEADERS, corsResponse, jsonResponse, errorResponse, getCorsHeaders, checkRateLimit, isSessionExpired, escapeHtml } from "./lib/auth.mts";

// Fetch patient plan info for login responses
async function getPatientPlanInfo(sql: ReturnType<typeof import("postgres")>, patientId: number) {
  try {
    const [plan] = await sql`
      SELECT pp.plan_type, pp.status as plan_status,
             sp.name as plan_name, sp.code as plan_code,
             os.name as obra_social_name, os.code as obra_social_code,
             pp.obra_social_member_number
      FROM patient_plans pp
      JOIN service_plans sp ON sp.id = pp.plan_id
      LEFT JOIN obras_sociales os ON os.id = pp.obra_social_id
      WHERE pp.patient_id = ${patientId} AND pp.status = 'active'
      ORDER BY pp.created_at DESC LIMIT 1
    `;
    if (!plan) return null;

    const entitlements = await sql`
      SELECT pe.service_type, pe.max_per_month, pe.max_per_week, pe.is_included, pe.requires_prescription
      FROM plan_entitlements pe
      JOIN service_plans sp ON sp.id = pe.plan_id
      WHERE sp.code = ${plan.plan_code}
    `;

    return {
      planType: plan.plan_type,
      planName: plan.plan_name,
      planCode: plan.plan_code,
      obraSocial: plan.obra_social_name || null,
      obraSocialCode: plan.obra_social_code || null,
      memberNumber: plan.obra_social_member_number || null,
      services: entitlements.map((e: any) => ({
        type: e.service_type,
        included: e.is_included,
        maxPerMonth: e.max_per_month,
        maxPerWeek: e.max_per_week,
        requiresPrescription: e.requires_prescription,
      })),
    };
  } catch (e) {
    // Tables might not exist yet (pre-migration)
    return null;
  }
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

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

        // Rate limit login attempts by DNI (H-006)
        if (!checkRateLimit(`login:${dni}`, 5, 15 * 60 * 1000)) {
          return new Response(JSON.stringify({
            error: "Demasiados intentos. Intente nuevamente en 15 minutos."
          }), { status: 429, headers: corsHeaders });
        }

        const [patient] = await sql`
          SELECT id, dni, full_name, email, phone, password_hash, status, photo_url
          FROM hdd_patients
          WHERE dni = ${dni}
        `;

        // Unified error message to prevent account enumeration (H-008)
        if (!patient) {
          return new Response(JSON.stringify({
            error: "Credenciales inválidas"
          }), { status: 401, headers: corsHeaders });
        }

        if (patient.status !== 'active') {
          return new Response(JSON.stringify({
            error: "Credenciales inválidas"
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

          const planInfo = await getPatientPlanInfo(sql, patient.id);

          return new Response(JSON.stringify({
            success: true,
            firstLogin: true,
            patient: {
              id: patient.id,
              dni: patient.dni,
              fullName: patient.full_name,
              email: patient.email,
              photoUrl: patient.photo_url,
              patientType: patient.patient_type || 'obra_social'
            },
            planInfo,
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

        const planInfo = await getPatientPlanInfo(sql, patient.id);

        return new Response(JSON.stringify({
          success: true,
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            photoUrl: patient.photo_url,
            patientType: patient.patient_type || 'obra_social'
          },
          planInfo,
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
        // Use subquery since PostgreSQL UPDATE does not support ORDER BY/LIMIT
        await sql`
          UPDATE hdd_login_tracking
          SET activities_completed = activities_completed + 1
          WHERE id = (
            SELECT id FROM hdd_login_tracking
            WHERE patient_id = ${patient.id} AND logout_at IS NULL
            ORDER BY login_at DESC
            LIMIT 1
          )
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
      return new Response(JSON.stringify({
        error: "Error interno del servidor"
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
          SELECT id, dni, full_name, email, phone, photo_url, status, patient_type, last_login
          FROM hdd_patients
          WHERE session_token = ${sessionToken} AND status = 'active'
        `;

        if (!patient) {
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión inválida o expirada"
          }), { status: 401, headers: corsHeaders });
        }

        // Check session expiry (H-005: 24h TTL)
        if (isSessionExpired(patient.last_login)) {
          // Invalidate expired token
          await sql`UPDATE hdd_patients SET session_token = NULL WHERE id = ${patient.id}`;
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesión expirada. Inicie sesión nuevamente."
          }), { status: 401, headers: corsHeaders });
        }

        const planInfo = await getPatientPlanInfo(sql, patient.id);

        return new Response(JSON.stringify({
          valid: true,
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            phone: patient.phone,
            photoUrl: patient.photo_url,
            patientType: patient.patient_type || 'obra_social'
          },
          planInfo
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
