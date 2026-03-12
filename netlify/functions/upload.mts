import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Image upload function for HDD community posts and pizarra
// Supports up to 5MB images
// H-053: Now requires authentication

export default async (req: Request, context: Context) => {
  const { getCorsHeaders } = await import("./lib/auth.mts");
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: corsHeaders });
  }

  // H-053: Auth guard - require valid session
  const authHeader = req.headers.get('Authorization');
  const sessionToken = authHeader?.replace('Bearer ', '');
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Autenticacion requerida" }),
      { status: 401, headers: corsHeaders });
  }
  try {
    const { getDatabase } = await import("./lib/db.mts");
    const { hashSessionToken } = await import("./lib/auth.mts");
    const sql = getDatabase();
    const [patient] = await sql`SELECT id FROM hdd_patients WHERE session_token = ${sessionToken} AND status = 'active'`;
    const hashedToken = await hashSessionToken(sessionToken);
    const [prof] = patient ? [null] : await sql`SELECT id FROM healthcare_professionals WHERE session_token = ${hashedToken} AND is_active = TRUE`;
    if (!patient && !prof) {
      return new Response(JSON.stringify({ error: "Sesion invalida" }),
        { status: 403, headers: corsHeaders });
    }
  } catch (authErr) {
    console.error("Upload auth error:", authErr);
    return new Response(JSON.stringify({ error: "Error de autenticacion" }),
      { status: 500, headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    // Handle base64 encoded image data
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { image, filename, folder } = body;

      if (!image) {
        return new Response(JSON.stringify({ error: "Imagen requerida" }),
          { status: 400, headers: corsHeaders });
      }

      // Extract base64 data and mime type
      const matches = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return new Response(JSON.stringify({ error: "Formato de imagen inválido" }),
          { status: 400, headers: corsHeaders });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Validate mime type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(mimeType)) {
        return new Response(JSON.stringify({ error: "Tipo de imagen no permitido. Use JPEG, PNG, GIF o WebP." }),
          { status: 400, headers: corsHeaders });
      }

      // Decode base64 to buffer
      const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      // Check size (5MB max)
      if (buffer.length > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "La imagen es muy grande (máximo 5MB)" }),
          { status: 400, headers: corsHeaders });
      }

      // Generate unique filename
      const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
      const uniqueFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const folderPath = folder || 'hdd';
      const key = `${folderPath}/${uniqueFilename}`;

      // Store in Netlify Blobs
      const store = getStore("images");
      await store.set(key, buffer.buffer as ArrayBuffer, {
        metadata: {
          contentType: mimeType,
          uploadedAt: new Date().toISOString(),
          originalFilename: filename || 'upload'
        }
      });

      // Return the URL to access the image
      const imageUrl = `/.netlify/blobs/images/${key}`;

      return new Response(JSON.stringify({
        success: true,
        url: imageUrl,
        key: key,
        message: "Imagen subida exitosamente"
      }), { status: 201, headers: corsHeaders });
    }

    // Handle multipart form data
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const folder = formData.get("folder") as string | null;

      if (!file) {
        return new Response(JSON.stringify({ error: "Archivo requerido" }),
          { status: 400, headers: corsHeaders });
      }

      // Validate mime type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return new Response(JSON.stringify({ error: "Tipo de archivo no permitido. Use JPEG, PNG, GIF o WebP." }),
          { status: 400, headers: corsHeaders });
      }

      // Check size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "El archivo es muy grande (máximo 5MB)" }),
          { status: 400, headers: corsHeaders });
      }

      // Read file as buffer
      const buffer = await file.arrayBuffer();

      // Generate unique filename
      const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const folderPath = folder || 'hdd';
      const key = `${folderPath}/${uniqueFilename}`;

      // Store in Netlify Blobs
      const store = getStore("images");
      await store.set(key, buffer, {
        metadata: {
          contentType: file.type,
          uploadedAt: new Date().toISOString(),
          originalFilename: file.name
        }
      });

      // Return the URL to access the image
      const imageUrl = `/.netlify/blobs/images/${key}`;

      return new Response(JSON.stringify({
        success: true,
        url: imageUrl,
        key: key,
        message: "Imagen subida exitosamente"
      }), { status: 201, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Content-Type no soportado" }),
      { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error("Upload error:", error);
    return new Response(JSON.stringify({
      error: "Error al subir la imagen"
    }), { status: 500, headers: corsHeaders });
  }
};

export const config: Config = {
  path: "/api/upload"
};
