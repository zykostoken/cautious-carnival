import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { getCorsHeaders } from "./lib/auth.mts";

// Public endpoint — establishment config is not secret
// Used by HCE headers, reports, footers, dossier generator

export default async (req: Request, context: Context) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: corsHeaders });
  }

  try {
    const sql = getDatabase();
    const url = new URL(req.url);
    const category = url.searchParams.get('category');

    let rows;
    if (category) {
      rows = await sql`SELECT key, value, category FROM establishment_config WHERE category = ${category} ORDER BY key`;
    } else {
      rows = await sql`SELECT key, value, category FROM establishment_config ORDER BY category, key`;
    }

    // Transform to object grouped by category
    const config: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!config[row.category]) config[row.category] = {};
      config[row.category][row.key] = row.value;
    }

    // Also provide flat key-value for simple lookups
    const flat: Record<string, string> = {};
    for (const row of rows) {
      flat[row.key] = row.value;
    }

    return new Response(JSON.stringify({ config, flat }),
      { status: 200, headers: corsHeaders });

  } catch (e) {
    console.error('[establishment-config] Error:', e);
    return new Response(JSON.stringify({ error: "Error al cargar configuración" }),
      { status: 500, headers: corsHeaders });
  }
};

export const config: Config = {
  path: "/api/establishment-config"
};
