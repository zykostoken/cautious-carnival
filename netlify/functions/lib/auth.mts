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

// Session expiry durations by context (H-005)
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // legacy default fallback

// Granular session TTLs
export const SESSION_TTL = {
  PATIENT: 60 * 60 * 1000,               // 60 min - therapy session
  TELERESOURCE: 30 * 60 * 1000,          // 30 min - video/teleresource session
  GAMING_DAILY_LIMIT_MS: 60 * 60 * 1000, // 1 hr/day total across all games
  PROFESSIONAL_IDLE: 2 * 60 * 60 * 1000, // 2 hrs of inactivity
} as const;

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
// ttlMs: optional override for context-specific TTL
export function isSessionExpired(lastLogin: Date | string | null, ttlMs?: number): boolean {
  if (!lastLogin) return true;
  const loginTime = new Date(lastLogin).getTime();
  return Date.now() - loginTime > (ttlMs ?? SESSION_EXPIRY_MS);
}

// Check professional session expiry based on inactivity (2hr idle)
export function isProfessionalSessionExpired(lastActivity: Date | string | null): boolean {
  if (!lastActivity) return true;
  const activityTime = new Date(lastActivity).getTime();
  return Date.now() - activityTime > SESSION_TTL.PROFESSIONAL_IDLE;
}

// Check daily gaming time limit (1hr/day across all games)
export async function checkDailyGamingLimit(sql: any, patientId: number): Promise<{ allowed: boolean; remainingMs: number; usedMs: number }> {
  const [result] = await sql`
    SELECT COALESCE(SUM(duration_seconds), 0)::int AS total_seconds
    FROM hdd_game_sessions
    WHERE patient_id = ${patientId}
      AND started_at >= CURRENT_DATE
      AND started_at < CURRENT_DATE + INTERVAL '1 day'
  `;
  const usedMs = (result?.total_seconds || 0) * 1000;
  const remainingMs = Math.max(0, SESSION_TTL.GAMING_DAILY_LIMIT_MS - usedMs);
  return { allowed: remainingMs > 0, remainingMs, usedMs };
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
    SELECT email, last_login, last_activity FROM healthcare_professionals
    WHERE session_token = ${sessionToken} AND is_active = TRUE
  `;

  if (!professional) {
    return { authorized: false, error: 'Sesion invalida' };
  }

  // Check 2hr inactivity timeout (H-005)
  const lastActive = professional.last_activity || professional.last_login;
  if (isProfessionalSessionExpired(lastActive)) {
    return { authorized: false, error: 'Sesion expirada por inactividad. Inicie sesion nuevamente.' };
  }

  // Touch last_activity to keep session alive
  await sql`UPDATE healthcare_professionals SET last_activity = NOW() WHERE id = (
    SELECT id FROM healthcare_professionals WHERE email = ${professional.email} LIMIT 1
  )`;

  return { authorized: true, email: professional.email };
}
