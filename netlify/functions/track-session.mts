import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const sql = getDatabase();
    const body = await req.json();
    const { sessionId, eventType, data } = body;

    if (!sessionId || !eventType) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Handle different event types
    switch (eventType) {
      case "session_start":
        await sql`
          INSERT INTO user_sessions (
            session_id,
            started_at,
            last_activity,
            user_agent,
            referrer
          )
          VALUES (
            ${sessionId},
            NOW(),
            NOW(),
            ${data?.userAgent || null},
            ${data?.referrer || null}
          )
          ON CONFLICT (session_id)
          DO UPDATE SET last_activity = NOW()
        `;
        break;

      case "section_view":
        await sql`
          INSERT INTO section_views (session_id, section_id, viewed_at)
          VALUES (${sessionId}, ${data?.sectionId}, NOW())
          ON CONFLICT (session_id, section_id)
          DO UPDATE SET view_count = section_views.view_count + 1, last_viewed_at = NOW()
        `;

        // Update session activity
        await sql`
          UPDATE user_sessions
          SET last_activity = NOW(),
              sections_viewed = sections_viewed + 1
          WHERE session_id = ${sessionId}
        `;
        break;

      case "modal_open":
        await sql`
          INSERT INTO modal_opens (session_id, modal_id, opened_at)
          VALUES (${sessionId}, ${data?.modalId}, NOW())
        `;
        break;

      case "contact_click":
        await sql`
          INSERT INTO contact_interactions (session_id, contact_type, contact_value, clicked_at)
          VALUES (${sessionId}, ${data?.contactType}, ${data?.contactValue || null}, NOW())
        `;
        break;

      case "telemedicina_preregistro":
        // Save to dedicated telemedicine_interest table
        if (data?.email) {
          await sql`
            INSERT INTO telemedicine_interest (email, session_id, source, created_at)
            VALUES (${data.email}, ${sessionId}, ${data?.source || 'modal'}, NOW())
            ON CONFLICT (email) DO UPDATE SET session_id = EXCLUDED.session_id
          `;
          // Also log in generic_events for audit purposes
          await sql`
            INSERT INTO generic_events (session_id, event_type, event_data, created_at)
            VALUES (${sessionId}, ${eventType}, ${JSON.stringify(data || {})}, NOW())
          `;
        }
        break;

      case "heartbeat":
        await sql`
          UPDATE user_sessions
          SET last_activity = NOW(),
              time_on_site_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
          WHERE session_id = ${sessionId}
        `;
        break;

      default:
        // Generic event logging
        await sql`
          INSERT INTO generic_events (session_id, event_type, event_data, created_at)
          VALUES (${sessionId}, ${eventType}, ${JSON.stringify(data || {})}, NOW())
        `;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Session tracking error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/track"
};
