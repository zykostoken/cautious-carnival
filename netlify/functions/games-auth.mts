import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Login with access code
      if (action === "login") {
        const { code, displayName } = body;

        if (!code) {
          return new Response(JSON.stringify({
            error: "Codigo de acceso requerido"
          }), { status: 400, headers: corsHeaders });
        }

        const normalizedCode = code.trim().toUpperCase();

        // Find valid access code
        const [accessCode] = await sql`
          SELECT id, code, name, type, max_uses, current_uses, valid_from, valid_until, is_active
          FROM game_access_codes
          WHERE code = ${normalizedCode}
            AND is_active = TRUE
            AND (valid_from IS NULL OR valid_from <= NOW())
            AND (valid_until IS NULL OR valid_until > NOW())
        `;

        if (!accessCode) {
          return new Response(JSON.stringify({
            error: "Codigo de acceso invalido o expirado"
          }), { status: 401, headers: corsHeaders });
        }

        // Check max uses
        if (accessCode.max_uses !== null && accessCode.current_uses >= accessCode.max_uses) {
          return new Response(JSON.stringify({
            error: "Este codigo ha alcanzado el limite de usos"
          }), { status: 401, headers: corsHeaders });
        }

        // Create session
        const sessionToken = generateSessionToken();
        const userAgent = req.headers.get('user-agent') || null;

        await sql`
          INSERT INTO game_access_sessions (access_code_id, session_token, display_name, user_agent)
          VALUES (${accessCode.id}, ${sessionToken}, ${displayName || null}, ${userAgent})
        `;

        // Update code usage
        await sql`
          UPDATE game_access_codes
          SET current_uses = current_uses + 1,
              last_used_at = NOW()
          WHERE id = ${accessCode.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          sessionToken,
          user: {
            codeName: accessCode.name,
            codeType: accessCode.type,
            displayName: displayName || null
          },
          message: "Acceso autorizado. Bienvenido/a!"
        }), { status: 200, headers: corsHeaders });
      }

      // Logout
      if (action === "logout") {
        const { sessionToken } = body;

        if (sessionToken) {
          await sql`
            DELETE FROM game_access_sessions
            WHERE session_token = ${sessionToken}
          `;
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Sesion cerrada"
        }), { status: 200, headers: corsHeaders });
      }

      // Save game session (score tracking)
      if (action === "save_game_session") {
        const { sessionToken, gameSlug, level, score, maxScore, durationSeconds, completed, metrics } = body;

        if (!sessionToken || !gameSlug) {
          return new Response(JSON.stringify({
            error: "Token y juego requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Verify session
        const [session] = await sql`
          SELECT id FROM game_access_sessions
          WHERE session_token = ${sessionToken}
        `;

        if (!session) {
          return new Response(JSON.stringify({
            error: "Sesion invalida"
          }), { status: 401, headers: corsHeaders });
        }

        // Get game id
        const [game] = await sql`
          SELECT id FROM hdd_games WHERE slug = ${gameSlug}
        `;

        if (!game) {
          return new Response(JSON.stringify({
            error: "Juego no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        // Save game session
        await sql`
          INSERT INTO external_game_sessions
          (access_session_id, game_id, level, score, max_score, duration_seconds, completed, metrics, completed_at)
          VALUES (
            ${session.id},
            ${game.id},
            ${level || 1},
            ${score || 0},
            ${maxScore || 0},
            ${durationSeconds || null},
            ${completed || false},
            ${JSON.stringify(metrics || {})},
            ${completed ? sql`NOW()` : null}
          )
        `;

        // Update session last activity
        await sql`
          UPDATE game_access_sessions
          SET last_activity = NOW()
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Sesion de juego guardada"
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Accion invalida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Games Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({
        error: "Error interno del servidor",
        details: errorMessage
      }), { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const action = url.searchParams.get("action");

    // Verify session
    if (action === "verify" && sessionToken) {
      try {
        const [session] = await sql`
          SELECT
            s.id,
            s.display_name,
            s.created_at,
            c.name as code_name,
            c.type as code_type
          FROM game_access_sessions s
          JOIN game_access_codes c ON s.access_code_id = c.id
          WHERE s.session_token = ${sessionToken}
            AND c.is_active = TRUE
        `;

        if (!session) {
          return new Response(JSON.stringify({
            valid: false,
            error: "Sesion invalida o expirada"
          }), { status: 401, headers: corsHeaders });
        }

        // Update last activity
        await sql`
          UPDATE game_access_sessions
          SET last_activity = NOW()
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          valid: true,
          user: {
            codeName: session.code_name,
            codeType: session.code_type,
            displayName: session.display_name
          }
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Session verification error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    // Get available games
    if (action === "games") {
      try {
        const games = await sql`
          SELECT slug, name, description, therapeutic_areas, icon, difficulty_levels
          FROM hdd_games
          WHERE is_active = TRUE
          ORDER BY name
        `;

        return new Response(JSON.stringify({
          games: games.map(g => ({
            slug: g.slug,
            name: g.name,
            description: g.description,
            therapeuticAreas: g.therapeutic_areas,
            icon: g.icon,
            difficultyLevels: g.difficulty_levels
          }))
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Games list error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Accion requerida" }),
      { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Metodo no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/games/auth"
};
