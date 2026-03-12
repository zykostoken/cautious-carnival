// Shared authentication utilities for serverless functions
import bcrypt from 'bcryptjs';

// Allowed origins for CORS (H-010)
const ALLOWED_ORIGINS = [
  'https://clinicajoseingenieros.ar',
  'https://www.clinicajoseingenieros.ar',
  'https://clinicajoseingenieros.netlify.app',
];

function getAllowedOrigin(requestOrigin?: string | null): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  // Allow localhost only in development (NETLIFY_DEV is set by netlify dev)
  if (process.env.NETLIFY_DEV === 'true' && requestOrigin.startsWith('http://localhost:')) return requestOrigin;
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

// Granular session TTLs
export const SESSION_TTL = {
  PATIENT: 60 * 60 * 1000,               // 60 min - therapy session
  TELERESOURCE: 30 * 60 * 1000,          // 30 min - video/teleresource session
  GAMING_DAILY_LIMIT_MS: 60 * 60 * 1000, // 1 hr/day total across all games
  PROFESSIONAL_IDLE: 2 * 60 * 60 * 1000, // 2 hrs of inactivity
} as const;

export async function hashSessionToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string): Promise<string> {
  // bcrypt with cost factor 12 (audit H-004)
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // bcrypt hashes start with $2a$ or $2b$
  if (hash.startsWith('$2')) {
    return bcrypt.compare(password, hash);
  }

  // Legacy support: multi-round SHA-256 (10000 iterations)
  const salt = process.env.PASSWORD_SALT || '';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  let hashBuffer = await crypto.subtle.digest('SHA-256', data);
  for (let i = 0; i < 9999; i++) {
    const combined = new Uint8Array(hashBuffer.byteLength + data.byteLength);
    combined.set(new Uint8Array(hashBuffer), 0);
    combined.set(data, hashBuffer.byteLength);
    hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  }
  const multiRoundHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (multiRoundHash === hash) return true;

  // Legacy support: single-round SHA-256
  const legacyBuffer = await crypto.subtle.digest('SHA-256', data);
  const legacyHash = Array.from(new Uint8Array(legacyBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return legacyHash === hash;
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
  return Date.now() - loginTime > (ttlMs ?? SESSION_TTL.PATIENT);
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

// Persistent DB-based rate limiter (H-006)
// Uses rate_limit_entries table — survives cold starts unlike in-memory Map
export async function checkRateLimit(sql: any, key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    
    // Clean old entries and count recent attempts in one go
    await sql`DELETE FROM rate_limit_entries WHERE attempt_at < ${windowStart}`;
    
    const [result] = await sql`
      SELECT COUNT(*)::int AS attempts 
      FROM rate_limit_entries 
      WHERE limit_key = ${key} AND attempt_at >= ${windowStart}
    `;
    
    if ((result?.attempts || 0) >= maxAttempts) {
      return false; // blocked
    }
    
    // Record this attempt
    await sql`INSERT INTO rate_limit_entries (limit_key, attempt_at) VALUES (${key}, NOW())`;
    return true; // allowed
  } catch (err) {
    // If rate_limit_entries table doesn't exist or DB error, allow the request
    // (fail-open to not block legitimate users)
    console.error('Rate limit check error:', err);
    return true;
  }
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

  const hashedToken = await hashSessionToken(sessionToken);

  const [professional] = await sql`
    SELECT email, last_login, last_activity FROM healthcare_professionals
    WHERE session_token = ${hashedToken} AND is_active = TRUE
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
