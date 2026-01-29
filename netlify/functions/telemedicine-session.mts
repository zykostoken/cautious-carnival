import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Video call session management - ON-DEMAND ONLY
// Pricing by time slot (Argentina time UTC-3):
// - 09:00-13:00: $120,000 ARS
// - 13:00-20:00: $150,000 ARS
// - 20:00-09:00: $200,000 ARS
// Payment is processed when professional takes the call, not on request

function getPriceForCurrentHour(): { price: number; planId: number; planName: string; timeSlot: string } {
  const now = new Date();
  const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;

  if (argentinaHour >= 9 && argentinaHour < 13) {
    return { price: 120000, planId: 1, planName: 'Consulta Diurna (09-13hs)', timeSlot: '09:00-13:00' };
  } else if (argentinaHour >= 13 && argentinaHour < 20) {
    return { price: 150000, planId: 2, planName: 'Consulta Vespertina (13-20hs)', timeSlot: '13:00-20:00' };
  } else {
    // 20:00-09:00 (night/early morning)
    return { price: 200000, planId: 3, planName: 'Consulta Nocturna (20-09hs)', timeSlot: '20:00-09:00' };
  }
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Get current price based on time slot
      if (action === "get_current_price") {
        const priceInfo = getPriceForCurrentHour();
        return new Response(JSON.stringify({
          success: true,
          ...priceInfo,
          currency: 'ARS',
          formattedPrice: `$${priceInfo.price.toLocaleString('es-AR')} ARS`
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "request_call") {
        // User requests an immediate on-demand call (24/7 service)
        const { userId, callType, patientName, patientEmail, patientPhone } = body;

        if (!userId && !patientEmail) {
          return new Response(JSON.stringify({ error: "userId or patientEmail required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get current price for this time slot
        const priceInfo = getPriceForCurrentHour();

        let user;
        if (userId) {
          // Existing user
          [user] = await sql`
            SELECT id, email, phone, full_name FROM telemedicine_users WHERE id = ${userId}
          `;
        }

        // If no user found but we have patient data, create a temporary entry
        if (!user && patientEmail) {
          [user] = await sql`
            INSERT INTO telemedicine_users (email, phone, full_name, created_at)
            VALUES (${patientEmail}, ${patientPhone || null}, ${patientName || 'Paciente'}, NOW())
            ON CONFLICT (email) DO UPDATE SET
              phone = COALESCE(EXCLUDED.phone, telemedicine_users.phone),
              full_name = COALESCE(EXCLUDED.full_name, telemedicine_users.full_name)
            RETURNING id, email, phone, full_name
          `;
        }

        if (!user) {
          return new Response(JSON.stringify({
            success: false,
            error: "user_not_found",
            message: "Usuario no encontrado. Por favor complete sus datos primero."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Create a pending call session with 30-minute tolerance
        const sessionToken = crypto.randomUUID();

        const [session] = await sql`
          INSERT INTO video_sessions (
            user_id,
            session_token,
            status,
            call_type,
            credits_held,
            created_at,
            expires_at
          )
          VALUES (
            ${user.id},
            ${sessionToken},
            'pending',
            'on_demand',
            ${priceInfo.price},
            NOW(),
            NOW() + INTERVAL '30 minutes'
          )
          RETURNING id, session_token, expires_at
        `;

        // Add to call queue with price info
        const [queueEntry] = await sql`
          INSERT INTO call_queue (
            video_session_id, user_id, patient_name, patient_email, patient_phone,
            status, created_at, notes
          )
          VALUES (
            ${session.id}, ${user.id},
            ${user.full_name || patientName || 'Paciente'},
            ${user.email || patientEmail || null},
            ${user.phone || patientPhone || null},
            'waiting',
            NOW(),
            ${`Precio: $${priceInfo.price.toLocaleString('es-AR')} ARS (${priceInfo.timeSlot})`}
          )
          RETURNING id
        `;

        // Trigger notification to professionals (async, don't wait)
        const roomName = `ClinicaJoseIngenieros_${session.session_token.substring(0, 12)}`;
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_new_call',
            callQueueId: queueEntry.id,
            patientName: user.full_name || patientName || 'Paciente',
            roomName,
            price: priceInfo.price,
            timeSlot: priceInfo.timeSlot
          })
        }).catch(e => console.log('Notification trigger failed:', e));

        return new Response(JSON.stringify({
          success: true,
          sessionId: session.id,
          sessionToken: session.session_token,
          expiresAt: session.expires_at,
          queueId: queueEntry.id,
          userId: user.id,
          priceInfo: {
            ...priceInfo,
            formattedPrice: `$${priceInfo.price.toLocaleString('es-AR')} ARS`
          },
          message: "Solicitud recibida. El pago se procesará cuando un profesional tome su llamada. Tiempo de espera máximo: 30 minutos."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Scheduled appointments are disabled - on-demand only
      if (action === "schedule_call") {
        return new Response(JSON.stringify({
          success: false,
          error: "scheduling_disabled",
          message: "El servicio de telemedicina es solo bajo demanda. No se pueden agendar turnos. Solicite una consulta inmediata."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "complete_call") {
        // Call completed successfully (no credits charged - payment handled externally)
        const { sessionToken, durationMinutes } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "sessionToken required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [session] = await sql`
          SELECT id, user_id, status
          FROM video_sessions
          WHERE session_token = ${sessionToken}
        `;

        if (!session || session.status !== 'pending') {
          return new Response(JSON.stringify({ error: "Invalid or already processed session" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Update session status
        await sql`
          UPDATE video_sessions
          SET status = 'completed',
              completed_at = NOW(),
              duration_minutes = ${durationMinutes || 0}
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Consulta finalizada. Gracias por usar nuestro servicio."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "cancel_call" || action === "call_failed") {
        // Call didn't happen (no credits to refund - payment handled externally)
        const { sessionToken, reason } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "sessionToken required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [session] = await sql`
          SELECT id, user_id, status
          FROM video_sessions
          WHERE session_token = ${sessionToken}
        `;

        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (session.status === 'completed' || session.status === 'cancelled' || session.status === 'failed') {
          return new Response(JSON.stringify({ error: "Session already processed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Update session status
        const newStatus = action === "call_failed" ? "failed" : "cancelled";
        await sql`
          UPDATE video_sessions
          SET status = ${newStatus},
              cancelled_at = NOW(),
              cancel_reason = ${reason || null}
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: action === "call_failed"
            ? "La llamada no pudo concretarse."
            : "Sesión cancelada."
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
      console.error("Video session error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (req.method === "GET") {
    // Get user's sessions/appointments
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const sessions = await sql`
        SELECT id, status, call_type, created_at, completed_at, duration_minutes
        FROM video_sessions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const appointments = await sql`
        SELECT id, scheduled_at, status, notes
        FROM scheduled_appointments
        WHERE user_id = ${userId} AND scheduled_at > NOW()
        ORDER BY scheduled_at ASC
      `;

      return new Response(JSON.stringify({
        sessions,
        upcomingAppointments: appointments
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Get sessions error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

export const config: Config = {
  path: "/api/telemedicine/session"
};
