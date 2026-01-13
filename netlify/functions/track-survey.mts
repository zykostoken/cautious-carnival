import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const sql = neon();
    const body = await req.json();
    const { surveyId, response, sessionId } = body;

    if (!surveyId || !response || !sessionId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Insert survey response
    await sql`
      INSERT INTO survey_responses (session_id, survey_id, response, created_at)
      VALUES (${sessionId}, ${surveyId}, ${response}, NOW())
      ON CONFLICT (session_id, survey_id)
      DO UPDATE SET response = ${response}, updated_at = NOW()
    `;

    // Get aggregated stats for this survey
    const stats = await sql`
      SELECT
        response,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
      FROM survey_responses
      WHERE survey_id = ${surveyId}
      GROUP BY response
      ORDER BY count DESC
    `;

    return new Response(JSON.stringify({
      success: true,
      stats
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Survey tracking error:", error);
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
  path: "/api/survey"
};
