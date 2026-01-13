import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

export default async (req: Request, context: Context) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const sql = neon();
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");

    // Get global analytics
    const [sessionStats] = await sql`
      SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        ROUND(AVG(time_on_site_seconds)::numeric, 0) as avg_time_seconds,
        ROUND(AVG(sections_viewed)::numeric, 1) as avg_sections
      FROM user_sessions
      WHERE started_at > NOW() - INTERVAL '30 days'
    `;

    // Get survey completion stats
    const surveyStats = await sql`
      SELECT
        survey_id,
        COUNT(DISTINCT session_id) as responses,
        json_agg(json_build_object('response', response, 'count', count)) as breakdown
      FROM (
        SELECT survey_id, response, COUNT(*) as count
        FROM survey_responses
        GROUP BY survey_id, response
      ) grouped
      GROUP BY survey_id
    `;

    // Get "intention of use" percentage (from positive survey responses)
    const [intentionStats] = await sql`
      SELECT
        ROUND(
          COUNT(CASE WHEN response ILIKE '%sí%' OR response ILIKE '%totalmente%' OR response ILIKE '%interesa%' THEN 1 END) * 100.0 /
          NULLIF(COUNT(*), 0),
          0
        ) as positive_intention_pct
      FROM survey_responses
    `;

    // Get session-specific data if sessionId provided
    let sessionData = null;
    if (sessionId) {
      const [session] = await sql`
        SELECT
          session_id,
          sections_viewed,
          EXTRACT(EPOCH FROM (last_activity - started_at)) as time_on_site_seconds
        FROM user_sessions
        WHERE session_id = ${sessionId}
      `;

      const surveysCompleted = await sql`
        SELECT COUNT(*) as count
        FROM survey_responses
        WHERE session_id = ${sessionId}
      `;

      sessionData = {
        ...session,
        surveysCompleted: surveysCompleted[0]?.count || 0
      };
    }

    return new Response(JSON.stringify({
      global: {
        totalSessions: sessionStats?.total_sessions || 0,
        avgTimeSeconds: sessionStats?.avg_time_seconds || 0,
        avgSectionsViewed: sessionStats?.avg_sections || 0,
        positiveIntentionPct: intentionStats?.positive_intention_pct || 0
      },
      surveys: surveyStats,
      session: sessionData
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Analytics error:", error);
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
  path: "/api/analytics"
};
