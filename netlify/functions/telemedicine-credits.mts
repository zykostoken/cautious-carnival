import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Telemedicine user management endpoint
// Note: Credit system removed - consultations are free, payment handled externally if needed
export default async (req: Request, context: Context) => {
  const sql = getDatabase();

  if (req.method === "GET") {
    // Check user registration status
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
        SELECT id, email, phone
        FROM telemedicine_users
        WHERE id = ${userId}
      `;

      if (!user) {
        return new Response(JSON.stringify({
          registered: false
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        registered: true,
        userId: user.id
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("User check error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (req.method === "POST") {
    // Register user
    try {
      const body = await req.json();
      const { action, email, phone } = body;

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
          userId: newUser.id
        }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error("User management error:", error);
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
