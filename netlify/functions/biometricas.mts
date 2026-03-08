import type { Context, Config } from "@netlify/functions";
import { getCorsHeaders } from "./lib/auth.mts";
import { getDatabase } from "./lib/db.mts";

// Biometricas - Supabase Storage bucket handler
// Now requires authentication (H-048 fix)

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  return { url, serviceKey };
}

async function verifyAccess(req: Request): Promise<{ ok: boolean; patientId?: number }> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    || new URL(req.url).searchParams.get('sessionToken');
  if (!token) return { ok: false };
  try {
    const sql = getDatabase();
    const [patient] = await sql`SELECT id FROM hdd_patients WHERE session_token = ${token} AND status = 'active'`;
    if (patient) return { ok: true, patientId: patient.id };
    const [prof] = await sql`SELECT id FROM healthcare_professionals WHERE session_token = ${token} AND is_active = TRUE`;
    if (prof) return { ok: true };
  } catch (e) { console.error('Auth check failed:', e); }
  return { ok: false };
}

export default async (req: Request, context: Context) => {
  const h = getCorsHeaders(req.headers.get('origin'));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

  const access = await verifyAccess(req);
  if (!access.ok) return new Response(JSON.stringify({ error: "Autenticacion requerida" }), { status: 401, headers: h });

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { patient_id, session_id, game_slug, level, biometric_data } = body;
      if (!patient_id || !session_id || !game_slug || !biometric_data)
        return new Response(JSON.stringify({ error: "patient_id, session_id, game_slug y biometric_data son requeridos" }), { status: 400, headers: h });
      if (access.patientId && access.patientId !== patient_id)
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: h });

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const levelSuffix = level !== undefined ? `_nivel${level}` : '';
      const filePath = `${patient_id}/${session_id}/${game_slug}${levelSuffix}_${timestamp}.json`;
      const payload = JSON.stringify({ patient_id, session_id, game_slug, level: level ?? null, recorded_at: new Date().toISOString(), ...biometric_data }, null, 2);

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/biometricas/${filePath}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json", "x-upsert": "true" },
        body: payload
      });
      if (!uploadRes.ok) { console.error("Upload error:", await uploadRes.text()); return new Response(JSON.stringify({ error: "Error al subir datos" }), { status: 502, headers: h }); }
      return new Response(JSON.stringify({ success: true, path: filePath }), { status: 201, headers: h });
    } catch (error) {
      console.error("Biometricas POST error:", error);
      return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: h });
    }
  }

  if (req.method === "GET") {
    try {
      const reqUrl = new URL(req.url);
      const patient_id = reqUrl.searchParams.get("patient_id");
      const session_id = reqUrl.searchParams.get("session_id");
      const file_path = reqUrl.searchParams.get("file_path");
      if (!patient_id) return new Response(JSON.stringify({ error: "patient_id es requerido" }), { status: 400, headers: h });
      if (access.patientId && access.patientId !== parseInt(patient_id))
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: h });

      const { url: supabaseUrl, serviceKey } = getSupabaseConfig();
      if (file_path) {
        const dlRes = await fetch(`${supabaseUrl}/storage/v1/object/biometricas/${file_path}`, { headers: { "Authorization": `Bearer ${serviceKey}` } });
        if (!dlRes.ok) return new Response(JSON.stringify({ error: "Archivo no encontrado" }), { status: 404, headers: h });
        return new Response(JSON.stringify({ data: await dlRes.json() }), { status: 200, headers: h });
      }

      const prefix = session_id ? `${patient_id}/${session_id}/` : `${patient_id}/`;
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/biometricas`, {
        method: "POST", headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 500, offset: 0, sortBy: { column: "created_at", order: "desc" } })
      });
      if (!listRes.ok) return new Response(JSON.stringify({ error: "Error al listar" }), { status: 502, headers: h });
      const files = await listRes.json();
      return new Response(JSON.stringify({ patient_id, files: (files || []).map((f: any) => ({ name: f.name, path: `${prefix}${f.name}`, created_at: f.created_at })) }), { status: 200, headers: h });
    } catch (error) {
      console.error("Biometricas GET error:", error);
      return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: h });
    }
  }

  return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: h });
};

export const config: Config = { path: "/api/biometricas" };
