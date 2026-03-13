# AUDITORÍA COMPLETA — cautious-carnival
## Fecha: 2026-03-13 | Repo: zykostoken/cautious-carnival | Branch: main
## 158 archivos | 55,730 líneas | 60+ tablas Supabase

---

## A. TABLAS SUPABASE NO REFERENCIADAS EN CÓDIGO (ORPHAN)

| Tabla | Estado | Acción |
|---|---|---|
| `app_roles` | ORPHAN | No la usa ningún .js/.mts. Creada en migración pero sin lógica. **Eliminar o conectar** |
| `audit_logs` | ORPHAN | Trigger-based audit log genérico, sin lectura. **OK si es solo trigger** |
| `hce_audit_log` | ORPHAN | Tabla de auditoría HCE, no se lee. **Conectar a hdd-hce.mts** |
| `hce_clinical_entries` | ORPHAN | Creada en migración 016 pero el código usa `hce_evoluciones` en su lugar. **Dual sistema — consolidar** |
| `hce_disciplines` | ORPHAN | Tabla de disciplinas/especialidades. **hdd-hce.js tiene hardcoded SPECIALTY_COLORS en su lugar** |

## B. VISTAS NO USADAS

| Vista | Usada | Notas |
|---|---|---|
| `v_hce_resumen_paciente` | ❌ DEAD | Nunca consultada. Dashboard admin usa queries directas |
| `v_hdd_session_analysis` | ✅ | metrics-dashboard.html |
| `v_patient_clinical_profile` | ✅ | hdd-admin.mts |
| `v_patient_game_summary` | ✅ | hdd-admin.mts |
| `v_professional_patient_interactions` | ✅ | hdd-admin.mts |
| `v_professional_usage_summary` | ✅ | hdd-admin.mts |

## C. CÓDIGO MUERTO (25 funciones dead)

### Críticas (deberían funcionar pero no se llaman):
- `closeJitsi()` en hdd-admin.js — vestigio de migración Jitsi→Daily
- `abrirAgendamiento()` en telemedicine.js — feature de agendamiento no conectada
- `iniciarConsultaInmediata()` en telemedicine.js — flujo de consulta inmediata roto
- `telemedRegister/Login/Logout/Cancel/End/Verify` — pipeline completo de telemedicina desconectado del HTML
- `safeInnerHTML()` en sanitize.js — función útil pero nadie la llama (todos usan S())

### Portal dead code (mood checkin viejo):
- `showMoodCheckinModal/hideMoodCheckinModal/submitMoodCheckin/skipMoodCheckin/selectColorOnly/setColorIntensity/renderColorPalette` — todo reemplazado por mood-modals.js

### Neuro-chef:
- `removeTyping()` — sin uso
- `setupPlayerLogin()` — reemplazado por URL params

## D. FUNCIONES DUPLICADAS (24 funciones definidas 2+ veces)

### Backend duplicación CRÍTICA:
- `createMPPreference()` → 3 archivos (lib/mercadopago.mts, mercadopago.mts, telemedicine-session.mts)
- `getPaymentInfo()` → 2 archivos
- `getPriceForCurrentHour()` → 3 archivos
- `isAdminSession()` → 2 archivos (lib/admin-roles.mts, professionals.mts)
- `generateSessionToken()` → 2 archivos (lib/auth.mts, games-auth.mts)
- `logNotification()` → 2 archivos

### Frontend duplicación:
- `api()` → hdd-admin.js, hdd-portal.js (OK — cada uno tiene su scope)
- `closeModal()` → 4 archivos
- `escapeHtml()` → 4 archivos
- `formatDate()` → 3 archivos
- `login/logout/verifySession/showApp/showLoginForm/switchTab` → 2+ archivos cada uno

## E. SEGURIDAD RESIDUAL

### XSS pendiente:
- `neuro-chef/dashboard.html:85` — innerHTML con `patient.full_name` sin sanitizar

### Errores silenciados:
- 48 empty catch blocks `catch(e) {}` — errores tragados sin log

### Tokens en URLs residuales:
- Los api() helpers interceptan tokens del URL, pero el URL sigue conteniendo `&sessionToken=` en el query string visible. Los browsers lo cachean en history.

## F. GAPS EN MIGRACIONES

- GAP: 028 → 034 (faltan 029, 030, 031, 032, 033)
- Dos formatos de versionado: `001-038` (secuencial) y `20260114000000` (timestamp)
- No es un bug funcional pero indica migraciones borradas o renumeradas

## G. HTML SIN DEPENDENCIAS CRÍTICAS

| Archivo | Supabase | DOMPurify | AutoSave |
|---|---|---|---|
| games/index.html | ❌ | ❌ | ❌ |
| games/portal/index.html | ❌ | ✅ | ❌ |
| hce/index.html | ❌ | ❌ | ❌ |
| hce/usuarios.html | ❌ | ❌ | ❌ |
| hdd/admin/hce.html | ❌ | ✅ | ❌ |
| hdd/admin/index.html | ❌ | ✅ | ❌ |
| hdd/index.html | ❌ | ✅ | ❌ |
| hdd/portal/index.html | ❌ | ✅ | ❌ |
| index.html (main) | ❌ | ✅ | ❌ |

Nota: los HTML admin/portal no cargan supabase-config.js directamente porque usan la API backend (/api/*). Esto es correcto — van por Netlify Functions.

## H. CONCORDANCIA CÓDIGO ↔ TABLAS SUPABASE

### Tablas con flujo COMPLETO (frontend → backend → DB):
✅ hdd_patients, healthcare_professionals, hdd_game_metrics, hdd_game_sessions,
   hdd_mood_checkins, hdd_mood_entries, hdd_activities, hdd_resources,
   announcements, consultations, hdd_community_posts, video_sessions,
   call_queue, notification_log, hdd_login_tracking, rate_limit_entries

### Tablas con flujo PARCIAL (solo backend → DB, sin frontend):
⚠ professional_audit_log (backend log, no se muestra)
⚠ service_usage (entitlement tracking, sin UI)
⚠ hdd_patient_monthly_summaries (definida pero sin generador)
⚠ scheduled_appointments (existe pero el agendamiento no está conectado)

### Tablas ORPHAN (en DB pero sin código que las use):
❌ app_roles, audit_logs, hce_audit_log, hce_clinical_entries, hce_disciplines
