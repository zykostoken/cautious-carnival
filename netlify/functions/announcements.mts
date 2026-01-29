import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Announcements / Bulletin board management
// Supports both admin announcements and public community blackboard messages

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action, sessionToken } = body;

      // Verify professional session for admin operations
      let professionalId: number | null = null;
      if (sessionToken) {
        const [professional] = await sql`
          SELECT id FROM healthcare_professionals
          WHERE session_token = ${sessionToken} AND is_active = TRUE
        `;
        if (professional) {
          professionalId = professional.id;
        }
      }

      // Create new announcement (supports both admin and public community messages)
      if (action === "create") {
        const { title, content, type, authorName, color, showFrom, showUntil, isPinned } = body;

        if (!content) {
          return new Response(JSON.stringify({
            error: "Contenido es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        // Community messages (blackboard) can be posted by anyone
        const isCommunityMessage = type === 'community';

        // For non-community messages, require professional session
        if (!isCommunityMessage && !professionalId) {
          // Still allow if title is provided (basic announcement)
          if (!title) {
            return new Response(JSON.stringify({
              error: "Título es requerido para anuncios"
            }), { status: 400, headers: corsHeaders });
          }
        }

        const [announcement] = await sql`
          INSERT INTO announcements (
            title, content, author_name, type, color, is_pinned,
            show_from, show_until, created_by, created_at
          )
          VALUES (
            ${title || 'Mensaje de Pizarra'},
            ${content},
            ${authorName || null},
            ${type || 'info'},
            ${color || '#e8dcc8'},
            ${isPinned || false},
            ${showFrom ? new Date(showFrom).toISOString() : sql`NOW()`},
            ${showUntil ? new Date(showUntil).toISOString() : null},
            ${professionalId},
            NOW()
          )
          RETURNING id, title, type, author_name, color, created_at
        `;

        return new Response(JSON.stringify({
          success: true,
          announcement: {
            id: announcement.id,
            title: announcement.title,
            type: announcement.type,
            authorName: announcement.author_name,
            color: announcement.color,
            createdAt: announcement.created_at
          },
          message: isCommunityMessage ? "Mensaje publicado en la pizarra" : "Anuncio creado exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Update announcement (admin only)
      if (action === "update") {
        if (!professionalId) {
          return new Response(JSON.stringify({ error: "Se requiere autenticación de profesional" }),
            { status: 401, headers: corsHeaders });
        }

        const { id, title, content, type, isActive, isPinned, showFrom, showUntil } = body;

        if (!id) {
          return new Response(JSON.stringify({ error: "ID requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [announcement] = await sql`
          UPDATE announcements
          SET
            title = COALESCE(${title}, title),
            content = COALESCE(${content}, content),
            type = COALESCE(${type}, type),
            is_active = COALESCE(${isActive}, is_active),
            is_pinned = COALESCE(${isPinned}, is_pinned),
            show_from = COALESCE(${showFrom ? new Date(showFrom).toISOString() : null}, show_from),
            show_until = ${showUntil ? new Date(showUntil).toISOString() : null},
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING id, title, type, is_active, updated_at
        `;

        if (!announcement) {
          return new Response(JSON.stringify({ error: "Anuncio no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          announcement,
          message: "Anuncio actualizado"
        }), { status: 200, headers: corsHeaders });
      }

      // Delete announcement (admin only)
      if (action === "delete") {
        if (!professionalId) {
          return new Response(JSON.stringify({ error: "Se requiere autenticación de profesional" }),
            { status: 401, headers: corsHeaders });
        }

        const { id } = body;

        if (!id) {
          return new Response(JSON.stringify({ error: "ID requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [deleted] = await sql`
          DELETE FROM announcements WHERE id = ${id} RETURNING id
        `;

        if (!deleted) {
          return new Response(JSON.stringify({ error: "Anuncio no encontrado" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Anuncio eliminado"
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Announcements error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "20");

    try {
      let announcements;

      if (includeInactive) {
        // Admin view - all announcements
        announcements = await sql`
          SELECT
            a.id,
            a.title,
            a.content,
            a.author_name,
            a.type,
            a.color,
            a.is_active,
            a.is_pinned,
            a.show_from,
            a.show_until,
            a.created_at,
            a.updated_at,
            hp.full_name as created_by_name
          FROM announcements a
          LEFT JOIN healthcare_professionals hp ON a.created_by = hp.id
          ORDER BY a.is_pinned DESC, a.created_at DESC
          LIMIT ${limit}
        `;
      } else if (type) {
        // Filtered by type (e.g., community for blackboard)
        announcements = await sql`
          SELECT
            a.id,
            a.title,
            a.content,
            a.author_name,
            a.type,
            a.color,
            a.is_pinned,
            a.created_at
          FROM announcements a
          WHERE a.is_active = TRUE
            AND a.show_from <= NOW()
            AND (a.show_until IS NULL OR a.show_until > NOW())
            AND a.type = ${type}
          ORDER BY a.is_pinned DESC, a.created_at DESC
          LIMIT ${limit}
        `;
      } else {
        // Public view - only active announcements within their display window
        announcements = await sql`
          SELECT
            a.id,
            a.title,
            a.content,
            a.author_name,
            a.type,
            a.color,
            a.is_pinned,
            a.created_at
          FROM announcements a
          WHERE a.is_active = TRUE
            AND a.show_from <= NOW()
            AND (a.show_until IS NULL OR a.show_until > NOW())
          ORDER BY a.is_pinned DESC, a.created_at DESC
          LIMIT ${limit}
        `;
      }

      return new Response(JSON.stringify({
        announcements: announcements.map((a: any) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          author_name: a.author_name,
          type: a.type,
          color: a.color,
          isActive: a.is_active,
          isPinned: a.is_pinned,
          showFrom: a.show_from,
          showUntil: a.show_until,
          createdAt: a.created_at,
          created_at: a.created_at,
          updatedAt: a.updated_at,
          createdByName: a.created_by_name
        }))
      }), { status: 200, headers: corsHeaders });

    } catch (error) {
      console.error("Get announcements error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/announcements"
};
