import type { Context, Config } from "@netlify/functions";

// Daily.co room creation - sala nueva por cada sesión, se destruye sola
const DAILY_API = "https://api.daily.co/v1";

async function callDaily(path: string, method = "GET", body?: object) {
  const res = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily API error ${res.status}: ${err}`);
  }
  return res.json();
}

export default async (req: Request, context: Context) => {
  // Import CORS from auth module
  const { getCorsHeaders } = await import("./lib/auth.mts");
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Auth check: require professional session (H-049)
      const sessionToken = body.sessionToken || req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "Autenticacion requerida" }), { status: 401, headers: corsHeaders });
      }
      const { getDatabase: getDb } = await import("./lib/db.mts");
      const sql = getDb();
      const [prof] = await sql`SELECT id FROM healthcare_professionals WHERE session_token = ${sessionToken} AND is_active = TRUE`;
      if (!prof) {
        return new Response(JSON.stringify({ error: "Sesion profesional invalida" }), { status: 403, headers: corsHeaders });
      }

      // Crear sala nueva para una consulta
      if (action === "create_room") {
        // Default teleresource session: 30 min (H-005)
        const { sessionToken, patientName, professionalName, durationMinutes = 30 } = body;

        if (!sessionToken) {
          return new Response(
            JSON.stringify({ error: "sessionToken required" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Nombre de sala único, no descriptivo (privacidad)
        const roomName = `cji-${sessionToken.substring(0, 12)}`;

        // Expiración: ahora + duración + 15 min de gracia
        const expiresAt = Math.floor(Date.now() / 1000) + (durationMinutes + 15) * 60;

        const room = await callDaily("/rooms", "POST", {
          name: roomName,
          privacy: "private", // requiere token para entrar
          properties: {
            exp: expiresAt,
            max_participants: 4, // profesional + paciente + 2 extras (grupos pequeños)
            enable_chat: true,
            enable_screenshare: false, // desactivado por defecto (clínico)
            start_video_off: false,
            start_audio_off: false,
            // Sin grabación por defecto - privacidad del paciente
            enable_recording: "local", // solo local si el prof lo activa
            autojoin: false,
            lang: "es",
            // Se destruye automáticamente al expirar
            eject_at_room_exp: true,
          },
        });

        // Token para el profesional (owner - puede expulsar, silenciar)
        const profToken = await callDaily("/meeting-tokens", "POST", {
          properties: {
            room_name: roomName,
            is_owner: true,
            user_name: professionalName || "Profesional",
            exp: expiresAt,
            enable_recording: "local",
          },
        });

        // Token para el paciente (participante)
        const patientToken = await callDaily("/meeting-tokens", "POST", {
          properties: {
            room_name: roomName,
            is_owner: false,
            user_name: patientName || "Paciente",
            exp: expiresAt,
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            roomName,
            roomUrl: room.url,
            expiresAt: new Date(expiresAt * 1000).toISOString(),
            // URL con token del profesional
            professionalUrl: `${room.url}?t=${profToken.token}`,
            // URL con token del paciente
            patientUrl: `${room.url}?t=${patientToken.token}`,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Crear sala recurrente para grupo (p.ej. taller semanal)
      if (action === "create_recurring_room") {
        const { groupName, professionalId, maxParticipants = 10 } = body;

        const roomName = `cji-grupo-${groupName.toLowerCase().replace(/\s+/g, "-")}-${professionalId}`;

        // Intenta obtener la sala si ya existe
        try {
          const existing = await callDaily(`/rooms/${roomName}`);
          return new Response(
            JSON.stringify({
              success: true,
              roomName: existing.name,
              roomUrl: existing.url,
              existing: true,
            }),
            { status: 200, headers: corsHeaders }
          );
        } catch {
          // No existe, la creamos
        }

        const room = await callDaily("/rooms", "POST", {
          name: roomName,
          privacy: "private",
          properties: {
            max_participants: maxParticipants,
            enable_chat: true,
            enable_screenshare: false,
            lang: "es",
            // Sin expiración - sala permanente para el grupo
          },
        });

        return new Response(
          JSON.stringify({
            success: true,
            roomName: room.name,
            roomUrl: room.url,
            existing: false,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Eliminar sala manualmente (fin de sesión)
      if (action === "delete_room") {
        const { roomName } = body;
        if (!roomName) {
          return new Response(
            JSON.stringify({ error: "roomName required" }),
            { status: 400, headers: corsHeaders }
          );
        }
        await callDaily(`/rooms/${roomName}`, "DELETE");
        return new Response(
          JSON.stringify({ success: true, deleted: roomName }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: corsHeaders }
      );

    } catch (error) {
      console.error("Daily room error:", error);
      return new Response(
        JSON.stringify({ error: "Error interno" }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    { status: 405, headers: corsHeaders }
  );
};

export const config: Config = {
  path: "/api/daily/room",
};
