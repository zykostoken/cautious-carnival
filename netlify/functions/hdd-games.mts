import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { sendEmailNotification } from "./lib/notifications.mts";
import { checkEntitlement, recordUsage } from "./lib/entitlements.mts";
import { getCorsHeaders, isSessionExpired, escapeHtml, SESSION_TTL, checkDailyGamingLimit, hashSessionToken } from "./lib/auth.mts";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";

async function getPatientBySession(sql: any, sessionToken: string) {
  const hashedToken = await hashSessionToken(sessionToken);
  const [patient] = await sql`
    SELECT id, dni, full_name, status, last_login
    FROM hdd_patients
    WHERE session_token = ${hashedToken} AND status = 'active'
  `;
  if (!patient) return null;
  // Enforce session expiry (H-005: 60min therapy TTL)
  if (isSessionExpired(patient.last_login, SESSION_TTL.PATIENT)) return null;
  return patient;
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET: list games, check availability, get progress
  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    // SEC-003: Accept token from Authorization header, sessionToken, or token param
    const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '')
      || url.searchParams.get("sessionToken")
      || url.searchParams.get("token");

    if (!sessionToken) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });
    }

    const patient = await getPatientBySession(sql, sessionToken);
    if (!patient) {
      return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: corsHeaders });
    }

    // Check gaming entitlement (plan-based access control)
    // NOTE: Only enforce if patient has a plan assigned. If no plan exists,
    // allow access (backward compat - plans not yet rolled out to all patients)
    try {
      const entitlement = await checkEntitlement(sql, patient.id, 'gaming');
      if (entitlement.planType && !entitlement.allowed) {
        // Patient HAS a plan but gaming is not allowed under it
        return new Response(JSON.stringify({
          error: "Acceso restringido",
          message: entitlement.reason,
          planType: entitlement.planType,
          requiresPrescription: entitlement.requiresPrescription,
          hasPrescription: entitlement.hasPrescription
        }), { status: 403, headers: corsHeaders });
      }
      // If planType is null → no plan assigned → allow access (legacy behavior)
    } catch (e) {
      // Tables don't exist yet → allow access
      console.log('Entitlement check skipped:', e);
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

      let schedules: any[] = [];
      try {
        schedules = await sql`
          SELECT game_id, available_from, available_until
          FROM hdd_game_schedule
          WHERE is_active = TRUE AND (day_of_week = ${currentDay} OR day_of_week IS NULL)
        `;
      } catch (e) {
        // Schedule table might not exist yet
      }

      const scheduledGameIds = new Set<number>();
      const availableSet = new Set<number>();
      for (const s of schedules) {
        scheduledGameIds.add(s.game_id);
        const from = s.available_from.slice(0, 5);
        const until = s.available_until.slice(0, 5);
        if (currentTimeStr >= from && currentTimeStr <= until) {
          availableSet.add(s.game_id);
        }
      }

      const result = games.map((g: any) => ({
        ...g,
        progress: progressMap[g.id] || null,
        // If game has no schedule defined, it's always available
        available: !scheduledGameIds.has(g.id) || availableSet.has(g.id),
      }));

      return new Response(JSON.stringify({ games: result }), { headers: corsHeaders });
    }

    // Get patient profile (used by metrics.html)
    if (action === "profile") {
      return new Response(JSON.stringify({
        patient: {
          id: patient.id,
          dni: patient.dni,
          full_name: patient.full_name,
          status: patient.status
        }
      }), { headers: corsHeaders });
    }

    // Get patient metrics / session analysis (used by metrics.html)
    if (action === "metrics") {
      try {
        const sessions = await sql`
          SELECT
            gs.id AS session_id,
            g.slug AS game_type,
            gs.score,
            gs.duration_seconds AS session_duration_seconds,
            gs.completed,
            gs.started_at,
            gs.completed_at,
            gs.metrics AS game_metrics,
            me.color_hex AS post_color_hex,
            me.color_name AS post_intensity
          FROM hdd_game_sessions gs
          LEFT JOIN hdd_games g ON g.id = gs.game_id
          LEFT JOIN LATERAL (
            SELECT me2.color_hex, me2.color_name
            FROM hdd_mood_entries me2
            WHERE me2.patient_id = gs.patient_id
              AND me2.created_at >= gs.started_at
              AND me2.created_at <= COALESCE(gs.completed_at, gs.started_at + interval '2 hours')
            ORDER BY me2.created_at DESC
            LIMIT 1
          ) me ON true
          WHERE gs.patient_id = ${patient.id}
          ORDER BY gs.completed_at DESC NULLS LAST
          LIMIT 200
        `;
        return new Response(JSON.stringify({ sessions }), { headers: corsHeaders });
      } catch (err: any) {
        console.error("Metrics query error:", err);
        return new Response(JSON.stringify({ sessions: [], error: "Error al cargar métricas" }), { headers: corsHeaders });
      }
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
      const { action } = body;
      // SEC-003: Accept token from body, header, or alternate field name
      const sessionToken = body.sessionToken || body.token
        || req.headers.get('Authorization')?.replace('Bearer ', '');

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

        // Enforce daily gaming limit: 1hr/day across all games
        const gamingLimit = await checkDailyGamingLimit(sql, patient.id);
        if (!gamingLimit.allowed) {
          return new Response(JSON.stringify({
            error: "Límite diario alcanzado",
            message: "Has alcanzado el límite de 1 hora de juego por día. Volvé mañana.",
            dailyLimitReached: true,
            usedMinutes: Math.round(gamingLimit.usedMs / 60000)
          }), { status: 429, headers: corsHeaders });
        }

        const [game] = await sql`SELECT id FROM hdd_games WHERE slug = ${gameSlug} AND is_active = TRUE`;
        if (!game) {
          return new Response(JSON.stringify({ error: "Juego no encontrado" }), { status: 404, headers: corsHeaders });
        }

        const [session] = await sql`
          INSERT INTO hdd_game_sessions (patient_id, game_id, level)
          VALUES (${patient.id}, ${game.id}, ${level || 1})
          RETURNING id, started_at
        `;

        // Record service usage for entitlement tracking
        recordUsage(sql, patient.id, 'gaming', `game_session:${session.id}`).catch(() => {});

        return new Response(JSON.stringify({
          success: true,
          sessionId: session.id,
          startedAt: session.started_at,
          dailyRemainingMinutes: Math.round(gamingLimit.remainingMs / 60000)
        }), { headers: corsHeaders });
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
        const { 
          mood, 
          note, 
          colorHex, 
          colorIntensity, 
          context: checkinContext,
          // New 3-phase system fields
          phase,  // 'pre' or 'post'
          chat_responses,  // Array of {question, answer}
          intensity,  // 'vivid', 'soft', 'pastel', 'dark', 'muted'
          color_hex,  // Selected color
          game_metrics  // Game performance data
        } = body;

        // Support both old (mood 1-5) and new (phase-based) systems
        const isNewSystem = phase && (phase === 'pre' || phase === 'post');
        
        if (!isNewSystem && (!mood || mood < 1 || mood > 5)) {
          return new Response(JSON.stringify({ error: "Valor de estado de animo invalido" }), { status: 400, headers: corsHeaders });
        }

        // Save mood check-in with new 3-phase support
        if (isNewSystem) {
          // New 3-phase system
          if (phase === 'pre') {
            // Pre-game: Save chat responses
            await sql`
              INSERT INTO hdd_mood_checkins (patient_id, mood_value, note, color_hex, color_intensity, context, created_at)
              VALUES (
                ${patient.id}, 
                NULL,  -- No mood value for pre-game
                ${chat_responses ? JSON.stringify(chat_responses) : null}, 
                NULL,  -- No color yet
                NULL,  -- No intensity yet
                'pre_game_chat', 
                NOW()
              )
            `;
          } else if (phase === 'post') {
            // Post-game: Save intensity + color + game metrics
            await sql`
              INSERT INTO hdd_mood_checkins (patient_id, mood_value, note, color_hex, color_intensity, context, created_at)
              VALUES (
                ${patient.id}, 
                NULL,  -- No numeric mood in new system
                ${game_metrics ? JSON.stringify(game_metrics) : null}, 
                ${color_hex || null}, 
                ${intensity || null}, 
                'post_game_projective', 
                NOW()
              )
            `;
          }
        } else {
          // Old system: backward compatibility
          await sql`
            INSERT INTO hdd_mood_checkins (patient_id, mood_value, note, color_hex, color_intensity, context, created_at)
            VALUES (${patient.id}, ${mood}, ${note || null}, ${colorHex || null}, ${colorIntensity || null}, ${checkinContext || 'daily_checkin'}, NOW())
          `;
        }

        // Log interaction
        try {
          await sql`
            INSERT INTO hdd_interaction_log (patient_id, interaction_type, details, created_at)
            VALUES (${patient.id}, 'mood_checkin', ${JSON.stringify({ 
              phase, 
              mood, 
              colorHex: color_hex || colorHex, 
              colorIntensity: intensity || colorIntensity, 
              context: checkinContext || (phase ? `${phase}_game` : 'daily_checkin')
            })}, NOW())
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
              <p><strong>Paciente:</strong> ${escapeHtml(patient.full_name)} (DNI: ${escapeHtml(patient.dni)})</p>
              <p><strong>Razon:</strong> ${escapeHtml(alertReason)}</p>
              <p><strong>Estado de animo reportado:</strong> ${mood}/5</p>
              ${note ? `<p><strong>Nota del paciente:</strong> ${escapeHtml(note)}</p>` : ''}
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

      // No matching action found
      return new Response(JSON.stringify({ error: "Acción inválida" }), { status: 400, headers: corsHeaders });

    } catch (err: any) {
      console.error("HDD Games error:", err);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
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
