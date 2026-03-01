import type { Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Cron: se ejecuta cada 5 minutos
// Busca sesiones pagadas pero no atendidas que pasaron 1 hora
// → cancela la sala Daily + solicita reembolso en MercadoPago

const DAILY_API = "https://api.daily.co/v1";
const MP_API = "https://api.mercadopago.com";

export default async () => {
  const sql = getDatabase();
  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

  try {
    // Buscar todas las sesiones pagadas que vencieron sin ser atendidas
    const expired = await sql`
      SELECT vs.id, vs.user_id, vs.session_token, vs.daily_room_name,
             vs.payment_reference, vs.credits_held, vs.expires_at,
             tu.full_name, tu.email
      FROM video_sessions vs
      LEFT JOIN telemedicine_users tu ON tu.id = vs.user_id
      WHERE vs.status = 'pending'
        AND vs.expires_at < NOW()
        AND vs.attended_at IS NULL
    `;

    if (expired.length === 0) {
      console.log('[expire-cron] No expired sessions.');
      return new Response('OK - no expired sessions', { status: 200 });
    }

    console.log(`[expire-cron] Processing ${expired.length} expired sessions`);

    for (const session of expired) {
      try {
        // 1. Cancelar sesión y cola
        await sql`
          UPDATE video_sessions
          SET status = 'expired',
              cancelled_at = NOW(),
              cancel_reason = 'No atendido en 1 hora - reembolso automático'
          WHERE id = ${session.id} AND status = 'pending'
        `;
        await sql`
          UPDATE call_queue SET status = 'cancelled'
          WHERE video_session_id = ${session.id} AND status = 'waiting'
        `;

        // 2. Eliminar sala Daily
        if (DAILY_API_KEY && session.daily_room_name) {
          try {
            await fetch(`${DAILY_API}/rooms/${session.daily_room_name}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${DAILY_API_KEY}` }
            });
            console.log(`[expire-cron] Daily room deleted: ${session.daily_room_name}`);
          } catch (e) {
            console.error(`[expire-cron] Failed to delete Daily room:`, e);
          }
        }

        // 3. Reembolso MercadoPago
        let refundStatus = 'no_payment_found';
        if (MP_ACCESS_TOKEN && session.payment_reference) {
          const [mpPayment] = await sql`
            SELECT mp_payment_id, amount FROM mp_payments
            WHERE external_reference = ${session.payment_reference}
              AND status = 'approved'
              AND mp_payment_id IS NOT NULL
          `;

          if (mpPayment?.mp_payment_id) {
            try {
              const refundRes = await fetch(
                `${MP_API}/v1/payments/${mpPayment.mp_payment_id}/refunds`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ amount: mpPayment.amount })
                }
              );
              const refund = await refundRes.json();
              refundStatus = refund.status || 'requested';

              await sql`
                UPDATE mp_payments
                SET status = 'refunded', refunded_at = NOW()
                WHERE external_reference = ${session.payment_reference}
              `;

              console.log(`[expire-cron] Refund requested for ${session.session_token}: ${refundStatus}`);
            } catch (refundErr) {
              refundStatus = 'error';
              console.error(`[expire-cron] Refund failed:`, refundErr);
            }
          }
        }

        // 4. Notificar al paciente por mail
        const siteUrl = process.env.URL || 'https://clinicajoseingenieros.ar';
        if (session.email) {
          fetch(`${siteUrl}/api/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'send_refund_notification',
              email: session.email,
              fullName: session.full_name || 'Paciente',
              refundStatus,
              sessionToken: session.session_token
            })
          }).catch(() => {});
        }

        console.log(`[expire-cron] Session ${session.session_token} expired. Refund: ${refundStatus}`);

      } catch (sessionErr) {
        console.error(`[expire-cron] Error processing session ${session.id}:`, sessionErr);
      }
    }

    return new Response(`OK - processed ${expired.length} sessions`, { status: 200 });

  } catch (err) {
    console.error('[expire-cron] Fatal error:', err);
    return new Response('Error', { status: 500 });
  }
};

export const config: Config = {
  schedule: "*/5 * * * *"   // cada 5 minutos
};
