import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { createDailyRoom } from "./lib/daily.mts";

// Video call session management - ON-DEMAND ONLY
// Pricing by modality (Argentina time UTC-3):
// - Con espera en linea: $50,000 ARS / USD 35 (15 min)
// - Sin cola: USD 70 (15 min)
// - Sin cola premium: USD 120 (15 min)
// PAYMENT MUST BE COMPLETED BEFORE consultation can proceed

// Mercado Pago API configuration
const MP_API_URL = "https://api.mercadopago.com";

interface MPPreference {
  items: { title: string; description?: string; quantity: number; currency_id: string; unit_price: number; }[];
  payer?: { email?: string; name?: string; };
  back_urls?: { success: string; failure: string; pending: string; };
  auto_return?: string;
  external_reference?: string;
  notification_url?: string;
}

async function createMPPreference(preference: MPPreference, accessToken: string) {
  const response = await fetch(`${MP_API_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preference)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mercado Pago error: ${error}`);
  }

  return response.json();
}

const SERVICE_PRICING: Record<string, { price: number; usdPrice: number; planId: number; planName: string; priority: number; }> = {
  queue: {
    price: 50000,
    usdPrice: 35,
    planId: 1,
    planName: 'Telemedicina con espera (15 min)',
    priority: 0
  },
  priority: {
    price: 70000,
    usdPrice: 70,
    planId: 2,
    planName: 'Telemedicina sin cola (15 min)',
    priority: 10
  },
  vip: {
    price: 120000,
    usdPrice: 120,
    planId: 3,
    planName: 'Telemedicina sin cola premium (15 min)',
    priority: 20
  }
};

