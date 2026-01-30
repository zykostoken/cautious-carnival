import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Role-based admin system
// SUPER_ADMIN: Full control - can modify settings, payments, configurations
// LIMITED_ADMIN: Can view, list, authorize patients, but cannot modify system settings

// Super Admin - Only direccionmedica has full control
const SUPER_ADMIN_EMAILS = [
  'direccionmedica@clinicajoseingenieros.ar'
];

// Limited Admin - Can login, view data, authorize patients, but restricted actions
const LIMITED_ADMIN_EMAILS = [
  'gerencia@clinicajoseingenieros.ar',
  'rrhh@clinicajoseingenieros.ar'
];

// All admin emails (combined for authentication)
const ALL_ADMIN_EMAILS = [...SUPER_ADMIN_EMAILS, ...LIMITED_ADMIN_EMAILS];

// Admin role type
type AdminRole = 'super_admin' | 'limited_admin' | null;

// Helper to get admin role from session
async function getAdminRole(sql: any, sessionToken: string): Promise<{ role: AdminRole; email: string | null }> {
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
async function isAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const { role } = await getAdminRole(sql, sessionToken);
  return role !== null;
}

// Helper to check if session belongs to super admin (for sensitive operations)
async function isSuperAdminSession(sql: any, sessionToken: string): Promise<boolean> {
  const { role } = await getAdminRole(sql, sessionToken);
  return role === 'super_admin';
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action, sessionToken } = body;

      // Verify admin session for all operations
      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "Token requerido" }),
          { status: 400, headers: corsHeaders });
      }

      if (!(await isAdminSession(sql, sessionToken))) {
        return new Response(JSON.stringify({ error: "No autorizado" }),
          { status: 403, headers: corsHeaders });
      }

      // Define actions that require SUPER_ADMIN role
      // These are sensitive security operations that only direccionmedica can perform
      const superAdminOnlyActions = [
        'reset_password',        // Seguridad - resetear contraseña
        'bulk_import'            // Importación masiva (cambio de sistema)
      ];

      // Note: discharge_patient and readmit_patient are now available to all admins
      // These are administrative/transcription tasks that any admin can perform

      if (superAdminOnlyActions.includes(action)) {
        if (!(await isSuperAdminSession(sql, sessionToken))) {
          return new Response(JSON.stringify({
            error: "Acción restringida. Solo Dirección Médica puede realizar esta operación."
          }), { status: 403, headers: corsHeaders });
        }
      }

      // Add new HDD patient
      if (action === "add_patient") {
        const { dni, fullName, email, phone, admissionDate, notes } = body;

        if (!dni || !fullName || !admissionDate) {
          return new Response(JSON.stringify({
            error: "DNI, nombre completo y fecha de ingreso son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Check if DNI already exists
        const [existing] = await sql`
          SELECT id FROM hdd_patients WHERE dni = ${dni}
        `;

        if (existing) {
          return new Response(JSON.stringify({
            error: "Ya existe un paciente con ese DNI"
          }), { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          INSERT INTO hdd_patients (
            dni, full_name, email, phone, admission_date, notes, status, created_at
          )
          VALUES (
            ${dni}, ${fullName}, ${email || null}, ${phone || null},
            ${admissionDate}, ${notes || null}, 'active', NOW()
          )
          RETURNING id, dni, full_name, email, admission_date, status
        `;

        return new Response(JSON.stringify({
          success: true,
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            admissionDate: patient.admission_date,
            status: patient.status
          },
          message: "Paciente agregado exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Update patient
      if (action === "update_patient") {
        const { patientId, fullName, email, phone, notes, status } = body;

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          UPDATE hdd_patients
          SET
            full_name = COALESCE(${fullName}, full_name),
            email = COALESCE(${email}, email),
            phone = COALESCE(${phone}, phone),
            notes = COALESCE(${notes}, notes),
            status = COALESCE(${status}, status),
            updated_at = NOW()
          WHERE id = ${patientId}
          RETURNING id, dni, full_name, email, status
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          patient,
          message: "Paciente actualizado"
        }), { status: 200, headers: corsHeaders });
      }

      // Discharge patient (set discharge date and inactive status)
      if (action === "discharge_patient") {
        const { patientId, dischargeDate } = body;

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          UPDATE hdd_patients
          SET
            status = 'discharged',
            discharge_date = ${dischargeDate || sql`CURRENT_DATE`},
            session_token = NULL,
            updated_at = NOW()
          WHERE id = ${patientId}
          RETURNING id, dni, full_name, discharge_date, status
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          patient,
          message: "Paciente dado de alta"
        }), { status: 200, headers: corsHeaders });
      }

      // Readmit patient
      if (action === "readmit_patient") {
        const { patientId, admissionDate } = body;

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          UPDATE hdd_patients
          SET
            status = 'active',
            admission_date = ${admissionDate || sql`CURRENT_DATE`},
            discharge_date = NULL,
            updated_at = NOW()
          WHERE id = ${patientId}
          RETURNING id, dni, full_name, admission_date, status
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          patient,
          message: "Paciente readmitido"
        }), { status: 200, headers: corsHeaders });
      }

      // Reset patient password (allows re-setup on next login)
      if (action === "reset_password") {
        const { patientId } = body;

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          UPDATE hdd_patients
          SET
            password_hash = NULL,
            session_token = NULL,
            updated_at = NOW()
          WHERE id = ${patientId}
          RETURNING id, dni, full_name
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Contraseña reseteada. El paciente puede configurar una nueva contraseña en su próximo inicio de sesión."
        }), { status: 200, headers: corsHeaders });
      }

      // Bulk import patients (for initial setup or sync from external system)
      if (action === "bulk_import") {
        const { patients } = body;

        if (!patients || !Array.isArray(patients) || patients.length === 0) {
          return new Response(JSON.stringify({
            error: "Lista de pacientes requerida"
          }), { status: 400, headers: corsHeaders });
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const p of patients) {
          if (!p.dni || !p.fullName) {
            errors.push(`Paciente sin DNI o nombre: ${JSON.stringify(p)}`);
            skipped++;
            continue;
          }

          try {
            await sql`
              INSERT INTO hdd_patients (
                dni, full_name, email, phone, admission_date, notes, status, created_at
              )
              VALUES (
                ${p.dni}, ${p.fullName}, ${p.email || null}, ${p.phone || null},
                ${p.admissionDate || sql`CURRENT_DATE`}, ${p.notes || null}, 'active', NOW()
              )
              ON CONFLICT (dni) DO UPDATE SET
                full_name = ${p.fullName},
                email = COALESCE(${p.email || null}, hdd_patients.email),
                phone = COALESCE(${p.phone || null}, hdd_patients.phone),
                updated_at = NOW()
            `;
            imported++;
          } catch (err: any) {
            errors.push(`Error con DNI ${p.dni}: ${err.message}`);
            skipped++;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          imported,
          skipped,
          errors: errors.length > 0 ? errors : undefined,
          message: `${imported} pacientes importados, ${skipped} omitidos`
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Admin error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const action = url.searchParams.get("action");
    const status = url.searchParams.get("status") || "active";

    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "Token requerido" }),
        { status: 400, headers: corsHeaders });
    }

    if (!(await isAdminSession(sql, sessionToken))) {
      return new Response(JSON.stringify({ error: "No autorizado" }),
        { status: 403, headers: corsHeaders });
    }

    // Get current admin role info
    const { role, email } = await getAdminRole(sql, sessionToken);

    try {
      // Get current admin's role and permissions
      if (action === "my_role") {
        return new Response(JSON.stringify({
          role,
          email,
          isSuperAdmin: role === 'super_admin',
          permissions: {
            canViewPatients: true,
            canAddPatients: true,
            canUpdatePatients: true,
            canDischargePatients: true,  // All admins can discharge (administrative task)
            canReadmitPatients: true,     // All admins can readmit (administrative task)
            canResetPasswords: role === 'super_admin',
            canBulkImport: role === 'super_admin'
          }
        }), { status: 200, headers: corsHeaders });
      }

      // List all patients
      if (action === "list" || !action) {
        let patients;

        if (status === "all") {
          patients = await sql`
            SELECT
              id, dni, full_name, email, phone, admission_date, discharge_date,
              status, notes, created_at, last_login,
              (password_hash IS NOT NULL) as has_password
            FROM hdd_patients
            ORDER BY status ASC, full_name ASC
          `;
        } else {
          patients = await sql`
            SELECT
              id, dni, full_name, email, phone, admission_date, discharge_date,
              status, notes, created_at, last_login,
              (password_hash IS NOT NULL) as has_password
            FROM hdd_patients
            WHERE status = ${status}
            ORDER BY full_name ASC
          `;
        }

        return new Response(JSON.stringify({
          patients: patients.map((p: any) => ({
            id: p.id,
            dni: p.dni,
            fullName: p.full_name,
            email: p.email,
            phone: p.phone,
            admissionDate: p.admission_date,
            dischargeDate: p.discharge_date,
            status: p.status,
            notes: p.notes,
            hasPassword: p.has_password,
            hasLoggedIn: !!p.last_login,
            lastLogin: p.last_login,
            createdAt: p.created_at
          }))
        }), { status: 200, headers: corsHeaders });
      }

      // Get single patient details
      if (action === "detail") {
        const patientId = url.searchParams.get("patientId");

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [patient] = await sql`
          SELECT
            id, dni, full_name, email, phone, admission_date, discharge_date,
            status, notes, created_at, last_login,
            (password_hash IS NOT NULL) as has_password
          FROM hdd_patients
          WHERE id = ${patientId}
        `;

        if (!patient) {
          return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        // Get patient's posts count
        const [postsCount] = await sql`
          SELECT COUNT(*) as count FROM hdd_community_posts WHERE patient_id = ${patientId}
        `;

        return new Response(JSON.stringify({
          patient: {
            id: patient.id,
            dni: patient.dni,
            fullName: patient.full_name,
            email: patient.email,
            phone: patient.phone,
            admissionDate: patient.admission_date,
            dischargeDate: patient.discharge_date,
            status: patient.status,
            notes: patient.notes,
            hasPassword: patient.has_password,
            lastLogin: patient.last_login,
            createdAt: patient.created_at,
            postsCount: parseInt(postsCount.count)
          }
        }), { status: 200, headers: corsHeaders });
      }

      // Get activities
      if (action === "activities") {
        const activities = await sql`
          SELECT id, name, description, day_of_week, start_time, end_time, is_active
          FROM hdd_activities
          ORDER BY day_of_week ASC, start_time ASC
        `;

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        return new Response(JSON.stringify({
          activities: activities.map((a: any) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            dayOfWeek: a.day_of_week,
            dayName: dayNames[a.day_of_week] || 'No definido',
            startTime: a.start_time,
            endTime: a.end_time,
            isActive: a.is_active
          }))
        }), { status: 200, headers: corsHeaders });
      }

      // Get statistics
      if (action === "stats") {
        const [activeCount] = await sql`
          SELECT COUNT(*) as count FROM hdd_patients WHERE status = 'active'
        `;
        const [dischargedCount] = await sql`
          SELECT COUNT(*) as count FROM hdd_patients WHERE status = 'discharged'
        `;
        const [postsCount] = await sql`
          SELECT COUNT(*) as count FROM hdd_community_posts
        `;
        const [loggedInCount] = await sql`
          SELECT COUNT(*) as count FROM hdd_patients
          WHERE status = 'active' AND last_login IS NOT NULL
        `;

        return new Response(JSON.stringify({
          stats: {
            activePatients: parseInt(activeCount.count),
            dischargedPatients: parseInt(dischargedCount.count),
            totalPosts: parseInt(postsCount.count),
            patientsLoggedIn: parseInt(loggedInCount.count)
          }
        }), { status: 200, headers: corsHeaders });
      }

      // Get game statistics for professionals
      if (action === "game_stats") {
        const gameSlug = url.searchParams.get("game");

        try {
          // Get game info
          const [game] = await sql`
            SELECT id, name FROM hdd_games WHERE slug = ${gameSlug}
          `;

          if (!game) {
            return new Response(JSON.stringify({
              stats: null,
              message: "Juego no encontrado"
            }), { status: 200, headers: corsHeaders });
          }

          // Get aggregate stats
          const [sessionStats] = await sql`
            SELECT
              COUNT(DISTINCT patient_id) as total_players,
              COUNT(*) as total_sessions,
              COALESCE(AVG(score), 0) as avg_score,
              COALESCE(MAX(score), 0) as max_score
            FROM hdd_game_sessions
            WHERE game_id = ${game.id}
          `;

          // Get top players
          const topPlayers = await sql`
            SELECT
              p.full_name,
              gp.best_score,
              gp.max_level_reached as max_level,
              gp.total_sessions
            FROM hdd_game_progress gp
            JOIN hdd_patients p ON p.id = gp.patient_id
            WHERE gp.game_id = ${game.id}
            ORDER BY gp.best_score DESC
            LIMIT 10
          `;

          return new Response(JSON.stringify({
            stats: {
              totalPlayers: parseInt(sessionStats.total_players) || 0,
              totalSessions: parseInt(sessionStats.total_sessions) || 0,
              avgScore: Math.round(parseFloat(sessionStats.avg_score) || 0),
              maxScore: parseInt(sessionStats.max_score) || 0
            },
            topPlayers: topPlayers.map((p: any) => ({
              fullName: p.full_name,
              bestScore: p.best_score,
              maxLevel: p.max_level,
              totalSessions: p.total_sessions
            }))
          }), { status: 200, headers: corsHeaders });
        } catch (err) {
          // Tables might not exist yet
          return new Response(JSON.stringify({
            stats: { totalPlayers: 0, totalSessions: 0, avgScore: 0, maxScore: 0 },
            topPlayers: []
          }), { status: 200, headers: corsHeaders });
        }
      }

      // Get patient metrics
      if (action === "patient_metrics") {
        const patientId = url.searchParams.get("patientId");

        if (!patientId) {
          return new Response(JSON.stringify({ error: "ID de paciente requerido" }),
            { status: 400, headers: corsHeaders });
        }

        try {
          // Get patient basic info
          const [patient] = await sql`
            SELECT id, full_name, last_login FROM hdd_patients WHERE id = ${patientId}
          `;

          if (!patient) {
            return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
              { status: 404, headers: corsHeaders });
          }

          // Get posts count
          const [postsCount] = await sql`
            SELECT COUNT(*) as count FROM hdd_community_posts WHERE patient_id = ${patientId}
          `;

          // Get game sessions count and total time
          let gameSessions = 0;
          let totalGameTime = 0;
          try {
            const [gameStats] = await sql`
              SELECT
                COUNT(*) as sessions,
                COALESCE(SUM(duration_seconds), 0) as total_time
              FROM hdd_game_sessions
              WHERE patient_id = ${patientId}
            `;
            gameSessions = parseInt(gameStats.sessions) || 0;
            totalGameTime = parseInt(gameStats.total_time) || 0;
          } catch (e) {
            // Table might not exist
          }

          // Get games progress
          let gamesProgress: any[] = [];
          try {
            gamesProgress = await sql`
              SELECT
                g.name as game_name,
                gp.current_level,
                gp.max_level_reached as max_level,
                gp.best_score,
                gp.total_sessions,
                gp.last_played_at as last_played
              FROM hdd_game_progress gp
              JOIN hdd_games g ON g.id = gp.game_id
              WHERE gp.patient_id = ${patientId}
              ORDER BY gp.last_played_at DESC
            `;
          } catch (e) {
            // Table might not exist
          }

          // Get recent activity (posts and game sessions)
          let recentActivity: any[] = [];
          try {
            const recentPosts = await sql`
              SELECT 'Publicacion' as type, created_at as date, content as details
              FROM hdd_community_posts
              WHERE patient_id = ${patientId}
              ORDER BY created_at DESC
              LIMIT 5
            `;
            recentActivity = recentPosts.map((p: any) => ({
              type: p.type,
              date: p.date,
              details: (p.details || '').substring(0, 50) + '...'
            }));
          } catch (e) {
            // Table might not exist
          }

          // Count logins from tracking
          let loginCount = 0;
          try {
            const [tracking] = await sql`
              SELECT login_count FROM hdd_login_tracking WHERE patient_id = ${patientId}
            `;
            loginCount = tracking?.login_count || 0;
          } catch (e) {
            // Table might not exist, estimate from last_login
            loginCount = patient.last_login ? 1 : 0;
          }

          return new Response(JSON.stringify({
            metrics: {
              loginCount,
              gameSessions,
              postsCount: parseInt(postsCount.count) || 0,
              totalGameTime
            },
            gamesProgress: gamesProgress.map((g: any) => ({
              gameName: g.game_name,
              currentLevel: g.current_level,
              maxLevel: g.max_level,
              bestScore: g.best_score,
              totalSessions: g.total_sessions,
              lastPlayed: g.last_played
            })),
            recentActivity
          }), { status: 200, headers: corsHeaders });

        } catch (err) {
          console.error("Patient metrics error:", err);
          return new Response(JSON.stringify({
            metrics: { loginCount: 0, gameSessions: 0, postsCount: 0, totalGameTime: 0 },
            gamesProgress: [],
            recentActivity: []
          }), { status: 200, headers: corsHeaders });
        }
      }

      return new Response(JSON.stringify({ error: "Acción requerida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Admin GET error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/hdd/admin"
};
