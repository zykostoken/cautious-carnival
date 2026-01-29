import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Serve images from Netlify Blobs storage

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Extract the image key from the URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/.netlify/blobs/images/");

    if (pathParts.length < 2 || !pathParts[1]) {
      return new Response("Not found", { status: 404 });
    }

    const key = decodeURIComponent(pathParts[1]);

    // Get from blob store
    const store = getStore("images");
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!result || !result.data) {
      return new Response("Image not found", { status: 404 });
    }

    const contentType = result.metadata?.contentType || 'image/jpeg';

    return new Response(result.data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Serve image error:", error);
    return new Response("Error loading image", { status: 500 });
  }
};

export const config: Config = {
  path: "/.netlify/blobs/images/*"
};