function getPriceForCurrentHour(callType?: string): { price: number; usdPrice: number; planId: number; planName: string; timeSlot: string; durationMinutes: number; priority: number } {
  const now = new Date();
  const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;
  const isNightPromo = argentinaHour >= 23 || argentinaHour < 7;
  const timeSlot = isNightPromo ? '23:00-07:00' : '07:00-23:00';
  const pricing = SERVICE_PRICING[callType || 'queue'] || SERVICE_PRICING.queue;

  return {
    price: pricing.price,
    usdPrice: pricing.usdPrice,
    planId: pricing.planId,
    planName: pricing.planName,
    timeSlot,
    durationMinutes: 15,
    priority: pricing.priority
  };
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Get current price based on time slot
      if (action === "get_current_price") {
        const { callType } = body;
        const priceInfo = getPriceForCurrentHour(callType);
        return new Response(JSON.stringify({
          success: true,
          ...priceInfo,
          currency: 'ARS',
          formattedPrice: `ARS $${priceInfo.price.toLocaleString('es-AR')} · USD ${priceInfo.usdPrice}`
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "request_call") {
        // User requests an on-demand call (24/7 service)
        // PAYMENT MUST BE COMPLETED FIRST before entering the queue
        const { userId, callType, patientName, patientEmail, patientPhone } = body;
        const normalizedCallType = ['queue', 'priority', 'vip'].includes(callType) ? callType : 'queue';

        if (!userId && !patientEmail) {
          return new Response(JSON.stringify({ error: "userId or patientEmail required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Get Mercado Pago access token
        const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

        // Get current price for this time slot
        const priceInfo = getPriceForCurrentHour(normalizedCallType);

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

        // Create external reference for MercadoPago tracking
        const externalRef = `TELE-${user.id}-${priceInfo.planId}-${Date.now()}`;

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
            'awaiting_payment',
            ${normalizedCallType},
            ${priceInfo.price},
            NOW(),
            NOW() + INTERVAL '30 minutes'
          )
          RETURNING id, session_token, expires_at
        `;

        // Create MercadoPago payment preference
        let mpPaymentLink = null;
        let mpSandboxLink = null;
        let mpPreferenceId = null;

        if (MP_ACCESS_TOKEN) {
          try {
            const siteUrl = process.env.URL || 'https://clinicajoseingenieros.ar';

            const preference: MPPreference = {
              items: [{
                title: priceInfo.planName,
                description: `Videoconsulta de ${priceInfo.durationMinutes} min - ${priceInfo.timeSlot}`,
                quantity: 1,
                currency_id: 'ARS',
                unit_price: priceInfo.price
              }],
              payer: {
                email: user.email || patientEmail || undefined,
                name: user.full_name || patientName || undefined
              },
              back_urls: {
                success: `${siteUrl}/#telemedicina-pago-exitoso`,
                failure: `${siteUrl}/#telemedicina-pago-fallido`,
                pending: `${siteUrl}/#telemedicina-pago-pendiente`
              },
              auto_return: "approved",
              external_reference: externalRef,
              notification_url: `${siteUrl}/api/mercadopago/webhook`
            };

            const mpPreference = await createMPPreference(preference, MP_ACCESS_TOKEN);
            mpPaymentLink = mpPreference.init_point;
            mpSandboxLink = mpPreference.sandbox_init_point;
            mpPreferenceId = mpPreference.id;

            // Record the pending payment
            await sql`
              INSERT INTO mp_payments (
                user_id, mp_preference_id, amount, currency, status,
                description, external_reference, created_at
              )
              VALUES (
                ${user.id}, ${mpPreferenceId}, ${priceInfo.price}, 'ARS',
                'pending', ${priceInfo.planName}, ${externalRef}, NOW()
              )
            `;

            // Store the external reference in video session for later verification
            await sql`
              UPDATE video_sessions
              SET payment_reference = ${externalRef}
              WHERE id = ${session.id}
            `;

          } catch (mpError) {
            console.error('MercadoPago preference creation failed:', mpError);
            // Continue without MP - will need manual payment verification
          }
        }

        // Add to call queue with status 'awaiting_payment' - will change to 'waiting' after payment
        const [queueEntry] = await sql`
          INSERT INTO call_queue (
            video_session_id, user_id, patient_name, patient_email, patient_phone,
            priority, status, created_at, notes
          )
          VALUES (
            ${session.id}, ${user.id},
            ${user.full_name || patientName || 'Paciente'},
            ${user.email || patientEmail || null},
            ${user.phone || patientPhone || null},
            ${priceInfo.priority},
            'awaiting_payment',
            NOW(),
            ${`Modalidad: ${priceInfo.planName}. Precio: ARS $${priceInfo.price.toLocaleString('es-AR')} / USD ${priceInfo.usdPrice} (${priceInfo.timeSlot}). Ref: ${externalRef}`}
          )
          RETURNING id
        `;

        // Notificar a dirección médica: solicitud recibida, esperando pago
        const siteUrl0 = process.env.URL || 'https://clinicajoseingenieros.ar';
        fetch(`${siteUrl0}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_consultation_requested',
            patientName: user.full_name || patientName || 'Paciente',
            patientEmail: user.email || patientEmail || '',
            planName: priceInfo.planName,
            priceARS: priceInfo.price,
            priceUSD: priceInfo.usdPrice,
            externalRef,
          })
        }).catch(() => {});

        return new Response(JSON.stringify({
          success: true,
          requiresPayment: true,
          sessionId: session.id,
          sessionToken: session.session_token,
          expiresAt: session.expires_at,
          queueId: queueEntry.id,
          userId: user.id,
          paymentInfo: {
            externalReference: externalRef,
            mercadoPagoLink: mpPaymentLink,
            mercadoPagoSandboxLink: mpSandboxLink,
            preferenceId: mpPreferenceId
          },
          priceInfo: {
            ...priceInfo,
            formattedPrice: `ARS $${priceInfo.price.toLocaleString('es-AR')} · USD ${priceInfo.usdPrice}`
          },
          message: mpPaymentLink
            ? "Por favor complete el pago para confirmar su consulta. Una vez confirmado el pago, entrará en la sala de espera y los profesionales serán notificados."
            : "Pago requerido. Por favor contacte a administración para coordinar el pago."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Check payment status and activate session if paid
      if (action === "check_payment_status") {
        const { sessionToken, externalReference } = body;

        if (!sessionToken && !externalReference) {
          return new Response(JSON.stringify({ error: "sessionToken or externalReference required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        let payment;
        if (externalReference) {
          [payment] = await sql`
            SELECT status, paid_at, amount FROM mp_payments
            WHERE external_reference = ${externalReference}
          `;
        }

        if (payment && payment.status === 'approved') {
          // Payment confirmed! Create Daily.co room and activate session
          if (sessionToken) {
            const [session] = await sql`
              SELECT id, user_id, call_type, daily_room_name, status
              FROM video_sessions
              WHERE session_token = ${sessionToken}
            `;

            if (session && session.status === 'awaiting_payment') {
              // Create Daily.co room now that payment is confirmed
              const DAILY_API_KEY = process.env.DAILY_API_KEY;
              let dailyRoomName = '';
              let dailyRoomUrl = '';
              let dailyProfUrl = '';
              let dailyPatientUrl = '';

              const [user] = await sql`
                SELECT full_name, email FROM telemedicine_users WHERE id = ${session.user_id}
              `;

              if (DAILY_API_KEY) {
                try {
                  const roomSlug = `cji-${sessionToken.substring(0, 12)}`;
                  // Sala expira en 1 hora exacta desde el pago (+ 5 min gracia)
                  const roomExpires = Math.floor(Date.now() / 1000) + 65 * 60;

                  const roomRes = await fetch('https://api.daily.co/v1/rooms', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${DAILY_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: roomSlug,
                      privacy: 'private',
                      properties: {
                        exp: roomExpires,
                        max_participants: 4,
                        enable_chat: true,
                        enable_screenshare: false,
                        eject_at_room_exp: true,
                        lang: 'es',
                      }
                    })
                  });
                  const room = await roomRes.json();
                  dailyRoomName = room.name;
                  dailyRoomUrl = room.url;

                  // Token profesional (owner)
                  const profTokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${DAILY_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ properties: { room_name: roomSlug, is_owner: true, user_name: 'Profesional CJI', exp: roomExpires } })
                  });
                  const profToken = await profTokenRes.json();

                  // Token paciente
                  const patientTokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${DAILY_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ properties: { room_name: roomSlug, is_owner: false, user_name: user?.full_name || 'Paciente', exp: roomExpires } })
                  });
                  const patientToken = await patientTokenRes.json();

                  dailyProfUrl = `${room.url}?t=${profToken.token}`;
                  dailyPatientUrl = `${room.url}?t=${patientToken.token}`;
                } catch (dailyErr) {
                  console.error('Daily room creation failed:', dailyErr);
                }
              }

              // Update session: active, 1hr window, room urls stored
              await sql`
                UPDATE video_sessions
                SET status = 'pending',
                    daily_room_name = ${dailyRoomName || null},
                    daily_room_url = ${dailyRoomUrl || null},
                    daily_prof_url = ${dailyProfUrl || null},
                    daily_patient_url = ${dailyPatientUrl || null},
                    expires_at = NOW() + INTERVAL '1 hour'
                WHERE id = ${session.id}
              `;

              // Update call queue to 'waiting'
              await sql`
                UPDATE call_queue
                SET status = 'waiting',
                    notes = CONCAT(notes, ' | Sala: ${dailyRoomName || 'sin sala'}')
                WHERE video_session_id = ${session.id} AND status = 'awaiting_payment'
              `;

              const priceInfo = getPriceForCurrentHour(session.call_type);
              const roomName = dailyRoomName || `cji-${sessionToken.substring(0, 12)}`;

              fetch(`${new URL(req.url).origin}/api/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'notify_new_call',
                  callQueueId: session.id,
                  patientName: user?.full_name || 'Paciente',
                  roomName,
                  price: payment.amount,
                  timeSlot: priceInfo.timeSlot,
                  paymentConfirmed: true
                })
              }).catch(e => console.log('Notification trigger failed:', e));
            }
          }

          // Fetch the room URL from video_sessions if available
          let roomUrl = '';
          if (sessionToken) {
            const [vs] = await sql`SELECT room_id FROM video_sessions WHERE session_token = ${sessionToken}`;
            roomUrl = vs?.room_id || '';
          }

          return new Response(JSON.stringify({
            success: true,
            paymentStatus: 'approved',
            paidAt: payment.paid_at,
            // Room URLs for the patient to enter
            room: dailyRoomUrl ? {
              patientUrl: dailyPatientUrl,
              roomUrl: dailyRoomUrl,
              expiresInMinutes: 60,
            } : null,
            roomUrl: roomUrl || '',
            message: dailyPatientUrl
              ? "Pago confirmado. Tu sala está lista. Los profesionales fueron notificados y tienen 1 hora para atenderte."
              : "Pago confirmado. Ha ingresado a la sala de espera. Los profesionales han sido notificados."
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Payment not yet approved - return current status
        return new Response(JSON.stringify({
          success: true,
          paymentStatus: payment?.status || 'pending',
          message: payment?.status === 'rejected'
            ? "El pago fue rechazado. Por favor intente nuevamente."
            : "Esperando confirmación del pago..."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Expire unattended sessions (called by scheduled job or patient polling)
      // If 1hr passed since payment and no professional attended → cancel + refund
      if (action === "expire_unattended") {
        const { sessionToken } = body;

        const [session] = await sql`
          SELECT vs.id, vs.user_id, vs.daily_room_name, vs.payment_reference,
                 vs.expires_at, vs.status, vs.credits_held
          FROM video_sessions vs
          WHERE vs.session_token = ${sessionToken}
        `;

        if (!session) {
          return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
        }

        if (session.status !== 'pending') {
          return new Response(JSON.stringify({ success: true, status: session.status, message: "Sesión ya procesada." }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const expired = new Date(session.expires_at) < new Date();
        if (!expired) {
          const minutesLeft = Math.ceil((new Date(session.expires_at).getTime() - Date.now()) / 60000);
          return new Response(JSON.stringify({ success: false, message: `Sesión activa. Quedan ${minutesLeft} minutos.`, minutesLeft }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // 1 hour passed, nobody attended → cancel
        await sql`
          UPDATE video_sessions SET status = 'expired', cancelled_at = NOW(),
            cancel_reason = 'No atendido en 1 hora - reembolso automático'
          WHERE id = ${session.id}
        `;
        await sql`
          UPDATE call_queue SET status = 'cancelled' WHERE video_session_id = ${session.id}
        `;

        // Delete Daily room if it exists
        const DAILY_API_KEY = process.env.DAILY_API_KEY;
        if (DAILY_API_KEY && session.daily_room_name) {
          fetch(`https://api.daily.co/v1/rooms/${session.daily_room_name}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${DAILY_API_KEY}` }
          }).catch(() => {});
        }

        // Trigger MercadoPago refund
        let refundStatus = 'pending';
        const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
        if (MP_ACCESS_TOKEN && session.payment_reference) {
          try {
            // Get MP payment ID from our records
            const [mpPayment] = await sql`
              SELECT mp_payment_id, amount FROM mp_payments
              WHERE external_reference = ${session.payment_reference} AND status = 'approved'
            `;
            if (mpPayment?.mp_payment_id) {
              const refundRes = await fetch(
                `https://api.mercadopago.com/v1/payments/${mpPayment.mp_payment_id}/refunds`,
                {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount: mpPayment.amount })
                }
              );
              const refundData = await refundRes.json();
              refundStatus = refundData.status || 'requested';
              await sql`
                UPDATE mp_payments SET status = 'refunded', refunded_at = NOW()
                WHERE external_reference = ${session.payment_reference}
              `;
            }
          } catch (refundErr) {
            console.error('Refund failed:', refundErr);
            refundStatus = 'error';
          }
        }

        return new Response(JSON.stringify({
          success: true,
          expired: true,
          refundStatus,
          message: refundStatus === 'error'
            ? "Sesión cancelada. El reembolso requiere gestión manual."
            : "Sesión cancelada. El reembolso fue solicitado a MercadoPago."
        }), { status: 200, headers: { "Content-Type": "application/json" } });
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
