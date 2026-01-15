import type { Context, Config } from "@netlify/functions";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { neon } from "@netlify/neon";

// Mercado Pago checkout - creates payment preferences
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
    const { userId, amount, description } = body;

    if (!userId || !amount || amount < 1000) {
      return new Response(JSON.stringify({
        error: "userId and amount (minimum $1000) required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verify user exists
    const [user] = await sql`
      SELECT id, email, phone FROM telemedicine_users WHERE id = ${userId}
    `;

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Initialize Mercado Pago with access token
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({
        error: "Payment system not configured"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const client = new MercadoPagoConfig({
      accessToken: accessToken
    });

    const preference = new Preference(client);

    // Create unique external reference for this transaction
    const externalReference = `telemed_${userId}_${Date.now()}`;

    // Get the base URL for callbacks
    const baseUrl = process.env.URL || "https://joseingenieros.netlify.app";

    // Create the preference
    const preferenceData = await preference.create({
      body: {
        items: [
          {
            id: `credits_${userId}`,
            title: description || "Créditos Telemedicina - Clínica José Ingenieros",
            description: "Créditos para consultas de telemedicina",
            quantity: 1,
            currency_id: "ARS",
            unit_price: amount
          }
        ],
        payer: {
          email: user.email || undefined,
          phone: user.phone ? {
            number: user.phone
          } : undefined
        },
        back_urls: {
          success: `${baseUrl}/telemedicina?payment=success&userId=${userId}&amount=${amount}`,
          failure: `${baseUrl}/telemedicina?payment=failure&userId=${userId}`,
          pending: `${baseUrl}/telemedicina?payment=pending&userId=${userId}`
        },
        auto_return: "approved",
        external_reference: externalReference,
        notification_url: `${baseUrl}/api/mercadopago/webhook`,
        statement_descriptor: "CLINICA JOSE ING",
        payment_methods: {
          excluded_payment_types: [],
          installments: 1
        }
      }
    });

    // Store pending transaction for webhook verification
    await sql`
      INSERT INTO credit_transactions (
        user_id, amount, transaction_type, payment_reference, created_at
      )
      VALUES (
        ${userId},
        ${amount},
        'pending',
        ${externalReference},
        NOW()
      )
    `;

    return new Response(JSON.stringify({
      success: true,
      preferenceId: preferenceData.id,
      initPoint: preferenceData.init_point,
      sandboxInitPoint: preferenceData.sandbox_init_point,
      externalReference
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Mercado Pago checkout error:", error);
    return new Response(JSON.stringify({
      error: "Error creating payment preference",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/mercadopago/checkout"
};
