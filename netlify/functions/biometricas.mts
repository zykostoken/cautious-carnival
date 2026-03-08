import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Biometricas - Enhanced biometric data handler
// 1. Stores full raw data in Supabase Storage bucket (biometricas/)
// 2. Extracts structured biomarker readings into hdd_biomarker_readings table
// 3. Enables lifelong longitudinal tracking with clinical reference ranges
//
// Architecture:
//   Game → biomet.js (raw capture) → POST /api/biometricas → {bucket + DB}
//   Dashboard → GET /api/biometricas → {files list or structured readings}
//
// Clinical references:
//   - FDA Digital Health Technologies (DHT) Guidance (2024)
//   - EMA Guideline on computerised systems and electronic data (2023)
//   - Betta E., Semiología Neurológica (2014)
//   - Lezak M.D., Neuropsychological Assessment 5th ed. (2012)

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }
  return { url, serviceKey };
}

// Extract structured biomarker readings from raw biometric data
function extractBiomarkerReadings(
  gameSlug: string,
  data: any
): Array<{
  domain: string;
  biomarker_name: string;
  biomarker_unit: string;
  value_numeric: number | null;
  value_json: any;
  clinical_significance: string;
  collection_method: string;
  input_device: string;
  sampling_rate_hz: number | null;
  data_quality_score: number | null;
}> {
  const readings: any[] = [];
  const device = data.input_device || data.inputDevice || 'unknown';

  function classify(value: number, normalLow: number, normalHigh: number, borderlineLow: number, borderlineHigh: number): string {
    if (value >= normalLow && value <= normalHigh) return 'normal';
    if (value >= borderlineLow && value <= borderlineHigh) return 'borderline';
    return 'abnormal';
  }

  // MOTOR: Tremor
  if (data.tremor_details && Array.isArray(data.tremor_details)) {
    const tremors = data.tremor_details.filter((t: any) => t && typeof t.jitter === 'number');
    if (tremors.length > 0) {
      const avgJitter = tremors.reduce((s: number, t: any) => s + t.jitter, 0) / tremors.length;
      readings.push({
        domain: 'motor_tremor', biomarker_name: 'tremor_reposo_jitter', biomarker_unit: 'px',
        value_numeric: Math.round(avgJitter * 100) / 100,
        value_json: { samples: tremors.length, raw: tremors.slice(0, 20) },
        clinical_significance: classify(avgJitter, 0, 3, 0, 6),
        collection_method: 'automated', input_device: device,
        sampling_rate_hz: 33, data_quality_score: Math.min(1, tremors.length / 5)
      });

      const terminalTremors = tremors.filter((t: any) => t.type === 'terminal' || t.phase === 'terminal');
      if (terminalTremors.length > 0) {
        const avgTerminal = terminalTremors.reduce((s: number, t: any) => s + t.jitter, 0) / terminalTremors.length;
        readings.push({
          domain: 'motor_tremor', biomarker_name: 'tremor_terminal_jitter', biomarker_unit: 'px',
          value_numeric: Math.round(avgTerminal * 100) / 100,
          value_json: { samples: terminalTremors.length },
          clinical_significance: classify(avgTerminal, 0, 5, 0, 10),
          collection_method: 'automated', input_device: device,
          sampling_rate_hz: 33, data_quality_score: Math.min(1, terminalTremors.length / 3)
        });
      }
    }

    const withSpeedVar = data.tremor_details.filter((t: any) => typeof t.speed_var === 'number');
    if (withSpeedVar.length > 0) {
      const avgSpeedVar = withSpeedVar.reduce((s: number, t: any) => s + t.speed_var, 0) / withSpeedVar.length;
      readings.push({
        domain: 'motor_rigidity', biomarker_name: 'velocity_variance', biomarker_unit: 'px/ms',
        value_numeric: Math.round(avgSpeedVar * 1000) / 1000,
        value_json: { samples: withSpeedVar.length },
        clinical_significance: classify(avgSpeedVar, 0, 0.15, 0, 0.30),
        collection_method: 'automated', input_device: device,
        sampling_rate_hz: 33, data_quality_score: Math.min(1, withSpeedVar.length / 5)
      });
    }
  }

  // MOTOR: Praxis
  if (data.action_log && Array.isArray(data.action_log)) {
    const actions = data.action_log;
    const rectifications = actions.filter((a: any) => a.type === 'rectification' || a.type === 'correction').length;
    const falseClicks = actions.filter((a: any) => a.type === 'false_click' || a.type === 'miss').length;
    if (actions.length > 0) {
      readings.push({
        domain: 'motor_praxis', biomarker_name: 'rectifications', biomarker_unit: 'count',
        value_numeric: rectifications,
        value_json: { total_actions: actions.length, false_clicks: falseClicks },
        clinical_significance: classify(rectifications, 0, 3, 0, 7),
        collection_method: 'automated', input_device: device,
        sampling_rate_hz: null, data_quality_score: actions.length >= 5 ? 1 : actions.length / 5
      });
    }
  }

  if (typeof data.path_efficiency === 'number') {
    readings.push({
      domain: 'motor_praxis', biomarker_name: 'path_efficiency', biomarker_unit: 'ratio',
      value_numeric: Math.round(data.path_efficiency * 1000) / 1000, value_json: null,
      clinical_significance: classify(data.path_efficiency, 0.7, 1, 0.5, 1),
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  // COGNITIVE: Reaction Time
  if (data.rt_list && Array.isArray(data.rt_list) && data.rt_list.length > 0) {
    const rts = data.rt_list.filter((r: number) => r > 0 && r < 30000);
    if (rts.length > 0) {
      const meanRt = rts.reduce((s: number, r: number) => s + r, 0) / rts.length;
      const stdDev = Math.sqrt(rts.reduce((s: number, r: number) => s + Math.pow(r - meanRt, 2), 0) / rts.length);
      const cv = meanRt > 0 ? stdDev / meanRt : 0;
      const sorted = [...rts].sort((a: number, b: number) => a - b);

      readings.push({
        domain: 'cognitive_reaction_time', biomarker_name: 'mean_rt', biomarker_unit: 'ms',
        value_numeric: Math.round(meanRt),
        value_json: { n: rts.length, median: sorted[Math.floor(sorted.length / 2)], std_dev: Math.round(stdDev) },
        clinical_significance: classify(meanRt, 250, 600, 100, 1200),
        collection_method: 'automated', input_device: device,
        sampling_rate_hz: null, data_quality_score: Math.min(1, rts.length / 10)
      });

      readings.push({
        domain: 'cognitive_reaction_time', biomarker_name: 'rt_variability_cv', biomarker_unit: 'ratio',
        value_numeric: Math.round(cv * 1000) / 1000, value_json: null,
        clinical_significance: classify(cv, 0.05, 0.25, 0.02, 0.45),
        collection_method: 'automated', input_device: device,
        sampling_rate_hz: null, data_quality_score: Math.min(1, rts.length / 10)
      });
    }
  }

  // COGNITIVE: Hesitations
  if (data.hesitation_details && Array.isArray(data.hesitation_details)) {
    readings.push({
      domain: 'cognitive_attention', biomarker_name: 'hesitation_count', biomarker_unit: 'count',
      value_numeric: data.hesitation_details.length,
      value_json: { gaps: data.hesitation_details.slice(0, 10).map((h: any) => h.gap_ms) },
      clinical_significance: data.hesitation_details.length <= 3 ? 'normal' : data.hesitation_details.length <= 8 ? 'borderline' : 'abnormal',
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  // COGNITIVE: Memory
  if (typeof data.recall_score === 'number' || typeof data.recipeRecallScore === 'number') {
    const score = data.recall_score ?? data.recipeRecallScore ?? 0;
    readings.push({
      domain: 'cognitive_memory', biomarker_name: 'recall_accuracy', biomarker_unit: 'score_0_100',
      value_numeric: score, value_json: null,
      clinical_significance: classify(score, 60, 100, 40, 100),
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  // COGNITIVE: Sequence
  if (typeof data.sequence_score === 'number') {
    readings.push({
      domain: 'cognitive_planning', biomarker_name: 'sequence_score', biomarker_unit: 'score_0_100',
      value_numeric: data.sequence_score, value_json: null,
      clinical_significance: classify(data.sequence_score, 70, 100, 50, 100),
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  // COGNITIVE: Categorization
  if (typeof data.placement_pct === 'number') {
    readings.push({
      domain: 'cognitive_planning', biomarker_name: 'categorization_accuracy', biomarker_unit: 'score_0_100',
      value_numeric: data.placement_pct, value_json: null,
      clinical_significance: classify(data.placement_pct, 75, 100, 55, 100),
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  // AVD: Autonomy
  if (typeof data.score === 'number' && (gameSlug.includes('routine') || gameSlug.includes('pill') || gameSlug.includes('fridge'))) {
    readings.push({
      domain: 'avd_autonomy', biomarker_name: 'avd_completion_rate', biomarker_unit: 'score_0_100',
      value_numeric: data.score, value_json: { game: gameSlug },
      clinical_significance: classify(data.score, 70, 100, 50, 100),
      collection_method: 'automated', input_device: device,
      sampling_rate_hz: null, data_quality_score: 1
    });
  }

  return readings;
}

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { patient_id, session_id, game_slug, level, biometric_data } = body;

      if (!patient_id || !session_id || !game_slug || !biometric_data) {
        return new Response(JSON.stringify({
          error: "patient_id, session_id, game_slug y biometric_data son requeridos"
        }), { status: 400, headers: CORS_HEADERS });
      }

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();

      // 1. Store raw data in bucket
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const levelSuffix = level !== undefined ? `_nivel${level}` : '';
      const filename = `${game_slug}${levelSuffix}_${timestamp}.json`;
      const filePath = `${patient_id}/${session_id}/${filename}`;

      const payload = JSON.stringify({
        patient_id, session_id, game_slug,
        level: level ?? null,
        recorded_at: new Date().toISOString(),
        ...biometric_data
      }, null, 2);

      const uploadUrl = `${supabaseUrl}/storage/v1/object/biometricas/${filePath}`;
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-upsert": "true"
        },
        body: payload
      });

      if (!uploadRes.ok) {
        console.error("Storage upload error:", await uploadRes.text());
      }

      // 2. Extract structured biomarker readings into DB
      let readingsSaved = 0;
      try {
        const sql = getDatabase();
        const readings = extractBiomarkerReadings(game_slug, biometric_data);

        let dbPatientId: number | null = null;
        try {
          const [patient] = await sql`
            SELECT id FROM hdd_patients WHERE dni = ${String(patient_id)} LIMIT 1
          `;
          dbPatientId = patient?.id || null;
        } catch { /* */ }

        let sessionOrdinal = 1;
        let dayOfTreatment: number | null = null;
        if (dbPatientId) {
          try {
            const [cnt] = await sql`
              SELECT COUNT(*)::int AS c FROM hdd_biomarker_readings
              WHERE patient_id = ${dbPatientId} AND game_slug = ${game_slug}
            `;
            sessionOrdinal = (cnt?.c || 0) + 1;
            const [pi] = await sql`SELECT admission_date FROM hdd_patients WHERE id = ${dbPatientId}`;
            if (pi?.admission_date) {
              dayOfTreatment = Math.floor((Date.now() - new Date(pi.admission_date).getTime()) / 86400000);
            }
          } catch { /* */ }
        }

        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

        for (const r of readings) {
          try {
            await sql`
              INSERT INTO hdd_biomarker_readings (
                patient_id, patient_dni, game_slug,
                domain, biomarker_name, biomarker_unit,
                value_numeric, value_json,
                clinical_significance, collection_method, input_device,
                sampling_rate_hz, data_quality_score,
                session_ordinal, time_of_day, day_of_treatment
              ) VALUES (
                ${dbPatientId}, ${String(patient_id)}, ${game_slug},
                ${r.domain}, ${r.biomarker_name}, ${r.biomarker_unit},
                ${r.value_numeric}, ${JSON.stringify(r.value_json)},
                ${r.clinical_significance}, ${r.collection_method}, ${r.input_device},
                ${r.sampling_rate_hz}, ${r.data_quality_score},
                ${sessionOrdinal}, ${timeOfDay}, ${dayOfTreatment}
              )
            `;
            readingsSaved++;
          } catch (e) {
            console.warn(`[biometricas] reading save failed:`, e);
          }
        }
      } catch (dbErr) {
        console.warn("[biometricas] DB extraction failed (non-blocking):", dbErr);
      }

      return new Response(JSON.stringify({
        success: true, path: filePath,
        biomarker_readings_saved: readingsSaved,
        message: "Datos biométricos guardados"
      }), { status: 201, headers: CORS_HEADERS });

    } catch (error) {
      console.error("Biometricas POST error:", error);
      return new Response(JSON.stringify({
        error: "Error interno al guardar biométricos",
        details: error instanceof Error ? error.message : String(error)
      }), { status: 500, headers: CORS_HEADERS });
    }
  }

  if (req.method === "GET") {
    try {
      const reqUrl = new URL(req.url);
      const patient_id = reqUrl.searchParams.get("patient_id");
      const session_id = reqUrl.searchParams.get("session_id");
      const file_path = reqUrl.searchParams.get("file_path");
      const action = reqUrl.searchParams.get("action");

      // Structured biomarker readings
      if (action === "readings") {
        const sql = getDatabase();
        const domain = reqUrl.searchParams.get("domain");
        const limit = parseInt(reqUrl.searchParams.get("limit") || "100");

        if (!patient_id) {
          return new Response(JSON.stringify({ error: "patient_id requerido" }), { status: 400, headers: CORS_HEADERS });
        }

        let readings;
        if (domain) {
          readings = await sql`
            SELECT br.*, rr.normal_low, rr.normal_high, rr.borderline_low, rr.borderline_high,
                   rr.interpretation_low, rr.interpretation_high, rr.clinical_notes AS ref_notes
            FROM hdd_biomarker_readings br
            LEFT JOIN hdd_biomarker_reference_ranges rr
              ON rr.domain = br.domain AND rr.biomarker_name = br.biomarker_name AND rr.population = 'psychiatric_adult'
            WHERE br.patient_dni = ${patient_id} AND br.domain = ${domain}
            ORDER BY br.created_at DESC LIMIT ${limit}
          `;
        } else {
          readings = await sql`
            SELECT br.*, rr.normal_low, rr.normal_high, rr.borderline_low, rr.borderline_high
            FROM hdd_biomarker_readings br
            LEFT JOIN hdd_biomarker_reference_ranges rr
              ON rr.domain = br.domain AND rr.biomarker_name = br.biomarker_name AND rr.population = 'psychiatric_adult'
            WHERE br.patient_dni = ${patient_id}
            ORDER BY br.created_at DESC LIMIT ${limit}
          `;
        }
        return new Response(JSON.stringify({ readings }), { headers: CORS_HEADERS });
      }

      // Clinical summary
      if (action === "clinical_summary") {
        if (!patient_id) {
          return new Response(JSON.stringify({ error: "patient_id requerido" }), { status: 400, headers: CORS_HEADERS });
        }
        const sql = getDatabase();

        const latestReadings = await sql`
          SELECT DISTINCT ON (br.domain, br.biomarker_name)
            br.domain, br.biomarker_name, br.biomarker_unit,
            br.value_numeric, br.clinical_significance,
            br.session_ordinal, br.day_of_treatment, br.created_at,
            rr.normal_low, rr.normal_high, rr.borderline_low, rr.borderline_high,
            rr.interpretation_low, rr.interpretation_high, rr.clinical_notes AS ref_notes
          FROM hdd_biomarker_readings br
          LEFT JOIN hdd_biomarker_reference_ranges rr
            ON rr.domain = br.domain AND rr.biomarker_name = br.biomarker_name AND rr.population = 'psychiatric_adult'
          WHERE br.patient_dni = ${patient_id}
          ORDER BY br.domain, br.biomarker_name, br.created_at DESC
        `;

        const trends = await sql`
          SELECT domain, biomarker_name, value_numeric, created_at, session_ordinal
          FROM hdd_biomarker_readings
          WHERE patient_dni = ${patient_id}
          ORDER BY domain, biomarker_name, created_at DESC
        `;

        const trendMap: Record<string, any[]> = {};
        for (const t of trends) {
          const key = `${t.domain}::${t.biomarker_name}`;
          if (!trendMap[key]) trendMap[key] = [];
          if (trendMap[key].length < 20) trendMap[key].push(t);
        }

        return new Response(JSON.stringify({
          patient_id, latest: latestReadings, trends: trendMap,
          total_readings: trends.length,
          domains_covered: [...new Set(latestReadings.map((r: any) => r.domain))]
        }), { headers: CORS_HEADERS });
      }

      // Reference ranges
      if (action === "reference_ranges") {
        const sql = getDatabase();
        const ranges = await sql`SELECT * FROM hdd_biomarker_reference_ranges ORDER BY domain, biomarker_name`;
        return new Response(JSON.stringify({ ranges }), { headers: CORS_HEADERS });
      }

      // Legacy file-based access
      if (!patient_id) {
        return new Response(JSON.stringify({ error: "patient_id es requerido" }), { status: 400, headers: CORS_HEADERS });
      }

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();

      if (file_path) {
        const dlRes = await fetch(`${supabaseUrl}/storage/v1/object/biometricas/${file_path}`, {
          headers: { "Authorization": `Bearer ${serviceKey}` }
        });
        if (!dlRes.ok) return new Response(JSON.stringify({ error: "Archivo no encontrado" }), { status: 404, headers: CORS_HEADERS });
        const fileContent = await dlRes.json();
        return new Response(JSON.stringify({ data: fileContent }), { headers: CORS_HEADERS });
      }

      const prefix = session_id ? `${patient_id}/${session_id}/` : `${patient_id}/`;
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/biometricas`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 500, offset: 0, sortBy: { column: "created_at", order: "desc" } })
      });
      if (!listRes.ok) {
        return new Response(JSON.stringify({ error: "Error al listar archivos" }), { status: 502, headers: CORS_HEADERS });
      }
      const files = await listRes.json();
      return new Response(JSON.stringify({
        patient_id, session_id: session_id ?? null, prefix,
        files: (files || []).map((f: any) => ({ name: f.name, path: `${prefix}${f.name}`, created_at: f.created_at, size: f.metadata?.size ?? null }))
      }), { headers: CORS_HEADERS });

    } catch (error) {
      console.error("Biometricas GET error:", error);
      return new Response(JSON.stringify({
        error: "Error interno al leer biométricos",
        details: error instanceof Error ? error.message : String(error)
      }), { status: 500, headers: CORS_HEADERS });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: CORS_HEADERS });
};

export const config: Config = {
  path: "/api/biometricas"
};
