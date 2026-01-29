import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Mercado Pago API configuration
const MP_API_URL = "https://api.mercadopago.com";

interface MPPreferenceItem {
  title: string;
  description?: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
}

interface MPPreference {
  items: MPPreferenceItem[];
  payer?: {
    email?: string;
    name?: string;
  };
  back_urls?: {
    success: string;
    failure: string;
    pending: string;
  };
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

async function getPaymentInfo(paymentId: string, accessToken: string) {
  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mercado Pago error: ${error}`);
  }

  return response.json();
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  // Get Mercado Pago access token from environment
  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Create payment preference for telemedicine consultation
      if (action === "create_preference") {
        const { userId, planId, userEmail, userName } = body;

        if (!MP_ACCESS_TOKEN) {
          return new Response(JSON.stringify({
            error: "Sistema de pagos no configurado. Contacte a la administración."
          }), { status: 503, headers: corsHeaders });
        }

        if (!userId || !planId) {
          return new Response(JSON.stringify({
            error: "userId y planId son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Get plan details
        const [plan] = await sql`
          SELECT id, name, description, price, currency, duration_minutes
          FROM telemedicine_plans
          WHERE id = ${planId} AND is_active = TRUE
        `;

        if (!plan) {
          return new Response(JSON.stringify({
            error: "Plan no encontrado o no disponible"
          }), { status: 404, headers: corsHeaders });
        }

        // Verify user exists
        const [user] = await sql`
          SELECT id, email, full_name FROM telemedicine_users WHERE id = ${userId}
        `;

        if (!user) {
          return new Response(JSON.stringify({
            error: "Usuario no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        // Create external reference for tracking
        const externalRef = `TELE-${userId}-${planId}-${Date.now()}`;

        // Build site URL for callbacks
        const siteUrl = process.env.URL || 'https://clinicajoseingenieros.ar';

        const preference: MPPreference = {
          items: [{
            title: plan.name,
            description: plan.description || `Videoconsulta de ${plan.duration_minutes} minutos`,
            quantity: 1,
            currency_id: plan.currency || 'ARS',
            unit_price: parseFloat(plan.price)
          }],
          payer: {
            email: userEmail || user.email || undefined,
            name: userName || user.full_name || undefined
          },
          back_urls: {
            success: `${siteUrl}/#telemedicina-success`,
            failure: `${siteUrl}/#telemedicina-failure`,
            pending: `${siteUrl}/#telemedicina-pending`
          },
          auto_return: "approved",
          external_reference: externalRef,
          notification_url: `${siteUrl}/api/mercadopago/webhook`
        };

        const mpPreference = await createMPPreference(preference, MP_ACCESS_TOKEN);

        // Record the payment attempt
        await sql`
          INSERT INTO mp_payments (
            user_id, mp_preference_id, amount, currency, status,
            description, external_reference, created_at
          )
          VALUES (
            ${userId}, ${mpPreference.id}, ${plan.price}, ${plan.currency || 'ARS'},
            'pending', ${plan.name}, ${externalRef}, NOW()
          )
        `;

        return new Response(JSON.stringify({
          success: true,
          preferenceId: mpPreference.id,
          initPoint: mpPreference.init_point,
          sandboxInitPoint: mpPreference.sandbox_init_point,
          externalReference: externalRef
        }), { status: 200, headers: corsHeaders });
      }

      // Mercado Pago webhook notification
      if (action === "webhook" || req.url.includes('/webhook')) {
        const { type, data } = body;

        if (type === "payment") {
          if (!MP_ACCESS_TOKEN) {
            console.error("MP_ACCESS_TOKEN not configured for webhook");
            return new Response(JSON.stringify({ received: true }),
              { status: 200, headers: corsHeaders });
          }

          try {
            const paymentInfo = await getPaymentInfo(data.id, MP_ACCESS_TOKEN);

            // Update payment record
            await sql`
              UPDATE mp_payments
              SET
                mp_payment_id = ${paymentInfo.id.toString()},
                status = ${paymentInfo.status},
                status_detail = ${paymentInfo.status_detail},
                payment_type = ${paymentInfo.payment_type_id},
                payment_method = ${paymentInfo.payment_method_id},
                paid_at = ${paymentInfo.status === 'approved' ? sql`NOW()` : null},
                updated_at = NOW()
              WHERE external_reference = ${paymentInfo.external_reference}
            `;

            // If payment approved, activate the telemedicine session
            if (paymentInfo.status === 'approved') {
              // Extract userId from external reference (format: TELE-userId-planId-timestamp)
              const refParts = paymentInfo.external_reference.split('-');
              const userId = parseInt(refParts[1]);

              // Log credit transaction
              await sql`
                INSERT INTO credit_transactions (
                  user_id, amount, transaction_type, payment_reference, created_at
                )
                VALUES (
                  ${userId}, ${paymentInfo.transaction_amount || 1}, 'payment', ${paymentInfo.id.toString()}, NOW()
                )
              `;

              // IMPORTANT: Activate the video session and call queue entry
              // Find session by payment_reference and activate it
              const [session] = await sql`
                UPDATE video_sessions
                SET status = 'pending'
                WHERE payment_reference = ${paymentInfo.external_reference}
                  AND status = 'awaiting_payment'
                RETURNING id, user_id, session_token
              `;

              if (session) {
                // Activate call queue entry - now professionals can see it
                await sql`
                  UPDATE call_queue
                  SET status = 'waiting'
                  WHERE video_session_id = ${session.id}
                    AND status = 'awaiting_payment'
                `;

                // Get patient info for notification
                const [user] = await sql`
                  SELECT full_name, email FROM telemedicine_users WHERE id = ${session.user_id}
                `;

                // Notify professionals about the new PAID call
                const roomName = `ClinicaJoseIngenieros_${session.session_token.substring(0, 12)}`;
                const siteUrl = process.env.URL || 'https://clinicajoseingenieros.ar';

                fetch(`${siteUrl}/api/notifications`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'notify_new_call',
                    callQueueId: session.id,
                    patientName: user?.full_name || 'Paciente',
                    roomName,
                    price: paymentInfo.transaction_amount,
                    paymentConfirmed: true,
                    paymentId: paymentInfo.id
                  })
                }).catch(e => console.log('Notification trigger failed:', e));

                // Send booking confirmation to patient if email is available
                if (user?.email) {
                  fetch(`${siteUrl}/api/notifications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'send_booking_confirmation',
                      email: user.email,
                      fullName: user.full_name || 'Paciente',
                      roomName,
                      price: paymentInfo.transaction_amount,
                      sessionToken: session.session_token
                    })
                  }).catch(e => console.log('Patient confirmation failed:', e));
                }

                console.log(`Payment approved and session activated for user ${userId}: ${paymentInfo.id}`);
              } else {
                console.log(`Payment approved but no awaiting_payment session found for reference: ${paymentInfo.external_reference}`);
              }
            }
          } catch (err) {
            console.error("Error processing webhook:", err);
          }
        }

        return new Response(JSON.stringify({ received: true }),
          { status: 200, headers: corsHeaders });
      }

      // Check payment status
      if (action === "check_payment") {
        const { externalReference, paymentId } = body;

        if (!externalReference && !paymentId) {
          return new Response(JSON.stringify({
            error: "externalReference o paymentId requerido"
          }), { status: 400, headers: corsHeaders });
        }

        let payment;
        if (externalReference) {
          [payment] = await sql`
            SELECT id, user_id, mp_payment_id, amount, currency, status, status_detail,
                   payment_type, payment_method, description, external_reference,
                   created_at, paid_at
            FROM mp_payments
            WHERE external_reference = ${externalReference}
          `;
        } else {
          [payment] = await sql`
            SELECT id, user_id, mp_payment_id, amount, currency, status, status_detail,
                   payment_type, payment_method, description, external_reference,
                   created_at, paid_at
            FROM mp_payments
            WHERE mp_payment_id = ${paymentId}
          `;
        }

        if (!payment) {
          return new Response(JSON.stringify({
            error: "Pago no encontrado"
          }), { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          payment: {
            id: payment.id,
            mpPaymentId: payment.mp_payment_id,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            statusDetail: payment.status_detail,
            paymentType: payment.payment_type,
            paymentMethod: payment.payment_method,
            description: payment.description,
            createdAt: payment.created_at,
            paidAt: payment.paid_at
          }
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Mercado Pago error:", error);
      return new Response(JSON.stringify({
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Unknown error"
      }), { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Get available plans
    if (action === "plans") {
      try {
        const plans = await sql`
          SELECT id, name, description, price, currency, duration_minutes
          FROM telemedicine_plans
          WHERE is_active = TRUE
          ORDER BY price ASC
        `;

        return new Response(JSON.stringify({
          plans: plans.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: parseFloat(p.price),
            currency: p.currency,
            durationMinutes: p.duration_minutes,
            formattedPrice: `$${parseFloat(p.price).toLocaleString('es-AR')}`
          }))
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Get plans error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    // Get user's payment history
    if (action === "history") {
      const userId = url.searchParams.get("userId");

      if (!userId) {
        return new Response(JSON.stringify({ error: "userId requerido" }),
          { status: 400, headers: corsHeaders });
      }

      try {
        const payments = await sql`
          SELECT id, mp_payment_id, amount, currency, status, description,
                 created_at, paid_at
          FROM mp_payments
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 20
        `;

        return new Response(JSON.stringify({
          payments: payments.map((p: any) => ({
            id: p.id,
            mpPaymentId: p.mp_payment_id,
            amount: parseFloat(p.amount),
            currency: p.currency,
            status: p.status,
            description: p.description,
            createdAt: p.created_at,
            paidAt: p.paid_at
          }))
        }), { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Get payment history error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    // Check if Mercado Pago is configured
    if (action === "status") {
      return new Response(JSON.stringify({
        configured: !!MP_ACCESS_TOKEN,
        message: MP_ACCESS_TOKEN
          ? "Sistema de pagos configurado"
          : "Sistema de pagos no configurado"
      }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Acción requerida" }),
      { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: ["/api/mercadopago", "/api/mercadopago/webhook"]
};
