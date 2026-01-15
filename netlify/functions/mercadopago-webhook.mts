import type { Context, Config } from "@netlify/functions";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { neon } from "@netlify/neon";

// Mercado Pago webhook - receives payment notifications
export default async (req: Request, context: Context) => {
  const sql = neon();

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");

    // Also check body for IPN format
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Body might be empty for some webhook types
    }

    const paymentId = id || body.data?.id || body.id;
    const notificationType = topic || body.type || body.topic;

    console.log("Webhook received:", { notificationType, paymentId, body });

    // Only process payment notifications
    if (notificationType !== "payment" && notificationType !== "payment.created" && notificationType !== "payment.updated") {
      return new Response(JSON.stringify({ received: true, processed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ error: "No payment ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Initialize Mercado Pago client
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured");
      return new Response(JSON.stringify({ error: "Not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);

    // Get payment details from Mercado Pago
    const paymentInfo = await payment.get({ id: String(paymentId) });

    console.log("Payment info:", {
      status: paymentInfo.status,
      external_reference: paymentInfo.external_reference,
      transaction_amount: paymentInfo.transaction_amount
    });

    // Only process approved payments
    if (paymentInfo.status !== "approved") {
      console.log(`Payment ${paymentId} status: ${paymentInfo.status} - not processing`);
      return new Response(JSON.stringify({
        received: true,
        processed: false,
        status: paymentInfo.status
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const externalReference = paymentInfo.external_reference;
    if (!externalReference || !externalReference.startsWith("telemed_")) {
      console.log("Invalid external reference:", externalReference);
      return new Response(JSON.stringify({ error: "Invalid reference" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse user ID from external reference (format: telemed_userId_timestamp)
    const parts = externalReference.split("_");
    const userId = parseInt(parts[1], 10);
    const amount = Math.round(paymentInfo.transaction_amount || 0);

    if (!userId || !amount) {
      console.error("Could not parse user/amount from reference:", externalReference);
      return new Response(JSON.stringify({ error: "Invalid reference format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check if this payment was already processed
    const [existingTx] = await sql`
      SELECT id FROM credit_transactions
      WHERE payment_reference = ${String(paymentId)}
      AND transaction_type = 'credit'
    `;

    if (existingTx) {
      console.log("Payment already processed:", paymentId);
      return new Response(JSON.stringify({
        received: true,
        processed: false,
        reason: "already_processed"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Update pending transaction to credit
    await sql`
      UPDATE credit_transactions
      SET transaction_type = 'credit',
          payment_reference = ${String(paymentId)}
      WHERE payment_reference = ${externalReference}
      AND transaction_type = 'pending'
    `;

    // If no pending transaction, create new one
    const [updated] = await sql`
      SELECT id FROM credit_transactions
      WHERE payment_reference = ${String(paymentId)}
      AND transaction_type = 'credit'
    `;

    if (!updated) {
      await sql`
        INSERT INTO credit_transactions (
          user_id, amount, transaction_type, payment_reference, created_at
        )
        VALUES (${userId}, ${amount}, 'credit', ${String(paymentId)}, NOW())
      `;
    }

    // Add credits to user balance
    await sql`
      UPDATE telemedicine_users
      SET credit_balance = credit_balance + ${amount},
          updated_at = NOW()
      WHERE id = ${userId}
    `;

    console.log(`Credits added: ${amount} to user ${userId} via payment ${paymentId}`);

    return new Response(JSON.stringify({
      success: true,
      received: true,
      processed: true,
      userId,
      amount,
      paymentId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({
      error: "Webhook processing failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/mercadopago/webhook"
};
