# Audit Fixes Log — 2026-03-13

## SPRINT 1 (CRITICOS) — COMPLETADOS

### SEC-001: rate_limit_entries table ✅
- **DB**: Table created via Supabase migration + RLS enabled
- **Code**: Added to `scripts/setup-db.mjs` (backup creation)
- **Migration**: `migrations/037_rate_limit_entries.sql`

### SEC-002: board-images.mts auth guard ✅
- **File**: `netlify/functions/board-images.mts`
- **Change**: Added session token verification for uploads

### SEC-004: XSS innerHTML sanitization ✅
- **File**: `js/core.js`
- **Change**: All user data in announcements and consultations now wrapped with `S()` (DOMPurify)
- **Change**: `parseInt()` on consultation IDs in onclick handlers

### SEC-005: Daily.co domain unified ✅
- **File**: `js/telemedicine.js`
- **Change**: Fallback domain changed from `hdd-jose-ingenieros` to `zykos`

### SEC-010: Admin emails removed from frontend ✅
- **File**: `js/core.js`
- **Change**: Hardcoded email array removed; `isAdmin()` now uses server-side role flags

## SPRINT 2 (ALTOS) — COMPLETADOS

### SEC-006: MercadoPago logic extracted ✅
- **File**: `netlify/functions/lib/mercadopago.mts` (NEW)
- **Change**: Shared pricing, createMPPreference, getPaymentInfo

### SEC-009: Anon RLS restricted ✅
- **DB**: Overly permissive SELECT/UPDATE policies dropped for anon on game/mood tables
- **Migration**: `migrations/038_restrict_anon_rls.sql`

### SEC-017: gameNames deduplicated ✅
- **File**: `js/hdd-hce.js`
- **Change**: Single `GAME_NAMES` constant at file top, removed inline duplicates

## SPRINT 3 (MEDIOS) — PARCIAL

### SEC-011: SMTP health check ✅
- **File**: `scripts/setup-db.mjs`
- **Change**: Build-time warning for missing ZOHO_SMTP_USER/PASS

### SEC-014: Legacy passwords → bcrypt ✅ (no action needed)
- Only 1 active professional, already using bcrypt

### SEC-015: CSP unsafe-inline removal — TODO
- Requires moving all inline scripts to external .js files
- High risk of breaking existing HTML pages
- Recommended for next major refactor cycle

### SEC-003: Session tokens in URL → Headers — TODO
- 24+ instances across frontend need refactoring
- Backend already supports Authorization header (upload.mts pattern)
- Recommended as dedicated PR to avoid regression

### SEC-013: localStorage → httpOnly cookies — TODO
- Requires backend cookie-setting logic
- Recommended alongside SEC-003

## Gemini findings addressed:
- **esc() vs S() in hdd-hce.js**: Verified — file uses `S()` consistently (no `esc()` found)
- **mood-modals.html empty**: Confirmed empty — serves as injection target for mood-modals.js
- **panel-profesional vs clinical-dashboard overlap**: Known — clinical-dashboard is newer; panel-profesional to be deprecated
