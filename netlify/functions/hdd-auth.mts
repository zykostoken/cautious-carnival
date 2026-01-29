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

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Auth error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
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
