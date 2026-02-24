import type { Context, Config } from "@netlify/functions";

// Biometricas - Supabase Storage bucket handler
// Stores full biometric data (including raw action_log, tremor_details, hesitation_details)
// in the 'biometricas' Supabase Storage bucket as JSON files.
//
// File path structure: {patient_id}/{session_id}/{game_slug}_{level}_{timestamp}.json

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

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // POST /api/biometricas - Upload biometric data to bucket
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const {
        patient_id,
        session_id,
        game_slug,
        level,
        biometric_data
      } = body;

      if (!patient_id || !session_id || !game_slug || !biometric_data) {
        return new Response(JSON.stringify({
          error: "patient_id, session_id, game_slug y biometric_data son requeridos"
        }), { status: 400, headers: CORS_HEADERS });
      }

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const levelSuffix = level !== undefined ? `_nivel${level}` : '';
      const filename = `${game_slug}${levelSuffix}_${timestamp}.json`;
      const filePath = `${patient_id}/${session_id}/${filename}`;

      // Full biometric payload including raw details stripped in DB saves
      const payload = JSON.stringify({
        patient_id,
        session_id,
        game_slug,
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
        const errText = await uploadRes.text();
        console.error("Supabase Storage upload error:", errText);
        return new Response(JSON.stringify({
          error: "Error al subir datos al bucket biometricas",
          details: errText
        }), { status: 502, headers: CORS_HEADERS });
      }

      return new Response(JSON.stringify({
        success: true,
        path: filePath,
        message: "Datos biométricos guardados en bucket biometricas"
      }), { status: 201, headers: CORS_HEADERS });

    } catch (error) {
      console.error("Biometricas POST error:", error);
      return new Response(JSON.stringify({
        error: "Error interno al guardar biométricos",
        details: error instanceof Error ? error.message : String(error)
      }), { status: 500, headers: CORS_HEADERS });
    }
  }

  // GET /api/biometricas?patient_id=...&session_id=...
  // Lists or downloads biometric files for a patient/session
  if (req.method === "GET") {
    try {
      const reqUrl = new URL(req.url);
      const patient_id = reqUrl.searchParams.get("patient_id");
      const session_id = reqUrl.searchParams.get("session_id");
      const file_path = reqUrl.searchParams.get("file_path");

      if (!patient_id) {
        return new Response(JSON.stringify({
          error: "patient_id es requerido"
        }), { status: 400, headers: CORS_HEADERS });
      }

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();

      // If a specific file is requested, return its content
      if (file_path) {
        const downloadUrl = `${supabaseUrl}/storage/v1/object/biometricas/${file_path}`;
        const dlRes = await fetch(downloadUrl, {
          headers: { "Authorization": `Bearer ${serviceKey}` }
        });

        if (!dlRes.ok) {
          return new Response(JSON.stringify({ error: "Archivo no encontrado" }),
            { status: 404, headers: CORS_HEADERS });
        }

        const fileContent = await dlRes.json();
        return new Response(JSON.stringify({ data: fileContent }),
          { status: 200, headers: CORS_HEADERS });
      }

      // List files: if session_id provided, list that session; else list all patient sessions
      const prefix = session_id ? `${patient_id}/${session_id}/` : `${patient_id}/`;

      const listUrl = `${supabaseUrl}/storage/v1/object/list/biometricas`;
      const listRes = await fetch(listUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefix,
          limit: 500,
          offset: 0,
          sortBy: { column: "created_at", order: "desc" }
        })
      });

      if (!listRes.ok) {
        const errText = await listRes.text();
        return new Response(JSON.stringify({
          error: "Error al listar archivos del bucket biometricas",
          details: errText
        }), { status: 502, headers: CORS_HEADERS });
      }

      const files = await listRes.json();

      return new Response(JSON.stringify({
        patient_id,
        session_id: session_id ?? null,
        prefix,
        files: (files || []).map((f: any) => ({
          name: f.name,
          path: `${prefix}${f.name}`,
          created_at: f.created_at,
          updated_at: f.updated_at,
          size: f.metadata?.size ?? null
        }))
      }), { status: 200, headers: CORS_HEADERS });

    } catch (error) {
      console.error("Biometricas GET error:", error);
      return new Response(JSON.stringify({
        error: "Error interno al leer biométricos",
        details: error instanceof Error ? error.message : String(error)
      }), { status: 500, headers: CORS_HEADERS });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: CORS_HEADERS });
};

export const config: Config = {
  path: "/api/biometricas"
};
