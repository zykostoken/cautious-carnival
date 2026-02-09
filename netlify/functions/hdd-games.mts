import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { sendEmailNotification } from "./lib/notifications.mts";

const ADMIN_EMAIL = "direccionmedica@clinicajoseingenieros.ar";

async function getPatientBySession(sql: any, sessionToken: string) {
  const [patient] = await sql`
    SELECT id, dni, full_name, status
    FROM hdd_patients
    WHERE session_token = ${sessionToken} AND status = 'active'
  `;
  return patient;
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

  // GET: list games, check availability, get progress
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const sessionToken = url.searchParams.get("sessionToken");

    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });
    }

    const patient = await getPatientBySession(sql, sessionToken);
    if (!patient) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: corsHeaders });
    }

    // List all games with availability and progress
    if (action === "list") {
      const games = await sql`
        SELECT g.id, g.slug, g.name, g.description, g.therapeutic_areas, g.icon, g.difficulty_levels
        FROM hdd_games g
        WHERE g.is_active = TRUE
        ORDER BY g.id
      `;

      // Get progress for this patient
      const progress = await sql`
        SELECT game_id, current_level, max_level_reached, total_sessions, best_score, average_score, last_played_at
        FROM hdd_game_progress
        WHERE patient_id = ${patient.id}
      `;

      const progressMap: Record<number, any> = {};
      for (const p of progress) {
        progressMap[p.game_id] = p;
      }

      // Check schedule availability (current Argentina time)
      const now = new Date();
      const argTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      const currentDay = argTime.getDay();
      const currentTimeStr = argTime.toTimeString().slice(0, 5);

      const schedules = await sql`
        SELECT game_id, available_from, available_until
        FROM hdd_game_schedule
        WHERE is_active = TRUE AND day_of_week = ${currentDay}
      `;

      const availableSet = new Set<number>();
      for (const s of schedules) {
        const from = s.available_from.slice(0, 5);
        const until = s.available_until.slice(0, 5);
        if (currentTimeStr >= from && currentTimeStr <= until) {
          availableSet.add(s.game_id);
        }
      }

      const result = games.map((g: any) => ({
        ...g,
        progress: progressMap[g.id] || null,
        available: availableSet.has(g.id),
      }));

      return new Response(JSON.stringify({ games: result }), { headers: corsHeaders });
    }

    // Get game details with recent sessions
    if (action === "detail") {
      const gameSlug = url.searchParams.get("game");
      if (!gameSlug) {
        return new Response(JSON.stringify({ error: "Juego no especificado" }), { status: 400, headers: corsHeaders });
      }

      const [game] = await sql`SELECT * FROM hdd_games WHERE slug = ${gameSlug} AND is_active = TRUE`;
      if (!game) {
        return new Response(JSON.stringify({ error: "Juego no encontrado" }), { status: 404, headers: corsHeaders });
      }

      const [progress] = await sql`
        SELECT * FROM hdd_game_progress
        WHERE patient_id = ${patient.id} AND game_id = ${game.id}
      `;

      const recentSessions = await sql`
        SELECT id, level, score, max_score, duration_seconds, completed, metrics, started_at, completed_at
        FROM hdd_game_sessions
        WHERE patient_id = ${patient.id} AND game_id = ${game.id}
        ORDER BY started_at DESC
        LIMIT 10
      `;

      return new Response(JSON.stringify({
        game,
        progress: progress || null,
        recentSessions,
      }), { headers: corsHeaders });
    }
  }

  // POST: start session, save score, update progress
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action, sessionToken } = body;

      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });
      }

      const patient = await getPatientBySession(sql, sessionToken);
      if (!patient) {
        return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: corsHeaders });
      }

      // Start a new game session
      if (action === "start_session") {
        const { gameSlug, level } = body;

        const [game] = await sql`SELECT id FROM hdd_games WHERE slug = ${gameSlug} AND is_active = TRUE`;
        if (!game) {
          return new Response(JSON.stringify({ error: "Juego no encontrado" }), { status: 404, headers: corsHeaders });
        }

        const [session] = await sql`
          INSERT INTO hdd_game_sessions (patient_id, game_id, level)
          VALUES (${patient.id}, ${game.id}, ${level || 1})
          RETURNING id, started_at
        `;

        return new Response(JSON.stringify({ success: true, sessionId: session.id, startedAt: session.started_at }), { headers: corsHeaders });
      }

      // Save game result
      if (action === "save_result") {
        const { gameSessionId, score, maxScore, durationSeconds, completed, metrics } = body;

        if (!gameSessionId) {
          return new Response(JSON.stringify({ error: "Sesión de juego no especificada" }), { status: 400, headers: corsHeaders });
        }

        // Update game session
        const [session] = await sql`
          UPDATE hdd_game_sessions
          SET score = ${score || 0},
              max_score = ${maxScore || 0},
              duration_seconds = ${durationSeconds || 0},
              completed = ${completed || false},
              metrics = ${JSON.stringify(metrics || {})},
              completed_at = NOW()
          WHERE id = ${gameSessionId} AND patient_id = ${patient.id}
          RETURNING game_id, level
        `;

        if (!session) {
          return new Response(JSON.stringify({ error: "Sesión de juego no encontrada" }), { status: 404, headers: corsHeaders });
        }

        // Update progress (upsert)
        await sql`
          INSERT INTO hdd_game_progress (patient_id, game_id, current_level, max_level_reached, total_sessions, total_time_seconds, best_score, average_score, last_played_at, updated_at)
          VALUES (
            ${patient.id},
            ${session.game_id},
            ${session.level},
            ${session.level},
            1,
            ${durationSeconds || 0},
            ${score || 0},
            ${score || 0},
            NOW(),
            NOW()
          )
          ON CONFLICT (patient_id, game_id) DO UPDATE SET
            current_level = GREATEST(hdd_game_progress.current_level, ${session.level}),
            max_level_reached = GREATEST(hdd_game_progress.max_level_reached, ${session.level}),
            total_sessions = hdd_game_progress.total_sessions + 1,
            total_time_seconds = hdd_game_progress.total_time_seconds + ${durationSeconds || 0},
            best_score = GREATEST(hdd_game_progress.best_score, ${score || 0}),
            average_score = (hdd_game_progress.average_score * hdd_game_progress.total_sessions + ${score || 0}) / (hdd_game_progress.total_sessions + 1),
            last_played_at = NOW(),
            updated_at = NOW()
        `;

        return new Response(JSON.stringify({
          success: true,
          score,
          completed,
          level: session.level,
        }), { headers: corsHeaders });
      }

      // Save daily mood check-in
      if (action === "mood_checkin") {
        const { mood, note, colorHex, colorIntensity, context: checkinContext } = body;

        if (!mood || mood < 1 || mood > 5) {
          return new Response(JSON.stringify({ error: "Valor de estado de animo invalido" }), { status: 400, headers: corsHeaders });
        }

        // Save mood check-in with color data
        await sql`
          INSERT INTO hdd_mood_checkins (patient_id, mood_value, note, color_hex, color_intensity, context, created_at)
          VALUES (${patient.id}, ${mood}, ${note || null}, ${colorHex || null}, ${colorIntensity || null}, ${checkinContext || 'daily_checkin'}, NOW())
        `;

        // Log interaction
        try {
          await sql`
            INSERT INTO hdd_interaction_log (patient_id, interaction_type, details, created_at)
            VALUES (${patient.id}, 'mood_checkin', ${JSON.stringify({ mood, colorHex, colorIntensity, context: checkinContext || 'daily_checkin' })}, NOW())
          `;
        } catch (e) {
          // Table may not exist yet
        }

        // Check for crisis protocol triggers
        // Trigger if: mood is 1 (very bad), or 3+ days with low mood, or keywords in note
        let alertTriggered = false;
        let alertReason = '';

        // Check if very low mood
        if (mood === 1) {
          alertTriggered = true;
          alertReason = 'Estado de animo muy bajo reportado';
        }

        // Check for concerning keywords in note
        if (note) {
          const concerningKeywords = ['suicid', 'morir', 'no puedo mas', 'terminar', 'daño', 'cortar', 'pastillas'];
          const lowerNote = note.toLowerCase();
          for (const keyword of concerningKeywords) {
            if (lowerNote.includes(keyword)) {
              alertTriggered = true;
              alertReason = 'Contenido de riesgo detectado en nota';
              break;
            }
          }
        }

        // Check for pattern of low moods (3+ days with mood <= 2)
        const recentMoods = await sql`
          SELECT mood_value, created_at
          FROM hdd_mood_checkins
          WHERE patient_id = ${patient.id}
          ORDER BY created_at DESC
          LIMIT 5
        `;

        if (recentMoods.length >= 3) {
          const lowMoodCount = recentMoods.slice(0, 3).filter((m: any) => m.mood_value <= 2).length;
          if (lowMoodCount >= 3) {
            alertTriggered = true;
            alertReason = 'Patron de estado de animo bajo sostenido (3+ dias)';
          }
        }

        // If alert triggered, create crisis alert and notify admin
        if (alertTriggered) {
          await sql`
            INSERT INTO hdd_crisis_alerts (patient_id, alert_type, reason, mood_value, note, status, created_at)
            VALUES (${patient.id}, 'mood_checkin', ${alertReason}, ${mood}, ${note || null}, 'pending', NOW())
          `;

          // Send email notification to admin
          try {
            await sendEmailNotification(
              ADMIN_EMAIL,
              `[HDD ALERTA] ${alertReason} - Paciente ${patient.full_name}`,
              `<h2>Alerta de Protocolo de Crisis - Hospital de Dia</h2>
              <p><strong>Paciente:</strong> ${patient.full_name} (DNI: ${patient.dni})</p>
              <p><strong>Razon:</strong> ${alertReason}</p>
              <p><strong>Estado de animo reportado:</strong> ${mood}/5</p>
              ${note ? `<p><strong>Nota del paciente:</strong> ${note}</p>` : ''}
              <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
              <hr>
              <p style="color: #666;">Este es un mensaje automatico del sistema HDD. Ingrese al <a href="https://clinicajoseingenieros.ar/hdd/admin">Panel de Administracion</a> para revisar.</p>`
            );
          } catch (emailErr) {
            console.error('Failed to send crisis alert email:', emailErr);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          mood,
          alertTriggered
        }), { headers: corsHeaders });
      }

      // Save color selection during game
      if (action === "save_color") {
        const { colorHex, colorIntensity, gameSessionId, context: colorContext } = body;

        if (!colorHex) {
          return new Response(JSON.stringify({ error: "Color requerido" }), { status: 400, headers: corsHeaders });
        }

        await sql`
          INSERT INTO hdd_game_color_selections (patient_id, game_session_id, color_hex, color_intensity, context, created_at)
          VALUES (${patient.id}, ${gameSessionId || null}, ${colorHex}, ${colorIntensity || 'vivid'}, ${colorContext || 'during_game'}, NOW())
        `;

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Save detailed game metrics
      if (action === "save_game_metrics") {
        const { gameSessionId, gameSlug, metricType, metricValue, metricData } = body;

        if (!metricType) {
          return new Response(JSON.stringify({ error: "Tipo de metrica requerido" }), { status: 400, headers: corsHeaders });
        }

        await sql`
          INSERT INTO hdd_game_metrics (patient_id, game_session_id, game_slug, metric_type, metric_value, metric_data, created_at)
          VALUES (${patient.id}, ${gameSessionId || null}, ${gameSlug || null}, ${metricType}, ${metricValue || null}, ${JSON.stringify(metricData || {})}, NOW())
        `;

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // Log interaction
      if (action === "log_interaction") {
        const { interactionType, details } = body;

        if (!interactionType) {
          return new Response(JSON.stringify({ error: "Tipo de interaccion requerido" }), { status: 400, headers: corsHeaders });
        }

        await sql`
          INSERT INTO hdd_interaction_log (patient_id, interaction_type, details, created_at)
          VALUES (${patient.id}, ${interactionType}, ${JSON.stringify(details || {})}, NOW())
        `;

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

    } catch (err: any) {
      console.error("HDD Games error:", err);
      return new Response(JSON.stringify({ error: "Error interno del servidor", details: err.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }

  return new Response(JSON.stringify({ error: "Método no soportado" }), { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/hdd/games"
};
