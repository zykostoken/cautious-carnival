// Shared authentication utilities for serverless functions

// Allowed origins for CORS (H-010)
const ALLOWED_ORIGINS = [
  'https://clinicajoseingenieros.ar',
  'https://www.clinicajoseingenieros.ar',
  'https://clinicajoseingenieros.netlify.app',
];

function getAllowedOrigin(requestOrigin?: string | null): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // Allow localhost in development
  if (requestOrigin.startsWith('http://localhost:')) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

export function getCorsHeaders(requestOrigin?: string | null) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  };
}

// Backward-compatible CORS_HEADERS - defaults to primary domain
export const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// Session expiry duration (H-005): 24 hours
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = process.env.PASSWORD_SALT;
  if (!salt) {
    throw new Error("PASSWORD_SALT environment variable is required for security. Set it in Netlify environment variables.");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  // PBKDF2-like: iterate SHA-256 multiple rounds for better resistance (H-004)
  let hashBuffer = await crypto.subtle.digest('SHA-256', data);
  for (let i = 0; i < 9999; i++) {
    const combined = new Uint8Array(hashBuffer.byteLength + data.byteLength);
    combined.set(new Uint8Array(hashBuffer), 0);
    combined.set(data, hashBuffer.byteLength);
    hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  }
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support legacy single-round SHA-256 hashes during migration
  const salt = process.env.PASSWORD_SALT || '';
  const encoder = new TextEncoder();
  const legacyData = encoder.encode(password + salt);
  const legacyBuffer = await crypto.subtle.digest('SHA-256', legacyData);
  const legacyHash = Array.from(new Uint8Array(legacyBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (legacyHash === hash) return true;

  // Try new multi-round hash
  try {
    const newHash = await hashPassword(password);
    return newHash === hash;
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check if a session token is expired (H-005)
export function isSessionExpired(lastLogin: Date | string | null): boolean {
  if (!lastLogin) return true;
  const loginTime = new Date(lastLogin).getTime();
  return Date.now() - loginTime > SESSION_EXPIRY_MS;
}

export function corsResponse(requestOrigin?: string | null) {
  return new Response(null, { status: 204, headers: getCorsHeaders(requestOrigin) });
}

export function jsonResponse(data: any, status = 200, requestOrigin?: string | null) {
  return new Response(JSON.stringify(data), { status, headers: getCorsHeaders(requestOrigin) });
}

export function errorResponse(error: string, status = 400, requestOrigin?: string | null) {
  return new Response(JSON.stringify({ error }), { status, headers: getCorsHeaders(requestOrigin) });
}

// Simple in-memory rate limiter (H-006)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= maxAttempts) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

// HTML escape to prevent XSS in email templates (H-056)
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auth guard: verify admin session token from request
export async function requireAdminSession(sql: any, req: Request): Promise<{ authorized: boolean; email?: string; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  const sessionToken = authHeader?.replace('Bearer ', '') || new URL(req.url).searchParams.get('sessionToken');

  if (!sessionToken) {
    return { authorized: false, error: 'Token de sesion requerido' };
  }

  const [professional] = await sql`
    SELECT email, last_login FROM healthcare_professionals
    WHERE session_token = ${sessionToken} AND is_active = TRUE
  `;

  if (!professional) {
    return { authorized: false, error: 'Sesion invalida' };
  }

  // Check session expiry
  if (isSessionExpired(professional.last_login)) {
    return { authorized: false, error: 'Sesion expirada. Inicie sesion nuevamente.' };
  }

  return { authorized: true, email: professional.email };
}
