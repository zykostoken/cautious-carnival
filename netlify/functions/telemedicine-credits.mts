import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

export default async (req: Request, context: Context) => {
  const sql = neon();

  if (req.method === "GET") {
    // Check credits for a user
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const [user] = await sql`
        SELECT credit_balance, email, phone
        FROM telemedicine_users
        WHERE id = ${userId}
      `;

      if (!user) {
        return new Response(JSON.stringify({
          creditBalance: 0,
          hasCredits: false,
          minimumRequired: 5000  // Minimum credits for a consultation
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      const minimumRequired = 5000; // $5000 ARS minimum for consultation

      return new Response(JSON.stringify({
        creditBalance: user.credit_balance,
        hasCredits: user.credit_balance >= minimumRequired,
        minimumRequired
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("Credits check error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (req.method === "POST") {
    // Add credits or create user
    try {
      const body = await req.json();
      const { action, email, phone, amount, paymentReference } = body;

      if (action === "register") {
        // Register new user
        if (!email && !phone) {
          return new Response(JSON.stringify({ error: "Email or phone required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [existingUser] = await sql`
          SELECT id FROM telemedicine_users
          WHERE email = ${email || null} OR phone = ${phone || null}
        `;

        if (existingUser) {
          return new Response(JSON.stringify({
            success: true,
            userId: existingUser.id,
            message: "User already exists"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        const [newUser] = await sql`
          INSERT INTO telemedicine_users (email, phone, credit_balance, created_at)
          VALUES (${email || null}, ${phone || null}, 0, NOW())
          RETURNING id
        `;

        return new Response(JSON.stringify({
          success: true,
          userId: newUser.id,
          creditBalance: 0
        }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (action === "add_credits") {
        // Add credits (after payment verification - simplified for now)
        const { userId } = body;

        if (!userId || !amount || amount <= 0) {
          return new Response(JSON.stringify({ error: "userId and positive amount required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Record the transaction
        await sql`
          INSERT INTO credit_transactions (
            user_id, amount, transaction_type, payment_reference, created_at
          )
          VALUES (${userId}, ${amount}, 'credit', ${paymentReference || null}, NOW())
        `;

        // Update user balance
        const [updated] = await sql`
          UPDATE telemedicine_users
          SET credit_balance = credit_balance + ${amount}
          WHERE id = ${userId}
          RETURNING credit_balance
        `;

        return new Response(JSON.stringify({
          success: true,
          newBalance: updated?.credit_balance || 0
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
      console.error("Credits management error:", error);
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
  path: "/api/telemedicine/credits"
};
