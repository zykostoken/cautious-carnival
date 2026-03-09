import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { getCorsHeaders } from "./lib/auth.mts";
import { isAdminSession } from "./lib/admin-roles.mts";
import { logProfessionalAction, getProfessionalFromToken } from "./lib/audit.mts";

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, sessionToken } = body;

    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "Token requerido" }),
        { status: 400, headers: corsHeaders });
    }

    if (!(await isAdminSession(sql, sessionToken))) {
      return new Response(JSON.stringify({ error: "No autorizado" }),
        { status: 403, headers: corsHeaders });
    }

    const prof = await getProfessionalFromToken(sql, sessionToken);
    if (!prof) {
      return new Response(JSON.stringify({ error: "Profesional no encontrado" }),
        { status: 403, headers: corsHeaders });
    }

    // Audit log (non-blocking)
    logProfessionalAction(sql, {
      professionalId: prof.id,
      professionalEmail: prof.email,
      actionType: `hce_${action}`,
      resourceType: 'hce',
      patientId: body.patientId || null,
      details: { action },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
      userAgent: req.headers.get('user-agent'),
    });

    // ── GET PATIENT HCE (full view) ──────────────────────────────
    if (action === "get_patient_hce") {
      const { patientId } = body;
      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      // Patient demographics
      const [patient] = await sql`
        SELECT id, dni, full_name, email, phone, admission_date, status, notes,
               fecha_nacimiento, sexo, genero, nacionalidad, estado_civil,
               direccion, localidad, provincia, codigo_postal,
               ocupacion, nivel_educativo,
               contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
               grupo_sanguineo, numero_historia_clinica, numero_hc_papel,
               obra_social, obra_social_numero, care_modality
        FROM hdd_patients WHERE id = ${patientId}
      `;

      if (!patient) {
        return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
          { status: 404, headers: corsHeaders });
      }

      // Active medications
      const medications = await sql`
        SELECT id, droga, nombre_comercial, dosis, frecuencia, via,
               fecha_inicio, fecha_fin, estado, motivo_suspension, prescripto_por,
               created_at
        FROM hce_medicacion
        WHERE patient_id = ${patientId}
        ORDER BY
          CASE estado WHEN 'activo' THEN 0 WHEN 'suspendido' THEN 1 ELSE 2 END,
          created_at DESC
      `;

      // Recent evolutions (last 50)
      const evolutions = await sql`
        SELECT e.id, e.profesional_id, e.fecha, e.tipo, e.contenido,
               e.motivo_consulta, e.examen_mental, e.plan_terapeutico,
               e.indicaciones, e.es_confidencial, e.editado, e.editado_at,
               e.created_at,
               p.full_name AS profesional_nombre,
               p.specialty AS profesional_especialidad,
               COALESCE(e.firma_nombre, p.full_name) AS firma_nombre,
               COALESCE(e.firma_especialidad, p.specialty) AS firma_especialidad,
               e.firma_matricula,
               COALESCE(e.firma_role, p.role) AS firma_role
        FROM hce_evoluciones e
        LEFT JOIN healthcare_professionals p ON p.id = e.profesional_id
        WHERE e.patient_id = ${patientId}
        ORDER BY e.fecha DESC, e.created_at DESC
        LIMIT 50
      `;

      // Active diagnoses
      const diagnoses = await sql`
        SELECT id, codigo, sistema, descripcion, tipo, estado,
               fecha_diagnostico, fecha_resolucion, diagnosticado_por,
               created_at
        FROM hce_diagnosticos
        WHERE patient_id = ${patientId}
        ORDER BY
          CASE estado WHEN 'activo' THEN 0 WHEN 'en_estudio' THEN 1 ELSE 2 END,
          created_at DESC
      `;

      // Background/antecedentes
      const antecedentes = await sql`
        SELECT id, tipo, descripcion, fecha_aproximada, observaciones,
               registrado_por, created_at
        FROM hce_antecedentes
        WHERE patient_id = ${patientId}
        ORDER BY tipo, created_at DESC
      `;

      // Vital signs (last 20) + ultimo registro destacado
      const vitals = await sql`
        SELECT id, fecha, peso_kg, talla_cm, ta_sistolica, ta_diastolica,
               fc, fr, temperatura, saturacion, glucemia, notas,
               COALESCE(registrado_por_nombre, registrado_por::text) AS registrado_por,
               registrado_por_role,
               created_at
        FROM hce_signos_vitales
        WHERE patient_id = ${patientId}
        ORDER BY fecha DESC
        LIMIT 20
      `;

      // Studies (last 20)
      const studies = await sql`
        SELECT id, tipo, titulo, descripcion, fecha_estudio,
               resultado_texto, archivo_url, archivo_nombre, subido_por,
               created_at
        FROM hce_estudios
        WHERE patient_id = ${patientId}
        ORDER BY fecha_estudio DESC
        LIMIT 20
      `;

      return new Response(JSON.stringify({
        success: true,
        patient,
        medications,
        evolutions,
        diagnoses,
        antecedentes,
        vitals,
        studies
      }), { status: 200, headers: corsHeaders });
    }

    // ── ADD EVOLUTION ────────────────────────────────────────────
    if (action === "add_evolution") {
      const { patientId, tipo, contenido, motivoConsulta, examenMental,
              planTerapeutico, indicaciones, esConfidencial } = body;

      if (!patientId || !contenido) {
        return new Response(JSON.stringify({ error: "patientId y contenido son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      // Build firma/sello: matrícula provincial o nacional
      const firmaMatricula = prof.matriculaProvincial
        ? `MP ${prof.matriculaProvincial}`
        : prof.matriculaNacional
          ? `MN ${prof.matriculaNacional}`
          : null;

      const [evolution] = await sql`
        INSERT INTO hce_evoluciones (
          patient_id, profesional_id, fecha, tipo, contenido,
          motivo_consulta, examen_mental, plan_terapeutico,
          indicaciones, es_confidencial,
          firma_nombre, firma_especialidad, firma_matricula, firma_role
        ) VALUES (
          ${patientId}, ${prof.id}, NOW(), ${tipo || 'evolucion'},
          ${contenido}, ${motivoConsulta || null}, ${examenMental || null},
          ${planTerapeutico || null}, ${indicaciones || null},
          ${esConfidencial || false},
          ${prof.fullName}, ${prof.specialty || null},
          ${firmaMatricula}, ${prof.role || 'profesional'}
        )
        RETURNING id, fecha, created_at, firma_nombre, firma_especialidad, firma_matricula, firma_role
      `;

      return new Response(JSON.stringify({ success: true, evolution }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE EVOLUTION ─────────────────────────────────────────
    if (action === "update_evolution") {
      const { evolutionId, contenido, motivoConsulta, examenMental,
              planTerapeutico, indicaciones } = body;

      if (!evolutionId || !contenido) {
        return new Response(JSON.stringify({ error: "evolutionId y contenido son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      // Only the author can edit their own evolutions
      const [existing] = await sql`
        SELECT profesional_id FROM hce_evoluciones WHERE id = ${evolutionId}
      `;

      if (!existing) {
        return new Response(JSON.stringify({ error: "Evolución no encontrada" }),
          { status: 404, headers: corsHeaders });
      }

      if (existing.profesional_id !== prof.id) {
        return new Response(JSON.stringify({ error: "Solo puede editar sus propias evoluciones" }),
          { status: 403, headers: corsHeaders });
      }

      await sql`
        UPDATE hce_evoluciones SET
          contenido = ${contenido},
          motivo_consulta = ${motivoConsulta || null},
          examen_mental = ${examenMental || null},
          plan_terapeutico = ${planTerapeutico || null},
          indicaciones = ${indicaciones || null},
          editado = true,
          editado_at = NOW()
        WHERE id = ${evolutionId}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── ADD MEDICATION ───────────────────────────────────────────
    if (action === "add_medication") {
      const { patientId, droga, nombreComercial, dosis, frecuencia, via,
              fechaInicio, fechaFin } = body;

      if (!patientId || !droga || !dosis || !frecuencia) {
        return new Response(JSON.stringify({ error: "droga, dosis y frecuencia son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      const [med] = await sql`
        INSERT INTO hce_medicacion (
          patient_id, droga, nombre_comercial, dosis, frecuencia, via,
          fecha_inicio, fecha_fin, estado, prescripto_por
        ) VALUES (
          ${patientId}, ${droga}, ${nombreComercial || null},
          ${dosis}, ${frecuencia}, ${via || 'oral'},
          ${fechaInicio || new Date().toISOString().split('T')[0]},
          ${fechaFin || null}, 'activo', ${prof.fullName}
        )
        RETURNING id, created_at
      `;

      return new Response(JSON.stringify({ success: true, medication: med }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE MEDICATION STATUS ─────────────────────────────────
    if (action === "update_medication") {
      const { medicationId, estado, motivoSuspension, fechaFin } = body;

      if (!medicationId || !estado) {
        return new Response(JSON.stringify({ error: "medicationId y estado son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      await sql`
        UPDATE hce_medicacion SET
          estado = ${estado},
          motivo_suspension = ${motivoSuspension || null},
          fecha_fin = ${fechaFin || (estado !== 'activo' ? new Date().toISOString().split('T')[0] : null)}
        WHERE id = ${medicationId}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── ADD DIAGNOSIS ────────────────────────────────────────────
    if (action === "add_diagnosis") {
      const { patientId, codigo, sistema, descripcion, tipo, fechaDiagnostico } = body;

      if (!patientId || !descripcion) {
        return new Response(JSON.stringify({ error: "descripcion es requerida" }),
          { status: 400, headers: corsHeaders });
      }

      const [diag] = await sql`
        INSERT INTO hce_diagnosticos (
          patient_id, codigo, sistema, descripcion, tipo,
          estado, fecha_diagnostico, diagnosticado_por
        ) VALUES (
          ${patientId}, ${codigo || null}, ${sistema || 'CIE-10'},
          ${descripcion}, ${tipo || 'principal'}, 'activo',
          ${fechaDiagnostico || new Date().toISOString().split('T')[0]},
          ${prof.fullName}
        )
        RETURNING id, created_at
      `;

      return new Response(JSON.stringify({ success: true, diagnosis: diag }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE DIAGNOSIS STATUS ──────────────────────────────────
    if (action === "update_diagnosis") {
      const { diagnosisId, estado, fechaResolucion } = body;

      if (!diagnosisId || !estado) {
        return new Response(JSON.stringify({ error: "diagnosisId y estado son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      await sql`
        UPDATE hce_diagnosticos SET
          estado = ${estado},
          fecha_resolucion = ${fechaResolucion || (estado === 'resuelto' ? new Date().toISOString().split('T')[0] : null)}
        WHERE id = ${diagnosisId}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── ADD ANTECEDENTE ──────────────────────────────────────────
    if (action === "add_antecedente") {
      const { patientId, tipo, descripcion, fechaAproximada, observaciones } = body;

      if (!patientId || !tipo || !descripcion) {
        return new Response(JSON.stringify({ error: "tipo y descripcion son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      const [ant] = await sql`
        INSERT INTO hce_antecedentes (
          patient_id, tipo, descripcion, fecha_aproximada, observaciones, registrado_por
        ) VALUES (
          ${patientId}, ${tipo}, ${descripcion},
          ${fechaAproximada || null}, ${observaciones || null}, ${prof.fullName}
        )
        RETURNING id, created_at
      `;

      return new Response(JSON.stringify({ success: true, antecedente: ant }),
        { status: 201, headers: corsHeaders });
    }

    // ── ADD VITAL SIGNS ──────────────────────────────────────────
    if (action === "add_vitals") {
      const { patientId, pesoKg, tallaCm, taSistolica, taDiastolica,
              fc, fr, temperatura, saturacion, glucemia, notas } = body;

      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      const [vital] = await sql`
        INSERT INTO hce_signos_vitales (
          patient_id, fecha, peso_kg, talla_cm, ta_sistolica, ta_diastolica,
          fc, fr, temperatura, saturacion, glucemia, notas,
          registrado_por_nombre, registrado_por_role
        ) VALUES (
          ${patientId}, NOW(),
          ${pesoKg || null}, ${tallaCm || null},
          ${taSistolica || null}, ${taDiastolica || null},
          ${fc || null}, ${fr || null},
          ${temperatura || null}, ${saturacion || null},
          ${glucemia || null}, ${notas || null},
          ${prof.fullName}, ${prof.role || 'profesional'}
        )
        RETURNING id, fecha, ta_sistolica, ta_diastolica, fc, fr,
                  temperatura, saturacion, glucemia, peso_kg, created_at
      `;

      return new Response(JSON.stringify({ success: true, vital }),
        { status: 201, headers: corsHeaders });
    }

    // ── GET PATIENT METRICS (game + mood data) ──────────────────
    if (action === "get_patient_metrics") {
      const { patientId } = body;
      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      // Get patient DNI for cross-reference with game metrics
      const [patient] = await sql`SELECT dni FROM hdd_patients WHERE id = ${patientId}`;
      if (!patient) {
        return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
          { status: 404, headers: corsHeaders });
      }

      // Game session summaries (last 90 days)
      const gameSessions = await sql`
        SELECT game_slug, metric_type, metric_value, metric_data,
               duration_seconds, score, completed, level_reached, session_date
        FROM hdd_game_metrics
        WHERE (patient_id = ${patientId} OR patient_dni = ${patient.dni})
          AND session_date > NOW() - INTERVAL '90 days'
        ORDER BY session_date DESC
        LIMIT 100
      `;

      // Game progress aggregates
      const gameProgress = await sql`
        SELECT game_slug,
               COUNT(*) AS total_sessions,
               AVG(score) AS avg_score,
               MAX(score) AS best_score,
               MAX(level_reached) AS max_level,
               SUM(duration_seconds) AS total_time_seconds,
               MIN(session_date) AS first_session,
               MAX(session_date) AS last_session
        FROM hdd_game_metrics
        WHERE (patient_id = ${patientId} OR patient_dni = ${patient.dni})
          AND metric_type = 'session_summary'
        GROUP BY game_slug
      `;

      // Mood entries (last 90 days)
      const moodEntries = await sql`
        SELECT color_hex, color_id, context_type, source_activity, recorded_at
        FROM hdd_mood_entries
        WHERE (patient_id = ${patientId} OR patient_dni = ${patient.dni})
          AND recorded_at > NOW() - INTERVAL '90 days'
        ORDER BY recorded_at DESC
        LIMIT 100
      `;

      // Mood checkins (last 90 days)
      const moodCheckins = await sql`
        SELECT mood_value, color_hex, note, context, created_at
        FROM hdd_mood_checkins
        WHERE patient_id = ${patientId}
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC
        LIMIT 50
      `;

      return new Response(JSON.stringify({
        success: true,
        gameSessions,
        gameProgress,
        moodEntries,
        moodCheckins
      }), { status: 200, headers: corsHeaders });
    }

    // ── LOAD MORE EVOLUTIONS ─────────────────────────────────────
    if (action === "load_more_evolutions") {
      const { patientId, offset } = body;

      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      const evolutions = await sql`
        SELECT e.id, e.profesional_id, e.fecha, e.tipo, e.contenido,
               e.motivo_consulta, e.examen_mental, e.plan_terapeutico,
               e.indicaciones, e.es_confidencial, e.editado, e.editado_at,
               e.created_at,
               p.full_name AS profesional_nombre,
               p.specialty AS profesional_especialidad,
               COALESCE(e.firma_nombre, p.full_name) AS firma_nombre,
               COALESCE(e.firma_especialidad, p.specialty) AS firma_especialidad,
               e.firma_matricula,
               COALESCE(e.firma_role, p.role) AS firma_role
        FROM hce_evoluciones e
        LEFT JOIN healthcare_professionals p ON p.id = e.profesional_id
        WHERE e.patient_id = ${patientId}
        ORDER BY e.fecha DESC, e.created_at DESC
        OFFSET ${offset || 0}
        LIMIT 50
      `;

      return new Response(JSON.stringify({ success: true, evolutions }),
        { status: 200, headers: corsHeaders });
    }

    // ── AUTOSAVE DRAFT ───────────────────────────────────────────
    if (action === "autosave_draft") {
      const { patientId, draftContent, draftType } = body;
      // Store in evolution as draft (not yet committed)
      // We use a simple approach: upsert a draft row
      // Drafts are identified by profesional_id + patient_id + tipo='borrador'

      if (!patientId || !draftContent) {
        return new Response(JSON.stringify({ error: "patientId y draftContent requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      // Check for existing draft
      const [existing] = await sql`
        SELECT id FROM hce_evoluciones
        WHERE patient_id = ${patientId}
          AND profesional_id = ${prof.id}
          AND tipo = 'borrador'
        ORDER BY created_at DESC LIMIT 1
      `;

      if (existing) {
        await sql`
          UPDATE hce_evoluciones SET
            contenido = ${draftContent},
            editado_at = NOW()
          WHERE id = ${existing.id}
        `;
      } else {
        await sql`
          INSERT INTO hce_evoluciones (
            patient_id, profesional_id, fecha, tipo, contenido
          ) VALUES (
            ${patientId}, ${prof.id}, NOW(), 'borrador', ${draftContent}
          )
        `;
      }

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── COMMIT DRAFT (convert borrador to evolucion) ─────────────
    if (action === "commit_draft") {
      const { patientId, tipo } = body;

      const [draft] = await sql`
        SELECT id FROM hce_evoluciones
        WHERE patient_id = ${patientId}
          AND profesional_id = ${prof.id}
          AND tipo = 'borrador'
        ORDER BY created_at DESC LIMIT 1
      `;

      if (!draft) {
        return new Response(JSON.stringify({ error: "No hay borrador para confirmar" }),
          { status: 404, headers: corsHeaders });
      }

      // Stamp firma y sello at commit time
      const draftFirmaMatricula = prof.matriculaProvincial
        ? `MP ${prof.matriculaProvincial}`
        : prof.matriculaNacional
          ? `MN ${prof.matriculaNacional}`
          : null;

      await sql`
        UPDATE hce_evoluciones SET
          tipo = ${tipo || 'evolucion'},
          fecha = NOW(),
          editado = false,
          editado_at = null,
          firma_nombre = ${prof.fullName},
          firma_especialidad = ${prof.specialty || null},
          firma_matricula = ${draftFirmaMatricula},
          firma_role = ${prof.role || 'profesional'}
        WHERE id = ${draft.id}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: `Acción desconocida: ${action}` }),
      { status: 400, headers: corsHeaders });

  } catch (err: any) {
    console.error("HCE Error:", err);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: corsHeaders });
  }
};

export const config: Config = {
  path: "/api/hdd-hce"
};
