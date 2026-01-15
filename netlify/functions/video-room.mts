import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

// Video room creation and management using Daily.co
export default async (req: Request, context: Context) => {
  const sql = neon();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const { action, sessionToken } = body;

    const dailyApiKey = process.env.DAILY_API_KEY;

    if (action === "create_room") {
      // Create a Daily.co room for a video session
      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "sessionToken required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Verify session exists and is pending
      const [session] = await sql`
        SELECT id, user_id, status, expires_at
        FROM video_sessions
        WHERE session_token = ${sessionToken}
      `;

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (session.status !== "pending") {
        return new Response(JSON.stringify({
          error: "Session not available",
          status: session.status
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // If Daily API is configured, create a real room
      let roomUrl: string;
      let roomName: string;

      if (dailyApiKey) {
        // Create room via Daily.co API
        const expiryMinutes = 60; // Room expires in 60 minutes
        const roomResponse = await fetch("https://api.daily.co/v1/rooms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${dailyApiKey}`
          },
          body: JSON.stringify({
            name: `telemed-${session.id}-${Date.now()}`,
            privacy: "private",
            properties: {
              exp: Math.floor(Date.now() / 1000) + expiryMinutes * 60,
              max_participants: 2,
              enable_chat: true,
              enable_screenshare: false,
              enable_recording: "cloud", // Enable cloud recording
              start_video_off: false,
              start_audio_off: false,
              lang: "es"
            }
          })
        });

        if (!roomResponse.ok) {
          const errorData = await roomResponse.json();
          console.error("Daily.co API error:", errorData);
          return new Response(JSON.stringify({
            error: "Failed to create video room",
            details: errorData
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        const roomData = await roomResponse.json();
        roomUrl = roomData.url;
        roomName = roomData.name;

        // Create meeting token for the patient
        const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${dailyApiKey}`
          },
          body: JSON.stringify({
            properties: {
              room_name: roomName,
              user_name: "Paciente",
              exp: Math.floor(Date.now() / 1000) + expiryMinutes * 60,
              is_owner: false,
              enable_recording: false
            }
          })
        });

        const tokenData = await tokenResponse.json();
        const patientToken = tokenData.token;

        // Update session with room info
        await sql`
          UPDATE video_sessions
          SET room_id = ${roomName},
              status = 'active',
              started_at = NOW()
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          roomUrl,
          roomName,
          token: patientToken,
          expiresIn: expiryMinutes * 60
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } else {
        // Daily API not configured - use embedded Jitsi as fallback (no API needed)
        roomName = `telemed-joseingenieros-${session.id}-${Date.now()}`;
        roomUrl = `https://meet.jit.si/${roomName}`;

        // Update session with room info
        await sql`
          UPDATE video_sessions
          SET room_id = ${roomName},
              status = 'active',
              started_at = NOW()
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          roomUrl,
          roomName,
          provider: "jitsi",
          message: "Using Jitsi Meet (Daily.co not configured)"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (action === "get_room") {
      // Get room info for an existing session
      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "sessionToken required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const [session] = await sql`
        SELECT id, room_id, status, started_at
        FROM video_sessions
        WHERE session_token = ${sessionToken}
      `;

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!session.room_id) {
        return new Response(JSON.stringify({
          error: "No room created yet",
          status: session.status
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Determine room URL based on provider
      let roomUrl: string;
      if (session.room_id.startsWith("telemed-joseingenieros-")) {
        roomUrl = `https://meet.jit.si/${session.room_id}`;
      } else if (dailyApiKey) {
        // For Daily.co, we need to get the room URL
        const roomResponse = await fetch(`https://api.daily.co/v1/rooms/${session.room_id}`, {
          headers: {
            "Authorization": `Bearer ${dailyApiKey}`
          }
        });
        if (roomResponse.ok) {
          const roomData = await roomResponse.json();
          roomUrl = roomData.url;
        } else {
          roomUrl = `https://clinica-joseingenieros.daily.co/${session.room_id}`;
        }
      } else {
        roomUrl = `https://meet.jit.si/${session.room_id}`;
      }

      return new Response(JSON.stringify({
        success: true,
        roomId: session.room_id,
        roomUrl,
        status: session.status,
        startedAt: session.started_at
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "end_call") {
      // End the video call and process billing
      const { durationMinutes } = body;

      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "sessionToken required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const [session] = await sql`
        SELECT id, user_id, room_id, credits_held, status, started_at
        FROM video_sessions
        WHERE session_token = ${sessionToken}
      `;

      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (session.status === "completed") {
        return new Response(JSON.stringify({
          success: true,
          message: "Session already completed"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Calculate duration if not provided
      let duration = durationMinutes;
      if (!duration && session.started_at) {
        const startTime = new Date(session.started_at).getTime();
        const endTime = Date.now();
        duration = Math.ceil((endTime - startTime) / (1000 * 60));
      }

      // Delete Daily.co room if configured
      if (dailyApiKey && session.room_id && !session.room_id.startsWith("telemed-joseingenieros-")) {
        try {
          await fetch(`https://api.daily.co/v1/rooms/${session.room_id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${dailyApiKey}`
            }
          });
        } catch (e) {
          console.error("Failed to delete Daily room:", e);
        }
      }

      // Charge credits
      const chargeAmount = session.credits_held || 5000;

      await sql`
        UPDATE telemedicine_users
        SET credit_balance = credit_balance - ${chargeAmount},
            credits_on_hold = credits_on_hold - ${session.credits_held}
        WHERE id = ${session.user_id}
      `;

      await sql`
        INSERT INTO credit_transactions (
          user_id, amount, transaction_type, session_id, created_at
        )
        VALUES (${session.user_id}, -${chargeAmount}, 'debit', ${session.id}, NOW())
      `;

      await sql`
        UPDATE video_sessions
        SET status = 'completed',
            completed_at = NOW(),
            duration_minutes = ${duration || 0},
            credits_charged = ${chargeAmount}
        WHERE id = ${session.id}
      `;

      return new Response(JSON.stringify({
        success: true,
        charged: chargeAmount,
        duration,
        message: "Consulta finalizada exitosamente"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Video room error:", error);
    return new Response(JSON.stringify({
      error: "Video room operation failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/video/room"
};
