import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Image upload for community whiteboard
// Uses Netlify Blobs to store images

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB max
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default async (req: Request, context: Context) => {
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // POST - Upload image
  if (req.method === "POST") {
    try {
      const contentType = req.headers.get("content-type") || "";

      // Handle multipart form data
      if (!contentType.includes("multipart/form-data")) {
        return new Response(JSON.stringify({
          error: "Se requiere multipart/form-data"
        }), { status: 400, headers: corsHeaders });
      }

      const formData = await req.formData();
      const file = formData.get("image") as File | null;

      if (!file) {
        return new Response(JSON.stringify({
          error: "No se envió ninguna imagen"
        }), { status: 400, headers: corsHeaders });
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return new Response(JSON.stringify({
          error: "Tipo de archivo no permitido. Solo se aceptan JPG, PNG, GIF y WebP."
        }), { status: 400, headers: corsHeaders });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return new Response(JSON.stringify({
          error: "La imagen es demasiado grande. Máximo 2MB."
        }), { status: 400, headers: corsHeaders });
      }

      // Generate unique key for the image
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 10);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const imageKey = `board/${timestamp}-${randomId}.${extension}`;

      // Store in Netlify Blobs
      const store = getStore("board-images");
      const arrayBuffer = await file.arrayBuffer();

      await store.set(imageKey, arrayBuffer, {
        metadata: {
          contentType: file.type,
          originalName: file.name,
          uploadedAt: new Date().toISOString()
        }
      });

      // Return the image URL
      const imageUrl = `/api/board-images/${imageKey}`;

      return new Response(JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        key: imageKey,
        message: "Imagen subida exitosamente"
      }), { status: 201, headers: corsHeaders });

    } catch (error) {
      console.error("Board image upload error:", error);
      return new Response(JSON.stringify({
        error: "Error al subir la imagen"
      }), { status: 500, headers: corsHeaders });
    }
  }

  // GET - Retrieve image
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      // Extract key from path: /api/board-images/board/timestamp-id.ext
      const pathParts = url.pathname.replace("/api/board-images/", "");

      if (!pathParts || pathParts === "") {
        return new Response(JSON.stringify({
          error: "Clave de imagen requerida"
        }), { status: 400, headers: corsHeaders });
      }

      const store = getStore("board-images");
      const result = await store.getWithMetadata(pathParts, { type: "arrayBuffer" });

      if (!result) {
        return new Response(JSON.stringify({
          error: "Imagen no encontrada"
        }), { status: 404, headers: corsHeaders });
      }

      const contentType = (result.metadata?.contentType as string) || "image/jpeg";

      return new Response(result.data as ArrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000", // Cache for 1 year
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (error) {
      console.error("Board image fetch error:", error);
      return new Response(JSON.stringify({
        error: "Error al obtener la imagen"
      }), { status: 500, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/board-images/*"
};
