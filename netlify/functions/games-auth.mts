import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Fallback access codes - used when database is unavailable
// This ensures partners can always access games even during DB outages
const FALLBACK_ACCESS_CODES: Record<string, { name: string; type: string }> = {
  'DEMO2024': { name: 'Demo - Acceso de Prueba', type: 'demo' },
  'PARTNER001': { name: 'Partner Externo - Codigo 1', type: 'partner' },
  'RESEARCH001': { name: 'Investigador - Codigo 1', type: 'researcher' },
};

// In-memory session store for fallback mode
const fallbackSessions = new Map<string, { codeName: string; codeType: string; displayName: string | null; createdAt: string }>();

export default async (req: Request, context: Context) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Try to get database connection, but don't fail if unavailable
  let sql: ReturnType<typeof getDatabase> | null = null;
  let dbAvailable = false;
  try {
    sql = getDatabase();
    dbAvailable = true;
  } catch (dbError) {
    console.warn("Database unavailable, using fallback mode:", dbError instanceof Error ? dbError.message : String(dbError));
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

        // Try database first
        if (sql && dbAvailable) {
          try {
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
          } catch (dbQueryError) {
            console.warn("Database query failed during login, falling back:", dbQueryError instanceof Error ? dbQueryError.message : String(dbQueryError));
            // Fall through to fallback validation below
          }
        }

        // Fallback: validate against built-in codes
        const fallbackCode = FALLBACK_ACCESS_CODES[normalizedCode];
        if (!fallbackCode) {
          return new Response(JSON.stringify({
            error: "Codigo de acceso invalido o expirado"
          }), { status: 401, headers: corsHeaders });
        }

        const sessionToken = generateSessionToken();
        fallbackSessions.set(sessionToken, {
          codeName: fallbackCode.name,
          codeType: fallbackCode.type,
          displayName: displayName || null,
          createdAt: new Date().toISOString()
        });

        return new Response(JSON.stringify({
          success: true,
          sessionToken,
          user: {
            codeName: fallbackCode.name,
            codeType: fallbackCode.type,
            displayName: displayName || null
          },
          message: "Acceso autorizado. Bienvenido/a!"
        }), { status: 200, headers: corsHeaders });
      }

      // Logout
      if (action === "logout") {
        const { sessionToken } = body;

        if (sessionToken) {
          // Remove from fallback sessions
          fallbackSessions.delete(sessionToken);

          // Try database cleanup
          if (sql && dbAvailable) {
            try {
              await sql`
                DELETE FROM game_access_sessions
                WHERE session_token = ${sessionToken}
              `;
            } catch (dbError) {
              console.warn("Database cleanup failed during logout:", dbError instanceof Error ? dbError.message : String(dbError));
            }
          }
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

        // Check fallback sessions first
        if (fallbackSessions.has(sessionToken)) {
          // In fallback mode, acknowledge but can't persist game data
          return new Response(JSON.stringify({
            success: true,
            message: "Sesion de juego registrada"
          }), { status: 200, headers: corsHeaders });
        }

        if (!sql || !dbAvailable) {
          return new Response(JSON.stringify({
            error: "Sesion invalida"
          }), { status: 401, headers: corsHeaders });
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
      // Check fallback sessions first
      const fallbackSession = fallbackSessions.get(sessionToken);
      if (fallbackSession) {
        return new Response(JSON.stringify({
          valid: true,
          user: {
            codeName: fallbackSession.codeName,
            codeType: fallbackSession.codeType,
            displayName: fallbackSession.displayName
          }
        }), { status: 200, headers: corsHeaders });
      }

      if (!sql || !dbAvailable) {
        return new Response(JSON.stringify({
          valid: false,
          error: "Sesion invalida o expirada"
        }), { status: 401, headers: corsHeaders });
      }

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
        return new Response(JSON.stringify({
          valid: false,
          error: "Sesion invalida o expirada"
        }), { status: 401, headers: corsHeaders });
      }
    }

    // Get available games
    if (action === "games") {
      if (!sql || !dbAvailable) {
        // Return hardcoded games list as fallback
        return new Response(JSON.stringify({
          games: [
            {
              slug: "lawn-mower",
              name: "Cortadora de Cesped",
              description: "Juego de atencion y planificacion",
              therapeuticAreas: ["atencion", "planificacion"],
              icon: "🌿",
              difficultyLevels: [1, 2, 3]
            },
            {
              slug: "medication-memory",
              name: "Memoria de Medicacion",
              description: "Juego de memoria y asociacion",
              therapeuticAreas: ["memoria", "asociacion"],
              icon: "💊",
              difficultyLevels: [1, 2, 3]
            }
          ]
        }), { status: 200, headers: corsHeaders });
      }

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
        // Return hardcoded fallback on database error too
        return new Response(JSON.stringify({
          games: [
            {
              slug: "lawn-mower",
              name: "Cortadora de Cesped",
              description: "Juego de atencion y planificacion",
              therapeuticAreas: ["atencion", "planificacion"],
              icon: "🌿",
              difficultyLevels: [1, 2, 3]
            },
            {
              slug: "medication-memory",
              name: "Memoria de Medicacion",
              description: "Juego de memoria y asociacion",
              therapeuticAreas: ["memoria", "asociacion"],
              icon: "💊",
              difficultyLevels: [1, 2, 3]
            }
          ]
        }), { status: 200, headers: corsHeaders });
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
