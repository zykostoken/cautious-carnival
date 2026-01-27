import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Consultations/Inquiries management endpoint
// Allows visitors to submit questions and inquiries about the clinic's services

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // POST - Submit a new consultation/inquiry
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Submit a new inquiry
      if (action === "submit" || !action) {
        const { name, email, phone, subject, message, consultationType, sessionId } = body;

        if (!name || !message) {
          return new Response(JSON.stringify({
            error: "El nombre y el mensaje son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        if (!email && !phone) {
          return new Response(JSON.stringify({
            error: "Por favor proporcione un email o teléfono para contactarlo"
          }), { status: 400, headers: corsHeaders });
        }

        // Insert the consultation
        const [consultation] = await sql`
          INSERT INTO consultations (
            name, email, phone, subject, message,
            consultation_type, session_id, status, created_at
          )
          VALUES (
            ${name},
            ${email || null},
            ${phone || null},
            ${subject || 'Consulta General'},
            ${message},
            ${consultationType || 'general'},
            ${sessionId || null},
            'pending',
            NOW()
          )
          RETURNING id, created_at
        `;

        // Notify staff about new consultation (async, don't wait)
        fetch(`${new URL(req.url).origin}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_new_consultation',
            consultationId: consultation.id,
            name,
            email,
            phone,
            subject: subject || 'Consulta General',
            consultationType: consultationType || 'general'
          })
        }).catch(e => console.log('Notification trigger failed:', e));

        return new Response(JSON.stringify({
          success: true,
          consultationId: consultation.id,
          message: "Su consulta ha sido recibida. Nos pondremos en contacto a la brevedad."
        }), { status: 201, headers: corsHeaders });
      }

      // Mark as read (for staff)
      if (action === "mark_read") {
        const { consultationId, sessionToken } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Sesión requerida" }),
            { status: 401, headers: corsHeaders });
        }

        // Verify professional session
        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        await sql`
          UPDATE consultations
          SET is_read = TRUE, status = 'read'
          WHERE id = ${consultationId}
        `;

        return new Response(JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders });
      }

      // Mark as responded (for staff)
      if (action === "mark_responded") {
        const { consultationId, sessionToken, notes } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Sesión requerida" }),
            { status: 401, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        await sql`
          UPDATE consultations
          SET status = 'responded',
              responded_at = NOW(),
              responded_by = ${professional.id},
              notes = ${notes || null}
          WHERE id = ${consultationId}
        `;

        return new Response(JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders });
      }

      // Archive consultation
      if (action === "archive") {
        const { consultationId, sessionToken } = body;

        if (!sessionToken) {
          return new Response(JSON.stringify({ error: "Sesión requerida" }),
            { status: 401, headers: corsHeaders });
        }

        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        await sql`
          UPDATE consultations
          SET status = 'archived'
          WHERE id = ${consultationId}
        `;

        return new Response(JSON.stringify({ success: true }),
          { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Consultation error:", error);
      return new Response(JSON.stringify({
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Unknown error"
      }), { status: 500, headers: corsHeaders });
    }
  }

  // GET - List consultations (for staff)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get("sessionToken");
    const status = url.searchParams.get("status");
    const consultationType = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    try {
      // Verify professional session for accessing the list
      if (sessionToken) {
        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken}
        `;

        if (!professional) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }
      } else {
        // Without session token, only return count of pending (for public dashboard)
        const [countResult] = await sql`
          SELECT COUNT(*) as pending_count
          FROM consultations
          WHERE status = 'pending'
        `;

        return new Response(JSON.stringify({
          pendingCount: parseInt(countResult.pending_count)
        }), { status: 200, headers: corsHeaders });
      }

      // Build query based on filters
      let consultations;

      if (status && consultationType) {
        consultations = await sql`
          SELECT c.*, hp.full_name as responded_by_name
          FROM consultations c
          LEFT JOIN healthcare_professionals hp ON c.responded_by = hp.id
          WHERE c.status = ${status} AND c.consultation_type = ${consultationType}
          ORDER BY c.created_at DESC
          LIMIT ${limit}
        `;
      } else if (status) {
        consultations = await sql`
          SELECT c.*, hp.full_name as responded_by_name
          FROM consultations c
          LEFT JOIN healthcare_professionals hp ON c.responded_by = hp.id
          WHERE c.status = ${status}
          ORDER BY c.created_at DESC
          LIMIT ${limit}
        `;
      } else if (consultationType) {
        consultations = await sql`
          SELECT c.*, hp.full_name as responded_by_name
          FROM consultations c
          LEFT JOIN healthcare_professionals hp ON c.responded_by = hp.id
          WHERE c.consultation_type = ${consultationType}
          ORDER BY c.created_at DESC
          LIMIT ${limit}
        `;
      } else {
        // Default: get pending and read (not archived)
        consultations = await sql`
          SELECT c.*, hp.full_name as responded_by_name
          FROM consultations c
          LEFT JOIN healthcare_professionals hp ON c.responded_by = hp.id
          WHERE c.status IN ('pending', 'read', 'responded')
          ORDER BY
            CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END,
            c.created_at DESC
          LIMIT ${limit}
        `;
      }

      // Get counts by status
      const statusCounts = await sql`
        SELECT status, COUNT(*) as count
        FROM consultations
        GROUP BY status
      `;

      return new Response(JSON.stringify({
        consultations: consultations.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          subject: c.subject,
          message: c.message,
          consultationType: c.consultation_type,
          status: c.status,
          isRead: c.is_read,
          notes: c.notes,
          respondedAt: c.responded_at,
          respondedByName: c.responded_by_name,
          createdAt: c.created_at
        })),
        counts: statusCounts.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {})
      }), { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error("Get consultations error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/consultations"
};
