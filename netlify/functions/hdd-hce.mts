import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { getCorsHeaders } from "./lib/auth.mts";
import { isAdminSession } from "./lib/admin-roles.mts";
import { logProfessionalAction, getProfessionalFromToken } from "./lib/audit.mts";

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Helper: resolve patient by DNI (preferred) or by id (legacy)
  // DNI is the universal identifier — id is internal DB only
  async function resolvePatientId(body: any): Promise<number | null> {
    if (body.patientDni) {
      const [p] = await sql`SELECT id FROM hdd_patients WHERE dni = ${body.patientDni} LIMIT 1`;
      return p?.id || null;
    }
    if (body.patientId) {
      const numId = parseInt(body.patientId);
      if (!isNaN(numId) && numId > 0) return numId;
    }
    return null;
  }

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
      const { patientId, patientDni } = body;
      if (!patientId && !patientDni) {
        return new Response(JSON.stringify({ error: "DNI o ID de paciente requerido" }),
          { status: 400, headers: corsHeaders });
      }

      // Patient demographics — resolve by DNI first, fallback to id
      const [patient] = patientDni
        ? await sql`
            SELECT id, dni, full_name, email, phone, admission_date, status, notes,
                   fecha_nacimiento, sexo, genero, nacionalidad, estado_civil,
                   direccion, localidad, provincia, codigo_postal,
                   ocupacion, nivel_educativo,
                   contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_relacion,
                   grupo_sanguineo, numero_historia_clinica, numero_hc_papel,
                   obra_social, obra_social_numero, care_modality
            FROM hdd_patients WHERE dni = ${patientDni}
          `
        : await sql`
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

      // Use resolved patient.id for all subsequent queries (DNI→id resolved above)
      const resolvedPatientId = patient.id;

      // Active medications
      const medications = await sql`
        SELECT id, droga, nombre_comercial, dosis, frecuencia, via,
               fecha_inicio, fecha_fin, estado, motivo_suspension, prescripto_por,
               created_at
        FROM hce_medicacion
        WHERE patient_id = ${resolvedPatientId}
        ORDER BY
          CASE estado WHEN 'activo' THEN 0 WHEN 'suspendido' THEN 1 ELSE 2 END,
          created_at DESC
      `;

      // Recent evolutions (last 50)
      // All institutional professionals can see all evolutions (HC belongs to the institution)
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
        WHERE e.patient_id = ${resolvedPatientId}
        ORDER BY e.fecha DESC, e.created_at DESC
        LIMIT 50
      `;

      // Active diagnoses
      const diagnoses = await sql`
        SELECT id, codigo, sistema, descripcion, tipo, estado,
               fecha_diagnostico, fecha_resolucion, diagnosticado_por,
               created_at
        FROM hce_diagnosticos
        WHERE patient_id = ${resolvedPatientId}
        ORDER BY
          CASE estado WHEN 'activo' THEN 0 WHEN 'en_estudio' THEN 1 ELSE 2 END,
          created_at DESC
      `;

      // Background/antecedentes
      const antecedentes = await sql`
        SELECT id, tipo, descripcion, fecha_aproximada, observaciones,
               registrado_por, created_at
        FROM hce_antecedentes
        WHERE patient_id = ${resolvedPatientId}
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
        WHERE patient_id = ${resolvedPatientId}
        ORDER BY fecha DESC
        LIMIT 20
      `;

      // Studies (last 20)
      const studies = await sql`
        SELECT id, tipo, titulo, descripcion, fecha_estudio,
               resultado_texto, archivo_url, archivo_nombre, subido_por,
               created_at
        FROM hce_estudios
        WHERE patient_id = ${resolvedPatientId}
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
      const { patientId: rawPatientId, patientDni, tipo, contenido, motivoConsulta, examenMental,
              planTerapeutico, indicaciones, esConfidencial } = body;

      const patientId = await resolvePatientId({ patientId: rawPatientId, patientDni });
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

      // Compute firma digital hash (Ley 25.506 - firma electronica simple)
      const firmaContent = `${contenido}|${prof.fullName}|${firmaMatricula}|${patientId}|${new Date().toISOString()}`;
      const firmaEncoder = new TextEncoder();
      const firmaBuffer = await crypto.subtle.digest('SHA-256', firmaEncoder.encode(firmaContent));
      const firmaDigitalHash = Array.from(new Uint8Array(firmaBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const firmaIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;

      const [evolution] = await sql`
        INSERT INTO hce_evoluciones (
          patient_id, profesional_id, fecha, tipo, contenido,
          motivo_consulta, examen_mental, plan_terapeutico,
          indicaciones, es_confidencial,
          firma_nombre, firma_especialidad, firma_matricula, firma_role,
          firma_digital_hash, firma_digital_timestamp, firma_ip_address
        ) VALUES (
          ${patientId}, ${prof.id}, NOW(), ${tipo ?? 'evolucion'},
          ${contenido}, ${motivoConsulta ?? null}, ${examenMental ?? null},
          ${planTerapeutico ?? null}, ${indicaciones ?? null},
          ${esConfidencial ?? false},
          ${prof.fullName}, ${prof.specialty ?? null},
          ${firmaMatricula}, ${prof.role ?? 'profesional'},
          ${firmaDigitalHash}, NOW(), ${firmaIp}
        )
        RETURNING id, fecha, created_at, firma_nombre, firma_especialidad, firma_matricula, firma_role, firma_digital_hash
      `;

      return new Response(JSON.stringify({ success: true, evolution }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE EVOLUTION (addendum pattern - Ley 26.529 immutability) ──
    if (action === "update_evolution") {
      const { evolutionId, contenido, motivoConsulta, examenMental,
              planTerapeutico, indicaciones } = body;

      if (!evolutionId || !contenido) {
        return new Response(JSON.stringify({ error: "evolutionId y contenido son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      const [existing] = await sql`
        SELECT id, profesional_id, tipo, patient_id FROM hce_evoluciones WHERE id = ${evolutionId}
      `;

      if (!existing) {
        return new Response(JSON.stringify({ error: "Evolución no encontrada" }),
          { status: 404, headers: corsHeaders });
      }

      // Drafts can be edited directly
      if (existing.tipo === 'borrador') {
        if (existing.profesional_id !== prof.id) {
          return new Response(JSON.stringify({ error: "Solo puede editar sus propios borradores" }),
            { status: 403, headers: corsHeaders });
        }
        await sql`
          UPDATE hce_evoluciones SET
            contenido = ${contenido},
            motivo_consulta = ${motivoConsulta ?? null},
            examen_mental = ${examenMental ?? null},
            plan_terapeutico = ${planTerapeutico ?? null},
            indicaciones = ${indicaciones ?? null},
            editado_at = NOW()
          WHERE id = ${evolutionId}
        `;
        return new Response(JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders });
      }

      // Committed evolutions: create addendum instead of editing (Ley 26.529)
      const addendumMatricula = prof.matriculaProvincial
        ? `MP ${prof.matriculaProvincial}`
        : prof.matriculaNacional
          ? `MN ${prof.matriculaNacional}`
          : null;

      const addendumContent = `[Addendum a evolución #${evolutionId}]\n${contenido}`;
      const addFirmaContent = `${addendumContent}|${prof.fullName}|${addendumMatricula}|${existing.patient_id}|${new Date().toISOString()}`;
      const addFirmaEncoder = new TextEncoder();
      const addFirmaBuffer = await crypto.subtle.digest('SHA-256', addFirmaEncoder.encode(addFirmaContent));
      const addFirmaHash = Array.from(new Uint8Array(addFirmaBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const addFirmaIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;

      const [addendum] = await sql`
        INSERT INTO hce_evoluciones (
          patient_id, profesional_id, fecha, tipo, contenido,
          motivo_consulta, examen_mental, plan_terapeutico,
          indicaciones, es_confidencial,
          is_addendum, parent_evolution_id,
          firma_nombre, firma_especialidad, firma_matricula, firma_role,
          firma_digital_hash, firma_digital_timestamp, firma_ip_address
        ) VALUES (
          ${existing.patient_id}, ${prof.id}, NOW(), 'addendum',
          ${addendumContent}, ${motivoConsulta ?? null}, ${examenMental ?? null},
          ${planTerapeutico ?? null}, ${indicaciones ?? null}, false,
          true, ${evolutionId},
          ${prof.fullName}, ${prof.specialty ?? null},
          ${addendumMatricula}, ${prof.role ?? 'profesional'},
          ${addFirmaHash}, NOW(), ${addFirmaIp}
        )
        RETURNING id, fecha, created_at
      `;

      return new Response(JSON.stringify({ success: true, addendum, isAddendum: true }),
        { status: 201, headers: corsHeaders });
    }

    // ── ADD MEDICATION ───────────────────────────────────────────
    if (action === "add_medication") {
      const { patientId: rawPidMed, patientDni: dniMed, droga, nombreComercial, dosis, frecuencia, via,
              fechaInicio, fechaFin } = body;

      const patientId = await resolvePatientId({ patientId: rawPidMed, patientDni: dniMed });
      if (!patientId || !droga || !dosis || !frecuencia) {
        return new Response(JSON.stringify({ error: "droga, dosis y frecuencia son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      const [med] = await sql`
        INSERT INTO hce_medicacion (
          patient_id, droga, nombre_comercial, dosis, frecuencia, via,
          fecha_inicio, fecha_fin, estado, prescripto_por
        ) VALUES (
          ${patientId}, ${droga}, ${nombreComercial ?? null},
          ${dosis}, ${frecuencia}, ${via ?? 'oral'},
          ${fechaInicio ?? new Date().toISOString().split('T')[0]},
          ${fechaFin ?? null}, 'activo', ${prof.fullName}
        )
        RETURNING id, created_at
      `;

      return new Response(JSON.stringify({ success: true, medication: med }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE MEDICATION STATUS ─────────────────────────────────
    if (action === "update_medication") {
      const { medicationId, estado, motivoSuspension, fechaFin, patientId: rawPidUpMed, patientDni: dniUpMed } = body;
      const patientId = await resolvePatientId({ patientId: rawPidUpMed, patientDni: dniUpMed });

      if (!medicationId || !estado) {
        return new Response(JSON.stringify({ error: "medicationId y estado son requeridos" }),
          { status: 400, headers: corsHeaders });
      }
      if (!['activo', 'suspendido', 'finalizado'].includes(estado)) {
        return new Response(JSON.stringify({ error: "estado invalido" }),
          { status: 400, headers: corsHeaders });
      }

      // Verify medication belongs to the specified patient
      const [existingMed] = await sql`
        SELECT id FROM hce_medicacion WHERE id = ${medicationId} AND patient_id = ${patientId}
      `;
      if (!existingMed) {
        return new Response(JSON.stringify({ error: "Medicacion no encontrada" }),
          { status: 404, headers: corsHeaders });
      }

      await sql`
        UPDATE hce_medicacion SET
          estado = ${estado},
          motivo_suspension = ${motivoSuspension ?? null},
          fecha_fin = ${fechaFin ?? (estado !== 'activo' ? new Date().toISOString().split('T')[0] : null)}
        WHERE id = ${medicationId} AND patient_id = ${patientId}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── ADD DIAGNOSIS ────────────────────────────────────────────
    if (action === "add_diagnosis") {
      const { patientId: rawPidDx, patientDni: dniDx, codigo, sistema, descripcion, tipo, fechaDiagnostico } = body;
      const patientId = await resolvePatientId({ patientId: rawPidDx, patientDni: dniDx });

      if (!patientId || !descripcion) {
        return new Response(JSON.stringify({ error: "descripcion es requerida" }),
          { status: 400, headers: corsHeaders });
      }

      const [diag] = await sql`
        INSERT INTO hce_diagnosticos (
          patient_id, codigo, sistema, descripcion, tipo,
          estado, fecha_diagnostico, diagnosticado_por
        ) VALUES (
          ${patientId}, ${codigo ?? null}, ${sistema ?? 'CIE-10'},
          ${descripcion}, ${tipo ?? 'principal'}, 'activo',
          ${fechaDiagnostico ?? new Date().toISOString().split('T')[0]},
          ${prof.fullName}
        )
        RETURNING id, created_at
      `;

      return new Response(JSON.stringify({ success: true, diagnosis: diag }),
        { status: 201, headers: corsHeaders });
    }

    // ── UPDATE DIAGNOSIS STATUS ──────────────────────────────────
    if (action === "update_diagnosis") {
      const { diagnosisId, estado, fechaResolucion, patientId: rawPidUpDx, patientDni: dniUpDx } = body;
      const patientId = await resolvePatientId({ patientId: rawPidUpDx, patientDni: dniUpDx });

      if (!diagnosisId || !estado) {
        return new Response(JSON.stringify({ error: "diagnosisId y estado son requeridos" }),
          { status: 400, headers: corsHeaders });
      }
      if (!['activo', 'en_estudio', 'resuelto', 'descartado'].includes(estado)) {
        return new Response(JSON.stringify({ error: "estado invalido" }),
          { status: 400, headers: corsHeaders });
      }

      // Verify diagnosis belongs to the specified patient
      const [existingDiag] = await sql`
        SELECT id FROM hce_diagnosticos WHERE id = ${diagnosisId} AND patient_id = ${patientId}
      `;
      if (!existingDiag) {
        return new Response(JSON.stringify({ error: "Diagnostico no encontrado" }),
          { status: 404, headers: corsHeaders });
      }

      await sql`
        UPDATE hce_diagnosticos SET
          estado = ${estado},
          fecha_resolucion = ${fechaResolucion ?? (estado === 'resuelto' ? new Date().toISOString().split('T')[0] : null)}
        WHERE id = ${diagnosisId} AND patient_id = ${patientId}
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
          ${fechaAproximada ?? null}, ${observaciones ?? null}, ${prof.fullName}
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

      // Validate clinical ranges
      const rangeCheck = (val: any, min: number, max: number, name: string) => {
        if (val != null && (typeof val !== 'number' || val < min || val > max)) {
          return `${name} fuera de rango (${min}-${max})`;
        }
        return null;
      };
      const rangeErrors = [
        rangeCheck(taSistolica, 40, 300, 'TA sistolica'),
        rangeCheck(taDiastolica, 20, 200, 'TA diastolica'),
        rangeCheck(fc, 20, 300, 'FC'),
        rangeCheck(fr, 4, 60, 'FR'),
        rangeCheck(temperatura, 30, 45, 'Temperatura'),
        rangeCheck(saturacion, 50, 100, 'Saturacion'),
        rangeCheck(glucemia, 10, 800, 'Glucemia'),
        rangeCheck(pesoKg, 0.5, 300, 'Peso'),
        rangeCheck(tallaCm, 30, 250, 'Talla'),
      ].filter(Boolean);
      if (rangeErrors.length > 0) {
        return new Response(JSON.stringify({ error: rangeErrors[0] }),
          { status: 400, headers: corsHeaders });
      }

      const [vital] = await sql`
        INSERT INTO hce_signos_vitales (
          patient_id, fecha, peso_kg, talla_cm, ta_sistolica, ta_diastolica,
          fc, fr, temperatura, saturacion, glucemia, notas,
          registrado_por_nombre, registrado_por_role
        ) VALUES (
          ${patientId}, NOW(),
          ${pesoKg ?? null}, ${tallaCm ?? null},
          ${taSistolica ?? null}, ${taDiastolica ?? null},
          ${fc ?? null}, ${fr ?? null},
          ${temperatura ?? null}, ${saturacion ?? null},
          ${glucemia ?? null}, ${notas ?? null},
          ${prof.fullName}, ${prof.role ?? 'profesional'}
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
      const resolvedPid = await resolvePatientId(body);
      const [patient] = resolvedPid 
        ? await sql`SELECT id, dni FROM hdd_patients WHERE id = ${resolvedPid}`
        : [null];
      if (!patient) {
        return new Response(JSON.stringify({ error: "Paciente no encontrado" }),
          { status: 404, headers: corsHeaders });
      }

      // Game session summaries (last 90 days) — from hdd_game_metrics
      const gameSessions = await sql`
        SELECT game_slug, metric_type, metric_value, metric_data, session_date, created_at
        FROM hdd_game_metrics
        WHERE (patient_id = ${resolvedPid} OR patient_dni = ${patient.dni})
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC
        LIMIT 100
      `;

      // Game progress aggregates — include all session metric types
      const gameProgress = await sql`
        SELECT game_slug,
               COUNT(*) AS total_sessions,
               AVG(metric_value) AS avg_score,
               MAX(metric_value) AS best_score,
               SUM((metric_data->>'duration_ms')::numeric / 1000) AS total_time_seconds,
               MIN(created_at) AS first_session,
               MAX(created_at) AS last_session
        FROM hdd_game_metrics
        WHERE (patient_id = ${resolvedPid} OR patient_dni = ${patient.dni})
          AND (metric_type IN ('session_summary', 'session_complete') OR metric_type LIKE 'level_%')
        GROUP BY game_slug
      `;

      // Mood entries (last 90 days)
      const moodEntries = await sql`
        SELECT color_hex, color_id, context_type, source_activity, created_at
        FROM hdd_mood_entries
        WHERE (patient_id = ${resolvedPid} OR patient_dni = ${patient.dni})
          AND created_at > NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC
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

      // ── CLINICAL ANALYSIS — process ALL metrics ──
      const { analyzeAllMetrics } = await import("./lib/clinical-analysis.mts");
      const analysis = analyzeAllMetrics(gameSessions, moodEntries, moodCheckins);

      return new Response(JSON.stringify({
        success: true,
        gameSessions,
        gameProgress,
        moodEntries,
        moodCheckins,
        // Full clinical analysis — all metrics processed and interpreted
        clinicalAnalysis: analysis
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
        OFFSET ${Math.max(0, parseInt(offset) || 0)}
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
        // Resolve DNI → id
        const pid_commit = await resolvePatientId(body);
        if (pid_commit) body.patientId = pid_commit;
      const { patientId, tipo } = body;
      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

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

      // Get draft content for firma digital hash
      const [draftData] = await sql`SELECT contenido FROM hce_evoluciones WHERE id = ${draft.id}`;
      const commitFirmaContent = `${draftData?.contenido || ''}|${prof.fullName}|${draftFirmaMatricula}|${patientId}|${new Date().toISOString()}`;
      const commitEncoder = new TextEncoder();
      const commitBuffer = await crypto.subtle.digest('SHA-256', commitEncoder.encode(commitFirmaContent));
      const commitFirmaHash = Array.from(new Uint8Array(commitBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const commitFirmaIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;

      await sql`
        UPDATE hce_evoluciones SET
          tipo = ${tipo ?? 'evolucion'},
          fecha = NOW(),
          editado = false,
          editado_at = null,
          firma_nombre = ${prof.fullName},
          firma_especialidad = ${prof.specialty ?? null},
          firma_matricula = ${draftFirmaMatricula},
          firma_role = ${prof.role ?? 'profesional'},
          firma_digital_hash = ${commitFirmaHash},
          firma_digital_timestamp = NOW(),
          firma_ip_address = ${commitFirmaIp}
        WHERE id = ${draft.id}
      `;

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── SAVE CONSENT ────────────────────────────────────────────
    if (action === "save_consent") {
      const { patientId, consents } = body;

      if (!patientId || !Array.isArray(consents)) {
        return new Response(JSON.stringify({ error: "patientId y consents (array) son requeridos" }),
          { status: 400, headers: corsHeaders });
      }

      const validTipos = ['tratamiento', 'hce', 'medicacion', 'estudios', 'internacion', 'telemedicina'];
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
      const userAgent = req.headers.get('user-agent') || null;

      for (const c of consents) {
        if (!c.tipo || !validTipos.includes(c.tipo)) continue;

        // Check if a consent record already exists for this patient+tipo
        const [existing] = await sql`
          SELECT id FROM hce_consentimientos
          WHERE patient_id = ${patientId} AND tipo = ${c.tipo} AND revocado_at IS NULL
          ORDER BY created_at DESC LIMIT 1
        `;

        if (existing) {
          await sql`
            UPDATE hce_consentimientos SET
              otorgado = ${c.otorgado ?? false},
              observaciones = ${c.observaciones ?? null},
              profesional_id = ${prof.id},
              ip_address = ${ipAddress},
              user_agent = ${userAgent}
            WHERE id = ${existing.id}
          `;
        } else {
          await sql`
            INSERT INTO hce_consentimientos (
              patient_id, tipo, otorgado, observaciones,
              profesional_id, ip_address, user_agent
            ) VALUES (
              ${patientId}, ${c.tipo}, ${c.otorgado ?? false},
              ${c.observaciones ?? null},
              ${prof.id}, ${ipAddress}, ${userAgent}
            )
          `;
        }
      }

      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: corsHeaders });
    }

    // ── GET CONSENT ─────────────────────────────────────────────
    if (action === "get_consent") {
        // Resolve DNI → id
        const pid_get_consent = await resolvePatientId(body);
        if (pid_get_consent) body.patientId = pid_get_consent;
      const { patientId } = body;

      if (!patientId) {
        return new Response(JSON.stringify({ error: "patientId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      const consents = await sql`
        SELECT id, tipo, otorgado, observaciones, otorgado_por,
               profesional_id, created_at, revocado_at, revocado_motivo
        FROM hce_consentimientos
        WHERE patient_id = ${patientId} AND revocado_at IS NULL
        ORDER BY tipo
      `;

      return new Response(JSON.stringify({ success: true, consents }),
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
