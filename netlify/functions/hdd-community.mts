import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Helper to verify patient session
async function verifyPatientSession(sql: any, sessionToken: string): Promise<{ id: number; fullName: string } | null> {
  const [patient] = await sql`
    SELECT id, full_name FROM hdd_patients
    WHERE session_token = ${sessionToken} AND status = 'active'
  `;
  return patient ? { id: patient.id, fullName: patient.full_name } : null;
}

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

      // Verify patient session for all write operations
      if (!sessionToken) {
        return new Response(JSON.stringify({ error: "Token requerido" }),
          { status: 400, headers: corsHeaders });
      }

      const patient = await verifyPatientSession(sql, sessionToken);
      if (!patient) {
        return new Response(JSON.stringify({ error: "Sesión inválida" }),
          { status: 401, headers: corsHeaders });
      }

      // Create new post
      if (action === "create_post") {
        const { content, postType, imageUrl } = body;

        if (!content || content.trim().length === 0) {
          return new Response(JSON.stringify({
            error: "El contenido es requerido"
          }), { status: 400, headers: corsHeaders });
        }

        const [post] = await sql`
          INSERT INTO hdd_community_posts (
            patient_id, content, post_type, image_url, created_at
          )
          VALUES (
            ${patient.id},
            ${content.trim()},
            ${postType || 'text'},
            ${imageUrl || null},
            NOW()
          )
          RETURNING id, content, post_type, image_url, created_at
        `;

        return new Response(JSON.stringify({
          success: true,
          post: {
            id: post.id,
            content: post.content,
            postType: post.post_type,
            imageUrl: post.image_url,
            authorName: patient.fullName,
            likesCount: 0,
            commentsCount: 0,
            createdAt: post.created_at
          },
          message: "Publicación creada exitosamente"
        }), { status: 201, headers: corsHeaders });
      }

      // Delete post (only own posts)
      if (action === "delete_post") {
        const { postId } = body;

        if (!postId) {
          return new Response(JSON.stringify({ error: "ID de publicación requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [deleted] = await sql`
          DELETE FROM hdd_community_posts
          WHERE id = ${postId} AND patient_id = ${patient.id}
          RETURNING id
        `;

        if (!deleted) {
          return new Response(JSON.stringify({
            error: "Publicación no encontrada o no tienes permiso para eliminarla"
          }), { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Publicación eliminada"
        }), { status: 200, headers: corsHeaders });
      }

      // Add comment
      if (action === "add_comment") {
        const { postId, content } = body;

        if (!postId || !content || content.trim().length === 0) {
          return new Response(JSON.stringify({
            error: "ID de publicación y contenido son requeridos"
          }), { status: 400, headers: corsHeaders });
        }

        // Verify post exists
        const [post] = await sql`
          SELECT id FROM hdd_community_posts WHERE id = ${postId} AND is_approved = TRUE
        `;

        if (!post) {
          return new Response(JSON.stringify({ error: "Publicación no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        const [comment] = await sql`
          INSERT INTO hdd_post_comments (post_id, patient_id, content, created_at)
          VALUES (${postId}, ${patient.id}, ${content.trim()}, NOW())
          RETURNING id, content, created_at
        `;

        return new Response(JSON.stringify({
          success: true,
          comment: {
            id: comment.id,
            content: comment.content,
            authorName: patient.fullName,
            createdAt: comment.created_at
          }
        }), { status: 201, headers: corsHeaders });
      }

      // Delete comment (only own comments)
      if (action === "delete_comment") {
        const { commentId } = body;

        if (!commentId) {
          return new Response(JSON.stringify({ error: "ID de comentario requerido" }),
            { status: 400, headers: corsHeaders });
        }

        const [deleted] = await sql`
          DELETE FROM hdd_post_comments
          WHERE id = ${commentId} AND patient_id = ${patient.id}
          RETURNING id
        `;

        if (!deleted) {
          return new Response(JSON.stringify({
            error: "Comentario no encontrado o no tienes permiso para eliminarlo"
          }), { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          message: "Comentario eliminado"
        }), { status: 200, headers: corsHeaders });
      }

      // Toggle like
      if (action === "toggle_like") {
        const { postId } = body;

        if (!postId) {
          return new Response(JSON.stringify({ error: "ID de publicación requerido" }),
            { status: 400, headers: corsHeaders });
        }

        // Check if already liked
        const [existingLike] = await sql`
          SELECT id FROM hdd_post_likes
          WHERE post_id = ${postId} AND patient_id = ${patient.id}
        `;

        if (existingLike) {
          // Unlike
          await sql`DELETE FROM hdd_post_likes WHERE id = ${existingLike.id}`;
          await sql`
            UPDATE hdd_community_posts
            SET likes_count = GREATEST(likes_count - 1, 0)
            WHERE id = ${postId}
          `;

          return new Response(JSON.stringify({
            success: true,
            liked: false,
            message: "Like eliminado"
          }), { status: 200, headers: corsHeaders });
        } else {
          // Like
          await sql`
            INSERT INTO hdd_post_likes (post_id, patient_id, created_at)
            VALUES (${postId}, ${patient.id}, NOW())
          `;
          await sql`
            UPDATE hdd_community_posts
            SET likes_count = likes_count + 1
            WHERE id = ${postId}
          `;

          return new Response(JSON.stringify({
            success: true,
            liked: true,
            message: "Like agregado"
          }), { status: 200, headers: corsHeaders });
        }
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Community error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const sessionToken = url.searchParams.get("sessionToken");
    const postId = url.searchParams.get("postId");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    try {
      // Get current patient ID if session provided
      let currentPatientId: number | null = null;
      if (sessionToken) {
        const patient = await verifyPatientSession(sql, sessionToken);
        if (patient) {
          currentPatientId = patient.id;
        }
      }

      // Get all posts (feed)
      if (action === "feed" || !action) {
        const posts = await sql`
          SELECT
            p.id,
            p.content,
            p.post_type,
            p.image_url,
            p.likes_count,
            p.is_pinned,
            p.created_at,
            pt.full_name as author_name,
            pt.photo_url as author_photo,
            (SELECT COUNT(*) FROM hdd_post_comments WHERE post_id = p.id) as comments_count,
            ${currentPatientId ? sql`
              EXISTS(SELECT 1 FROM hdd_post_likes WHERE post_id = p.id AND patient_id = ${currentPatientId}) as user_liked
            ` : sql`FALSE as user_liked`},
            ${currentPatientId ? sql`
              p.patient_id = ${currentPatientId} as is_own_post
            ` : sql`FALSE as is_own_post`}
          FROM hdd_community_posts p
          JOIN hdd_patients pt ON p.patient_id = pt.id
          WHERE p.is_approved = TRUE
          ORDER BY p.is_pinned DESC, p.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

        return new Response(JSON.stringify({
          posts: posts.map((p: any) => ({
            id: p.id,
            content: p.content,
            postType: p.post_type,
            imageUrl: p.image_url,
            likesCount: p.likes_count,
            commentsCount: parseInt(p.comments_count),
            isPinned: p.is_pinned,
            authorName: p.author_name,
            authorPhoto: p.author_photo,
            userLiked: p.user_liked,
            isOwnPost: p.is_own_post,
            createdAt: p.created_at
          }))
        }), { status: 200, headers: corsHeaders });
      }

      // Get single post with comments
      if (action === "post" && postId) {
        const [post] = await sql`
          SELECT
            p.id,
            p.content,
            p.post_type,
            p.image_url,
            p.likes_count,
            p.created_at,
            pt.full_name as author_name,
            pt.photo_url as author_photo,
            ${currentPatientId ? sql`
              EXISTS(SELECT 1 FROM hdd_post_likes WHERE post_id = p.id AND patient_id = ${currentPatientId}) as user_liked
            ` : sql`FALSE as user_liked`},
            ${currentPatientId ? sql`
              p.patient_id = ${currentPatientId} as is_own_post
            ` : sql`FALSE as is_own_post`}
          FROM hdd_community_posts p
          JOIN hdd_patients pt ON p.patient_id = pt.id
          WHERE p.id = ${postId} AND p.is_approved = TRUE
        `;

        if (!post) {
          return new Response(JSON.stringify({ error: "Publicación no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        const comments = await sql`
          SELECT
            c.id,
            c.content,
            c.created_at,
            pt.full_name as author_name,
            pt.photo_url as author_photo,
            ${currentPatientId ? sql`
              c.patient_id = ${currentPatientId} as is_own_comment
            ` : sql`FALSE as is_own_comment`}
          FROM hdd_post_comments c
          JOIN hdd_patients pt ON c.patient_id = pt.id
          WHERE c.post_id = ${postId}
          ORDER BY c.created_at ASC
        `;

        return new Response(JSON.stringify({
          post: {
            id: post.id,
            content: post.content,
            postType: post.post_type,
            imageUrl: post.image_url,
            likesCount: post.likes_count,
            authorName: post.author_name,
            authorPhoto: post.author_photo,
            userLiked: post.user_liked,
            isOwnPost: post.is_own_post,
            createdAt: post.created_at
          },
          comments: comments.map((c: any) => ({
            id: c.id,
            content: c.content,
            authorName: c.author_name,
            authorPhoto: c.author_photo,
            isOwnComment: c.is_own_comment,
            createdAt: c.created_at
          }))
        }), { status: 200, headers: corsHeaders });
      }

      // Get user's own posts
      if (action === "my_posts" && sessionToken) {
        if (!currentPatientId) {
          return new Response(JSON.stringify({ error: "Sesión inválida" }),
            { status: 401, headers: corsHeaders });
        }

        const posts = await sql`
          SELECT
            p.id,
            p.content,
            p.post_type,
            p.image_url,
            p.likes_count,
            p.created_at,
            (SELECT COUNT(*) FROM hdd_post_comments WHERE post_id = p.id) as comments_count
          FROM hdd_community_posts p
          WHERE p.patient_id = ${currentPatientId}
          ORDER BY p.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

        return new Response(JSON.stringify({
          posts: posts.map((p: any) => ({
            id: p.id,
            content: p.content,
            postType: p.post_type,
            imageUrl: p.image_url,
            likesCount: p.likes_count,
            commentsCount: parseInt(p.comments_count),
            isOwnPost: true,
            createdAt: p.created_at
          }))
        }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción requerida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("HDD Community GET error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/hdd/community"
};
