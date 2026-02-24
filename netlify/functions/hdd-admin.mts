import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { CORS_HEADERS } from "./lib/auth.mts";
import { getAdminRole, isAdminSession, isSuperAdminSession, type AdminRole, SUPER_ADMIN_EMAILS, LIMITED_ADMIN_EMAILS, ALL_ADMIN_EMAILS } from "./lib/admin-roles.mts";

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

      // =====================================
      // ACTIVITY MANAGEMENT
      // =====================================

      // Add activity
      if (action === "add_activity") {
        const { name, description, dayOfWeek, startTime, endTime, icon, location, professional, maxCapacity } = body;

        if (!name) {
          return new Response(JSON.stringify({ error: "Nombre de actividad requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [activity] = await sql`
          INSERT INTO hdd_activities (
            name, description, day_of_week, start_time, end_time,
            icon, location, professional, max_capacity, is_active, created_at, updated_at
          )
          VALUES (
            ${name}, ${description || null}, ${dayOfWeek != null ? dayOfWeek : null},
            ${startTime || null}, ${endTime || null},
            ${icon || null}, ${location || null}, ${professional || null},
            ${maxCapacity || null}, TRUE, NOW(), NOW()
          )
          RETURNING id, name
        `;

        return new Response(JSON.stringify({
          success: true,
          activity: { id: activity.id, name: activity.name },
          message: "Actividad creada exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Update activity
      if (action === "update_activity") {
        const { activityId, name, description, dayOfWeek, startTime, endTime, icon, location, professional, maxCapacity, isActive } = body;

        if (!activityId) {
          return new Response(JSON.stringify({ error: "ID de actividad requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [activity] = await sql`
          UPDATE hdd_activities
          SET
            name = COALESCE(${name || null}, name),
            description = COALESCE(${description || null}, description),
            day_of_week = COALESCE(${dayOfWeek != null ? dayOfWeek : null}, day_of_week),
            start_time = COALESCE(${startTime || null}, start_time),
            end_time = COALESCE(${endTime || null}, end_time),
            icon = COALESCE(${icon || null}, icon),
            location = COALESCE(${location || null}, location),
            professional = COALESCE(${professional || null}, professional),
            max_capacity = COALESCE(${maxCapacity || null}, max_capacity),
            is_active = COALESCE(${isActive != null ? isActive : null}, is_active),
            updated_at = NOW()
          WHERE id = ${activityId}
          RETURNING id, name
        `;

        if (!activity) {
          return new Response(JSON.stringify({ error: "Actividad no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          activity,
          message: "Actividad actualizada"
        }), { status: 200, headers: corsHeaders });
      }

      // Delete activity
      if (action === "delete_activity") {
        const { activityId } = body;

        if (!activityId) {
          return new Response(JSON.stringify({ error: "ID de actividad requerido" }),
            { status: 400, headers: corsHeaders });
        }

        await sql`DELETE FROM hdd_activities WHERE id = ${activityId}`;

        return new Response(JSON.stringify({
          success: true,
          message: "Actividad eliminada"
        }), { status: 200, headers: corsHeaders });
      }

      // =====================================
      // RESOURCE MANAGEMENT
      // =====================================

      // Add resource
      if (action === "add_resource") {
        const { title, description, resourceType, url: resourceUrl, duration, icon, category } = body;

        if (!title || !resourceUrl) {
          return new Response(JSON.stringify({ error: "Titulo y URL son requeridos" }),
            { status: 400, headers: corsHeaders });
        }

        const [resource] = await sql`
          INSERT INTO hdd_resources (
            title, description, resource_type, url, duration, icon, category,
            is_active, created_by, created_at, updated_at
          )
          VALUES (
            ${title}, ${description || null}, ${resourceType || 'link'},
            ${resourceUrl}, ${duration || null}, ${icon || null},
            ${category || null}, TRUE, ${email}, NOW(), NOW()
          )
          RETURNING id, title
        `;

        return new Response(JSON.stringify({
          success: true,
          resource: { id: resource.id, title: resource.title },
          message: "Recurso agregado exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Update resource
      if (action === "update_resource") {
        const { resourceId, title, description, resourceType, url: resourceUrl, duration, icon, category, isActive } = body;

        if (!resourceId) {
          return new Response(JSON.stringify({ error: "ID de recurso requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [resource] = await sql`
          UPDATE hdd_resources
          SET
            title = COALESCE(${title || null}, title),
            description = COALESCE(${description || null}, description),
            resource_type = COALESCE(${resourceType || null}, resource_type),
            url = COALESCE(${resourceUrl || null}, url),
            duration = COALESCE(${duration || null}, duration),
            icon = COALESCE(${icon || null}, icon),
            category = COALESCE(${category || null}, category),
            is_active = COALESCE(${isActive != null ? isActive : null}, is_active),
            updated_at = NOW()
          WHERE id = ${resourceId}
          RETURNING id, title
        `;

        if (!resource) {
          return new Response(JSON.stringify({ error: "Recurso no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          resource,
          message: "Recurso actualizado"
        }), { status: 200, headers: corsHeaders });
      }

      // Delete resource
      if (action === "delete_resource") {
        const { resourceId } = body;

        if (!resourceId) {
          return new Response(JSON.stringify({ error: "ID de recurso requerido" }),
            { status: 400, headers: corsHeaders });
        }

        await sql`DELETE FROM hdd_resources WHERE id = ${resourceId}`;

        return new Response(JSON.stringify({
          success: true,
          message: "Recurso eliminado"
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

    // Public endpoints (no auth required) - read-only active data
    if (action === "public_activities") {
      try {
        const activities = await sql`
          SELECT id, name, description, day_of_week, start_time, end_time,
                 icon, location, professional
          FROM hdd_activities
          WHERE is_active = TRUE
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
            icon: a.icon,
            location: a.location,
            professional: a.professional
          }))
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ activities: [] }), { status: 200, headers: corsHeaders });
      }
    }

    if (action === "public_resources") {
      try {
        const resources = await sql`
          SELECT id, title, description, resource_type, url, duration, icon, category
          FROM hdd_resources
          WHERE is_active = TRUE
          ORDER BY sort_order ASC, created_at DESC
        `;
        return new Response(JSON.stringify({
          resources: resources.map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            resourceType: r.resource_type,
            url: r.url,
            duration: r.duration,
            icon: r.icon,
            category: r.category
          }))
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ resources: [] }), { status: 200, headers: corsHeaders });
      }
    }

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
          SELECT id, name, description, day_of_week, start_time, end_time, is_active,
                 icon, location, professional, max_capacity
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
            isActive: a.is_active,
            icon: a.icon,
            location: a.location,
            professional: a.professional,
            maxCapacity: a.max_capacity
          }))
        }), { status: 200, headers: corsHeaders });
      }

      // Get resources
      if (action === "resources") {
        const resources = await sql`
          SELECT id, title, description, resource_type, url, duration, icon,
                 category, is_active, sort_order, created_by, created_at
          FROM hdd_resources
          ORDER BY sort_order ASC, created_at DESC
        `;

        return new Response(JSON.stringify({
          resources: resources.map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            resourceType: r.resource_type,
            url: r.url,
            duration: r.duration,
            icon: r.icon,
            category: r.category,
            isActive: r.is_active,
            sortOrder: r.sort_order,
            createdBy: r.created_by,
            createdAt: r.created_at
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

          // Get mood check-in history (longitudinal)
          let moodHistory: any[] = [];
          try {
            moodHistory = await sql`
              SELECT mood_value, note, color_hex, color_intensity, context, created_at
              FROM hdd_mood_checkins
              WHERE patient_id = ${patientId}
              ORDER BY created_at ASC
            `;
          } catch (e) {
            // Table might not have color columns yet
            try {
              moodHistory = await sql`
                SELECT mood_value, note, created_at
                FROM hdd_mood_checkins
                WHERE patient_id = ${patientId}
                ORDER BY created_at ASC
              `;
            } catch (e2) { /* table may not exist */ }
          }

          // Get color selection history
          let colorHistory: any[] = [];
          try {
            colorHistory = await sql`
              SELECT color_hex, color_intensity, context, created_at
              FROM hdd_game_color_selections
              WHERE patient_id = ${patientId}
              ORDER BY created_at ASC
            `;
          } catch (e) {
            // Table might not exist yet
          }

          // Combine color data from mood checkins + game selections
          const allColors = [
            ...moodHistory.filter((m: any) => m.color_hex).map((m: any) => ({
              colorHex: m.color_hex,
              colorIntensity: m.color_intensity,
              context: m.context || 'daily_checkin',
              createdAt: m.created_at
            })),
            ...colorHistory.map((c: any) => ({
              colorHex: c.color_hex,
              colorIntensity: c.color_intensity,
              context: c.context,
              createdAt: c.created_at
            }))
          ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          // Get game session details for charts
          let gameSessionDetails: any[] = [];
          try {
            gameSessionDetails = await sql`
              SELECT gs.score, gs.duration_seconds, gs.level, gs.completed, gs.metrics, gs.started_at,
                     g.name as game_name, g.slug as game_slug
              FROM hdd_game_sessions gs
              LEFT JOIN hdd_games g ON g.id = gs.game_id
              WHERE gs.patient_id = ${patientId}
              ORDER BY gs.started_at ASC
            `;
          } catch (e) { /* table might not exist */ }

          // Get game metrics (biomarcadores) - raw rows
          let gameMetrics: any[] = [];
          try {
            gameMetrics = await sql`
              SELECT metric_type, metric_value, metric_data, game_slug, created_at
              FROM hdd_game_metrics
              WHERE patient_id = ${patientId}
              ORDER BY created_at DESC
              LIMIT 100
            `;
          } catch (e) { /* table might not exist */ }

          // Per-game longitudinal summary (baseline → latest, biometric trends)
          // Uses v_patient_game_summary which normalizes field names across all games
          let gameSummary: any[] = [];
          try {
            gameSummary = await sql`
              SELECT
                game_slug,
                total_sessions,
                first_session_at,
                last_session_at,
                avg_score,
                min_score,
                max_score,
                baseline_score,
                latest_score,
                score_progress,
                avg_rt_ms,
                avg_tremor,
                avg_commission_errors,
                avg_omission_errors,
                avg_hesitations,
                avg_movement_eff,
                avg_d_prime
              FROM v_patient_game_summary
              WHERE patient_id = ${patientId}
              ORDER BY last_session_at DESC
            `;
          } catch (e) { /* view may not exist yet — run migration 013 */ }

          // Cross-game clinical profile (global biometric averages + trend)
          let clinicalProfile: any = null;
          try {
            const [profile] = await sql`
              SELECT
                games_played,
                total_sessions,
                last_activity_at,
                overall_avg_score,
                best_score_ever,
                avg_rt_ms,
                avg_tremor,
                avg_commission_errors,
                avg_omission_errors,
                avg_hesitations,
                avg_movement_eff,
                avg_d_prime,
                global_score_trend,
                game_breakdown
              FROM v_patient_clinical_profile
              WHERE patient_id = ${patientId}
            `;
            clinicalProfile = profile || null;
          } catch (e) { /* view may not exist yet — run migration 013 */ }

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
          } catch (e) { /* table might not exist */ }

          // Get interaction log
          let interactions: any[] = [];
          try {
            interactions = await sql`
              SELECT interaction_type, details, created_at
              FROM hdd_interaction_log
              WHERE patient_id = ${patientId}
              ORDER BY created_at DESC
              LIMIT 50
            `;
          } catch (e) { /* table might not exist */ }

          // Get recent activity (posts and game sessions combined)
          let recentActivity: any[] = [];
          try {
            const recentPosts = await sql`
              SELECT 'Publicacion' as type, created_at as date, content as details
              FROM hdd_community_posts
              WHERE patient_id = ${patientId}
              ORDER BY created_at DESC
              LIMIT 10
            `;
            recentActivity = recentPosts.map((p: any) => ({
              type: p.type,
              date: p.date,
              details: (p.details || '').substring(0, 80) + (p.details && p.details.length > 80 ? '...' : '')
            }));
          } catch (e) { /* table might not exist */ }

          // Add game sessions to recent activity
          try {
            const recentGameSessions = await sql`
              SELECT 'Juego' as type, gs.started_at as date,
                     COALESCE(g.name, 'Juego') || ' - Nivel ' || gs.level || ' - Score: ' || COALESCE(gs.score, 0) as details
              FROM hdd_game_sessions gs
              LEFT JOIN hdd_games g ON g.id = gs.game_id
              WHERE gs.patient_id = ${patientId}
              ORDER BY gs.started_at DESC
              LIMIT 10
            `;
            recentActivity = [...recentActivity, ...recentGameSessions.map((g: any) => ({
              type: g.type,
              date: g.date,
              details: g.details
            }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);
          } catch (e) { /* table might not exist */ }

          // Count logins
          let loginCount = 0;
          try {
            const [tracking] = await sql`
              SELECT login_count FROM hdd_login_tracking WHERE patient_id = ${patientId}
            `;
            loginCount = tracking?.login_count || 0;
          } catch (e) {
            loginCount = patient.last_login ? 1 : 0;
          }

          // Calculate avg mood
          const avgMood = moodHistory.length > 0
            ? (moodHistory.reduce((sum: number, m: any) => sum + m.mood_value, 0) / moodHistory.length).toFixed(1)
            : null;

          // Monthly summary
          let monthlySummary: any[] = [];
          try {
            monthlySummary = await sql`
              SELECT month_year, total_logins, total_game_sessions, total_game_time_seconds,
                     total_posts, avg_mood, mood_trend, color_distribution, game_performance,
                     interaction_summary, generated_at
              FROM hdd_patient_monthly_summaries
              WHERE patient_id = ${patientId}
              ORDER BY month_year DESC
              LIMIT 12
            `;
          } catch (e) { /* table might not exist */ }

          return new Response(JSON.stringify({
            metrics: {
              loginCount,
              gameSessions,
              postsCount: parseInt(postsCount.count) || 0,
              totalGameTime,
              avgMood: avgMood ? parseFloat(avgMood) : null,
              colorCount: allColors.length
            },
            moodHistory: moodHistory.map((m: any) => ({
              moodValue: m.mood_value,
              note: m.note,
              colorHex: m.color_hex || null,
              colorIntensity: m.color_intensity || null,
              context: m.context || 'daily_checkin',
              createdAt: m.created_at
            })),
            colorHistory: allColors,
            gameSessionDetails: gameSessionDetails.map((s: any) => ({
              score: s.score,
              duration: s.duration_seconds,
              level: s.level,
              completed: s.completed,
              metrics: s.metrics,
              gameName: s.game_name,
              gameSlug: s.game_slug,
              startedAt: s.started_at
            })),
            gameMetrics: gameMetrics.map((m: any) => ({
              metricType: m.metric_type,
              metricValue: m.metric_value,
              metricData: m.metric_data,
              gameSlug: m.game_slug,
              createdAt: m.created_at
            })),
            // Per-game longitudinal summary (baseline → latest per biometric)
            gameSummary: gameSummary.map((g: any) => ({
              gameSlug: g.game_slug,
              totalSessions: parseInt(g.total_sessions) || 0,
              firstSessionAt: g.first_session_at,
              lastSessionAt: g.last_session_at,
              avgScore: g.avg_score ? parseFloat(g.avg_score) : null,
              minScore: g.min_score ? parseFloat(g.min_score) : null,
              maxScore: g.max_score ? parseFloat(g.max_score) : null,
              baselineScore: g.baseline_score ? parseFloat(g.baseline_score) : null,
              latestScore: g.latest_score ? parseFloat(g.latest_score) : null,
              scoreProgress: g.score_progress ? parseFloat(g.score_progress) : null,
              avgRtMs: g.avg_rt_ms ? parseFloat(g.avg_rt_ms) : null,
              avgTremor: g.avg_tremor ? parseFloat(g.avg_tremor) : null,
              avgCommissionErrors: g.avg_commission_errors ? parseFloat(g.avg_commission_errors) : null,
              avgOmissionErrors: g.avg_omission_errors ? parseFloat(g.avg_omission_errors) : null,
              avgHesitations: g.avg_hesitations ? parseFloat(g.avg_hesitations) : null,
              avgMovementEff: g.avg_movement_eff ? parseFloat(g.avg_movement_eff) : null,
              avgDPrime: g.avg_d_prime ? parseFloat(g.avg_d_prime) : null
            })),
            // Cross-game clinical profile
            clinicalProfile: clinicalProfile ? {
              gamesPlayed: parseInt(clinicalProfile.games_played) || 0,
              totalSessions: parseInt(clinicalProfile.total_sessions) || 0,
              lastActivityAt: clinicalProfile.last_activity_at,
              overallAvgScore: clinicalProfile.overall_avg_score ? parseFloat(clinicalProfile.overall_avg_score) : null,
              bestScoreEver: clinicalProfile.best_score_ever ? parseFloat(clinicalProfile.best_score_ever) : null,
              avgRtMs: clinicalProfile.avg_rt_ms ? parseFloat(clinicalProfile.avg_rt_ms) : null,
              avgTremor: clinicalProfile.avg_tremor ? parseFloat(clinicalProfile.avg_tremor) : null,
              avgCommissionErrors: clinicalProfile.avg_commission_errors ? parseFloat(clinicalProfile.avg_commission_errors) : null,
              avgOmissionErrors: clinicalProfile.avg_omission_errors ? parseFloat(clinicalProfile.avg_omission_errors) : null,
              avgHesitations: clinicalProfile.avg_hesitations ? parseFloat(clinicalProfile.avg_hesitations) : null,
              avgMovementEff: clinicalProfile.avg_movement_eff ? parseFloat(clinicalProfile.avg_movement_eff) : null,
              avgDPrime: clinicalProfile.avg_d_prime ? parseFloat(clinicalProfile.avg_d_prime) : null,
              globalScoreTrend: clinicalProfile.global_score_trend ? parseFloat(clinicalProfile.global_score_trend) : null,
              gameBreakdown: clinicalProfile.game_breakdown || []
            } : null,
            gamesProgress: gamesProgress.map((g: any) => ({
              gameName: g.game_name,
              currentLevel: g.current_level,
              maxLevel: g.max_level,
              bestScore: g.best_score,
              totalSessions: g.total_sessions,
              lastPlayed: g.last_played
            })),
            recentActivity,
            interactions: interactions.map((i: any) => ({
              type: i.interaction_type,
              details: i.details,
              createdAt: i.created_at
            })),
            monthlySummary: monthlySummary.map((s: any) => ({
              monthYear: s.month_year,
              totalLogins: s.total_logins,
              totalGameSessions: s.total_game_sessions,
              totalGameTime: s.total_game_time_seconds,
              totalPosts: s.total_posts,
              avgMood: s.avg_mood ? parseFloat(s.avg_mood) : null,
              moodTrend: s.mood_trend,
              colorDistribution: s.color_distribution,
              gamePerformance: s.game_performance,
              interactionSummary: s.interaction_summary
            }))
          }), { status: 200, headers: corsHeaders });

        } catch (err) {
          console.error("Patient metrics error:", err);
          return new Response(JSON.stringify({
            metrics: { loginCount: 0, gameSessions: 0, postsCount: 0, totalGameTime: 0, avgMood: null, colorCount: 0 },
            moodHistory: [],
            colorHistory: [],
            gameSessionDetails: [],
            gameMetrics: [],
            gameSummary: [],
            clinicalProfile: null,
            gamesProgress: [],
            recentActivity: [],
            interactions: [],
            monthlySummary: []
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
