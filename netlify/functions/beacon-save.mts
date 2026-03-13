import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Beacon save endpoint — receives partial game data via navigator.sendBeacon
// This is fire-and-forget: no response expected by the client
// Used when a patient closes the game tab mid-session

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 204 });
  }

  try {
    const body = await req.json();
    const { table, data } = body;

    // Only allow saving to hdd_game_metrics
    if (table !== 'hdd_game_metrics') {
      return new Response(null, { status: 400 });
    }

    // Validate required fields
    if (!data || !data.patient_id || !data.game_slug) {
      return new Response(null, { status: 400 });
    }

    const sql = getDatabase();

    await sql`
      INSERT INTO hdd_game_metrics (patient_id, patient_dni, game_slug, metric_type, metric_value, metric_data, session_date, created_at)
      VALUES (
        ${data.patient_id},
        ${data.patient_dni || null},
        ${data.game_slug},
        ${data.metric_type || 'partial_interrupted'},
        ${data.metric_value || 0},
        ${JSON.stringify(data.metric_data || {})},
        ${data.session_date || new Date().toISOString().slice(0, 10)},
        ${data.created_at || new Date().toISOString()}
      )
    `;

    return new Response(null, { status: 204 });
  } catch (e) {
    console.error('[beacon-save] Error:', e);
    return new Response(null, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/beacon-save"
};
