import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Call queue management system
// Payment is processed when professional takes the call

// Get price based on current time (Argentina time UTC-3)
function getPriceForCurrentHour(): { price: number; planName: string; timeSlot: string } {
  const now = new Date();
  const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;

  if (argentinaHour >= 9 && argentinaHour < 13) {
    return { price: 120000, planName: 'Consulta Diurna (09-13hs)', timeSlot: '09:00-13:00' };
  } else if (argentinaHour >= 13 && argentinaHour < 20) {
    return { price: 150000, planName: 'Consulta Vespertina (13-20hs)', timeSlot: '13:00-20:00' };
  } else {
    return { price: 200000, planName: 'Consulta Nocturna (20-09hs)', timeSlot: '20:00-09:00' };
  }
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

      // Add a new call to the queue
      if (action === "add") {
        const { videoSessionId, userId, patientName, patientEmail, patientPhone, notes } = body;

        if (!videoSessionId || !userId) {
          return new Response(JSON.stringify({
            error: "videoSessionId y userId son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [queueEntry] = await sql`
          INSERT INTO call_queue (
            video_session_id, user_id, patient_name, patient_email, patient_phone,
            status, created_at, notes
          )
          VALUES (
            ${videoSessionId}, ${userId},
            ${patientName || 'Paciente'},
            ${patientEmail || null},
            ${patientPhone || null},
            'waiting',
            NOW(),
            ${notes || null}
          )
          RETURNING id, status, created_at
        `;

        // Trigger notification to professionals (async, don't wait)
        const roomName = `ClinicaJoseIngenieros_call_${queueEntry.id}`;
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_new_call',
            callQueueId: queueEntry.id,
            patientName: patientName || 'Paciente',
            roomName
          })
        }).catch(e => console.log('Notification trigger failed:', e));

        return new Response(JSON.stringify({
          success: true,
          queueId: queueEntry.id,
          position: 1, // Will be calculated properly in getQueue
          message: "Llamada agregada a la cola. Los profesionales han sido notificados."
        }), { status: 201, headers: corsHeaders });
      }

      // Professional takes a call from queue
      // IMPORTANT: Can only take calls that have been PAID (status = 'waiting', not 'awaiting_payment')
      if (action === "take") {
        const { sessionToken, queueId } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Token de sesión requerido" }),
            { status: 401, headers: corsHeaders });
        }

        // Verify professional session
        const [professional] = await sql`
          SELECT id, full_name, current_calls, max_concurrent_calls
          FROM healthcare_professionals
          WHERE session_token = ${sessionToken} AND is_active = TRUE
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        // Check capacity
        if (professional.current_calls >= professional.max_concurrent_calls) {
          return new Response(JSON.stringify({
            error: "Ya tienes el máximo de llamadas concurrentes"
          }), { status: 400, headers: corsHeaders });
        }

        // If specific queueId provided, take that call
        // Otherwise, take the oldest waiting call
        // ONLY take calls with status = 'waiting' (payment already confirmed)
        let queueEntry;

        if (queueId) {
          [queueEntry] = await sql`
            UPDATE call_queue
            SET status = 'assigned',
                assigned_professional_id = ${professional.id},
                assigned_at = NOW()
            WHERE id = ${queueId} AND status = 'waiting'
            RETURNING id, video_session_id, user_id, patient_name, patient_email, patient_phone
          `;
        } else {
          [queueEntry] = await sql`
            UPDATE call_queue
            SET status = 'assigned',
                assigned_professional_id = ${professional.id},
                assigned_at = NOW()
            WHERE id = (
              SELECT id FROM call_queue
              WHERE status = 'waiting'
              ORDER BY priority DESC, created_at ASC
              LIMIT 1
            )
            RETURNING id, video_session_id, user_id, patient_name, patient_email, patient_phone
          `;
        }

        if (!queueEntry) {
          return new Response(JSON.stringify({
            error: queueId
              ? "La llamada ya fue tomada, no existe, o el pago no fue confirmado"
              : "No hay llamadas pagadas en espera"
          }), { status: 404, headers: corsHeaders });
        }

        // Get price info (already paid, just for display)
        const priceInfo = getPriceForCurrentHour();

        // Verify payment was actually made for this session
        const [payment] = await sql`
          SELECT p.status, p.amount, p.external_reference
          FROM mp_payments p
          JOIN video_sessions vs ON vs.payment_reference = p.external_reference
          WHERE vs.id = ${queueEntry.video_session_id}
          ORDER BY p.created_at DESC
          LIMIT 1
        `;

        // Payment should already be approved since call_queue status was 'waiting'
        const paymentVerified = payment && payment.status === 'approved';
        const chargedAmount = payment?.amount || priceInfo.price;

        // Update professional's current calls count
        await sql`
          UPDATE healthcare_professionals
          SET current_calls = current_calls + 1
          WHERE id = ${professional.id}
        `;

        // Update video session with professional assignment
        await sql`
          UPDATE video_sessions
          SET professional_id = ${professional.id},
              status = 'in_progress',
              started_at = NOW(),
              credits_charged = ${chargedAmount}
          WHERE id = ${queueEntry.video_session_id}
        `;

        // Generate the room name
        const [session] = await sql`
          SELECT session_token FROM video_sessions WHERE id = ${queueEntry.video_session_id}
        `;

        // Send notification to admin about the session start
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_call_taken',
            professionalName: professional.full_name,
            patientName: queueEntry.patient_name,
            patientEmail: queueEntry.patient_email,
            price: chargedAmount,
            timeSlot: priceInfo.timeSlot,
            paymentRef: payment?.external_reference || 'N/A',
            paymentVerified
          })
        }).catch(e => console.log('Notification trigger failed:', e));

        return new Response(JSON.stringify({
          success: true,
          queueId: queueEntry.id,
          patient: {
            name: queueEntry.patient_name,
            email: queueEntry.patient_email,
            phone: queueEntry.patient_phone
          },
          roomName: `ClinicaJoseIngenieros_${session?.session_token?.substring(0, 12) || queueEntry.video_session_id}`,
          paymentInfo: {
            verified: paymentVerified,
            amount: chargedAmount,
            formattedAmount: `$${chargedAmount.toLocaleString('es-AR')} ARS`,
            reference: payment?.external_reference || 'N/A'
          },
          message: paymentVerified
            ? "Pago verificado. Conectándote con el paciente."
            : "Conectándote con el paciente. Verificar pago manualmente."
        }), { status: 200, headers: corsHeaders });
      }

      // Professional completes/ends a call
      if (action === "complete") {
        const { sessionToken, queueId, notes } = body;

        if (!sessionToken || !queueId) {
          return new Response(JSON.stringify({ error: "Token y queueId requeridos" }),
            { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        // Update queue entry
        const [queueEntry] = await sql`
          UPDATE call_queue
          SET status = 'completed',
              answered_at = NOW(),
              notes = ${notes || null}
          WHERE id = ${queueId} AND assigned_professional_id = ${professional.id}
          RETURNING id, video_session_id
        `;

        if (!queueEntry) {
          return new Response(JSON.stringify({ error: "Llamada no encontrada o no asignada a ti" }),
            { status: 404, headers: corsHeaders });
        }

        // Decrement professional's current calls
        await sql`
          UPDATE healthcare_professionals
          SET current_calls = GREATEST(0, current_calls - 1)
          WHERE id = ${professional.id}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Llamada completada"
        }), { status: 200, headers: corsHeaders });
      }

      // Transfer/derive call to another professional
      if (action === "transfer") {
        const { sessionToken, queueId, targetProfessionalId, reason } = body;

        if (!sessionToken || !queueId || !targetProfessionalId) {
          return new Response(JSON.stringify({
            error: "Token, queueId y targetProfessionalId requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        // Check target professional exists and has capacity
        const [targetProfessional] = await sql`
          SELECT id, full_name, current_calls, max_concurrent_calls
          FROM healthcare_professionals
          WHERE id = ${targetProfessionalId} AND is_active = TRUE AND is_available = TRUE
        `;

        if (!targetProfessional) {
          return new Response(JSON.stringify({
            error: "Profesional destino no disponible"
          }), { status: 404, headers: corsHeaders });
        }

        if (targetProfessional.current_calls >= targetProfessional.max_concurrent_calls) {
          return new Response(JSON.stringify({
            error: "El profesional destino no tiene capacidad disponible"
          }), { status: 400, headers: corsHeaders });
        }

        // Transfer the call
        const [queueEntry] = await sql`
          UPDATE call_queue
          SET assigned_professional_id = ${targetProfessionalId},
              notes = COALESCE(notes, '') || E'\n[Derivada por ' || ${professional.id}::text || ': ' || ${reason || 'Sin motivo especificado'} || ']'
          WHERE id = ${queueId}
          RETURNING id, video_session_id
        `;

        if (!queueEntry) {
          return new Response(JSON.stringify({ error: "Llamada no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        // Update video session
        await sql`
          UPDATE video_sessions
          SET professional_id = ${targetProfessionalId}
          WHERE id = ${queueEntry.video_session_id}
        `;

        // Update call counts
        await sql`
          UPDATE healthcare_professionals
          SET current_calls = GREATEST(0, current_calls - 1)
          WHERE id = ${professional.id}
        `;

        await sql`
          UPDATE healthcare_professionals
          SET current_calls = current_calls + 1
          WHERE id = ${targetProfessionalId}
        `;

        return new Response(JSON.stringify({
          success: true,
          transferredTo: targetProfessional.full_name,
          message: `Llamada transferida a ${targetProfessional.full_name}`
        }), { status: 200, headers: corsHeaders });
      }

      // Cancel a call in queue
      if (action === "cancel") {
        const { queueId, reason } = body;

        await sql`
          UPDATE call_queue
          SET status = 'cancelled',
              notes = COALESCE(notes, '') || E'\n[Cancelada: ' || ${reason || 'Sin motivo'} || ']'
          WHERE id = ${queueId}
        `;

        return new Response(JSON.stringify({
          success: true,
          message: "Llamada cancelada"
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Call queue error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const videoSessionToken = url.searchParams.get("videoSessionToken");
    const status = url.searchParams.get("status") || "waiting";

    try {
      // Patient checking their own call status
      if (videoSessionToken) {
        const [callStatus] = await sql`
          SELECT
            cq.id,
            cq.status,
            cq.assigned_professional_id,
            vs.status as video_status,
            vs.session_token,
            vs.payment_reference,
            hp.full_name as professional_name,
            mp.status as payment_status,
            mp.paid_at
          FROM video_sessions vs
          LEFT JOIN call_queue cq ON cq.video_session_id = vs.id
          LEFT JOIN healthcare_professionals hp ON cq.assigned_professional_id = hp.id
          LEFT JOIN mp_payments mp ON vs.payment_reference = mp.external_reference
          WHERE vs.session_token = ${videoSessionToken}
        `;

        if (!callStatus) {
          return new Response(JSON.stringify({ error: "Sesión no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        const paymentConfirmed = callStatus.payment_status === 'approved';
        const professionalJoined = callStatus.video_status === 'in_progress' ||
          (callStatus.status === 'assigned' && callStatus.assigned_professional_id);

        return new Response(JSON.stringify({
          status: callStatus.status || 'awaiting_payment',
          videoStatus: callStatus.video_status,
          paymentStatus: callStatus.payment_status || 'pending',
          paymentConfirmed,
          professionalJoined,
          professionalName: callStatus.professional_name,
          roomName: `ClinicaJoseIngenieros_${callStatus.session_token.substring(0, 12)}`
        }), { status: 200, headers: corsHeaders });
      }

      // If professional session provided, verify it
      if (sessionToken) {
        const [professional] = await sql`
          SELECT id, full_name FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }
      }

      // Get queue entries
      let queue;

      if (status === "waiting") {
        queue = await sql`
          SELECT
            cq.id,
            cq.patient_name,
            cq.status,
            cq.priority,
            cq.created_at,
            vs.session_token as room_token
          FROM call_queue cq
          JOIN video_sessions vs ON cq.video_session_id = vs.id
          WHERE cq.status = 'waiting'
          ORDER BY cq.priority DESC, cq.created_at ASC
        `;
      } else if (status === "assigned" && sessionToken) {
        // Get calls assigned to this professional
        const [professional] = await sql`
          SELECT id FROM healthcare_professionals WHERE session_token = ${sessionToken}
        `;

        queue = await sql`
          SELECT
            cq.id,
            cq.patient_name,
            cq.patient_email,
            cq.patient_phone,
            cq.status,
            cq.assigned_at,
            vs.session_token as room_token
          FROM call_queue cq
          JOIN video_sessions vs ON cq.video_session_id = vs.id
          WHERE cq.assigned_professional_id = ${professional.id}
            AND cq.status IN ('assigned', 'in_progress')
          ORDER BY cq.assigned_at ASC
        `;
      } else {
        queue = await sql`
          SELECT
            cq.id,
            cq.patient_name,
            cq.status,
            cq.created_at,
            cq.assigned_at,
            hp.full_name as professional_name
          FROM call_queue cq
          LEFT JOIN healthcare_professionals hp ON cq.assigned_professional_id = hp.id
          WHERE cq.status = ${status}
          ORDER BY cq.created_at DESC
          LIMIT 50
        `;
      }

      // Get count of waiting calls
      const [countResult] = await sql`
        SELECT COUNT(*) as waiting_count FROM call_queue WHERE status = 'waiting'
      `;

      return new Response(JSON.stringify({
        queue: queue.map((q: any) => ({
          id: q.id,
          patientName: q.patient_name,
          patientEmail: q.patient_email,
          patientPhone: q.patient_phone,
          status: q.status,
          priority: q.priority,
          createdAt: q.created_at,
          assignedAt: q.assigned_at,
          professionalName: q.professional_name,
          roomName: q.room_token ? `ClinicaJoseIngenieros_${q.room_token.substring(0, 12)}` : null
        })),
        waitingCount: parseInt(countResult.waiting_count)
      }), { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error("Get queue error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/call-queue"
};
