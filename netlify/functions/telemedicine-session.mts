import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Video call session management
export default async (req: Request, context: Context) => {
  const sql = getDatabase();

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      if (action === "request_call") {
        // User requests an immediate call (8am-8pm)
        const { userId, callType } = body;

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Check operating hours (Argentina time - UTC-3)
        const now = new Date();
        const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;

        if (argentinaHour < 8 || argentinaHour >= 20) {
          return new Response(JSON.stringify({
            success: false,
            error: "outside_hours",
            message: "El servicio de telemedicina está disponible de 8:00 a 20:00 hs. Puede agendar una cita para horario disponible.",
            nextAvailable: argentinaHour >= 20 ? "Mañana a las 8:00" : "Hoy a las 8:00"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Check user credits
        const [user] = await sql`
          SELECT credit_balance FROM telemedicine_users WHERE id = ${userId}
        `;

        const minimumCredits = 50000;

        if (!user || user.credit_balance < minimumCredits) {
          return new Response(JSON.stringify({
            success: false,
            error: "insufficient_credits",
            message: "Créditos insuficientes. Mínimo requerido: $50.000",
            currentBalance: user?.credit_balance || 0,
            minimumRequired: minimumCredits
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Create a pending call session with pre-authorization hold
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
            ${userId},
            ${sessionToken},
            'pending',
            ${callType || 'immediate'},
            ${minimumCredits},
            NOW(),
            NOW() + INTERVAL '15 minutes'
          )
          RETURNING id, session_token, expires_at
        `;

        // Place hold on credits
        await sql`
          UPDATE telemedicine_users
          SET credits_on_hold = credits_on_hold + ${minimumCredits}
          WHERE id = ${userId}
        `;

        // Get patient info for the queue
        const [patientInfo] = await sql`
          SELECT email, phone, full_name FROM telemedicine_users WHERE id = ${userId}
        `;

        // Add to call queue and notify professionals
        const [queueEntry] = await sql`
          INSERT INTO call_queue (
            video_session_id, user_id, patient_name, patient_email, patient_phone,
            status, created_at
          )
          VALUES (
            ${session.id}, ${userId},
            ${patientInfo?.full_name || 'Paciente'},
            ${patientInfo?.email || null},
            ${patientInfo?.phone || null},
            'waiting',
            NOW()
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
            patientName: patientInfo?.full_name || 'Paciente',
            roomName
          })
        }).catch(e => console.log('Notification trigger failed:', e));

        return new Response(JSON.stringify({
          success: true,
          sessionId: session.id,
          sessionToken: session.session_token,
          expiresAt: session.expires_at,
          queueId: queueEntry.id,
          message: "Sesión creada. Los profesionales han sido notificados y uno se conectará en breve.",
          creditsHeld: minimumCredits
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "schedule_call") {
        // Schedule a call for later
        const { userId, scheduledDate, scheduledTime, notes } = body;

        if (!userId || !scheduledDate || !scheduledTime) {
          return new Response(JSON.stringify({ error: "userId, scheduledDate and scheduledTime required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Check credits
        const [user] = await sql`
          SELECT credit_balance FROM telemedicine_users WHERE id = ${userId}
        `;

        const minimumCredits = 50000;

        if (!user || user.credit_balance < minimumCredits) {
          return new Response(JSON.stringify({
            success: false,
            error: "insufficient_credits",
            message: "Para agendar necesita al menos $50.000 en créditos",
            currentBalance: user?.credit_balance || 0
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}:00-03:00`);

        const [appointment] = await sql`
          INSERT INTO scheduled_appointments (
            user_id,
            scheduled_at,
            notes,
            status,
            created_at
          )
          VALUES (
            ${userId},
            ${scheduledDateTime.toISOString()},
            ${notes || null},
            'confirmed',
            NOW()
          )
          RETURNING id, scheduled_at
        `;

        return new Response(JSON.stringify({
          success: true,
          appointmentId: appointment.id,
          scheduledAt: appointment.scheduled_at,
          message: "Cita agendada exitosamente"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "complete_call") {
        // Call completed successfully - charge credits
        const { sessionToken, durationMinutes } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "sessionToken required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [session] = await sql`
          SELECT id, user_id, credits_held, status
          FROM video_sessions
          WHERE session_token = ${sessionToken}
        `;

        if (!session || session.status !== 'pending') {
          return new Response(JSON.stringify({ error: "Invalid or already processed session" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Calculate actual charge based on duration
        const chargeAmount = session.credits_held; // Could be pro-rated

        // Deduct from balance and release hold
        await sql`
          UPDATE telemedicine_users
          SET credit_balance = credit_balance - ${chargeAmount},
              credits_on_hold = credits_on_hold - ${session.credits_held}
          WHERE id = ${session.user_id}
        `;

        // Record transaction
        await sql`
          INSERT INTO credit_transactions (
            user_id, amount, transaction_type, session_id, created_at
          )
          VALUES (${session.user_id}, -${chargeAmount}, 'debit', ${session.id}, NOW())
        `;

        // Update session status
        await sql`
          UPDATE video_sessions
          SET status = 'completed',
              completed_at = NOW(),
              duration_minutes = ${durationMinutes || 0},
              credits_charged = ${chargeAmount}
          WHERE id = ${session.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          charged: chargeAmount,
          message: "Consulta finalizada. Gracias por usar nuestro servicio."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "cancel_call" || action === "call_failed") {
        // Call didn't happen - refund credits
        const { sessionToken, reason } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "sessionToken required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [session] = await sql`
          SELECT id, user_id, credits_held, status
          FROM video_sessions
          WHERE session_token = ${sessionToken}
        `;

        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (session.status === 'completed' || session.status === 'refunded') {
          return new Response(JSON.stringify({ error: "Session already processed" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Release held credits
        await sql`
          UPDATE telemedicine_users
          SET credits_on_hold = credits_on_hold - ${session.credits_held}
          WHERE id = ${session.user_id}
        `;

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
          creditsReleased: session.credits_held,
          message: action === "call_failed"
            ? "La llamada no pudo concretarse. Sus créditos han sido restituidos."
            : "Sesión cancelada. Créditos liberados."
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
