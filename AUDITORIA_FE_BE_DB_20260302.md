# AUDITORÍA COMPLETA: Frontend ↔ Backend ↔ Database
## Fecha: 2026-03-02
## Proyecto: Clínica José Ingenieros (clinicajoseingenieros.ar)

---

## ARQUITECTURA ACTUAL

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (Netlify Static)                          │
│  clinicajoseingenieros.ar                           │
│                                                     │
│  index.html → js/core.js → /api/* (Netlify Fns)    │
│  hdd/portal/* → Supabase directo (anon key)         │
│  games/play/* → Supabase directo (anon key)         │
│  hdd/admin/*  → Supabase directo (anon key)         │
│  games/portal/* → Supabase directo (anon key)       │
└─────────────────┬──────────────────┬────────────────┘
                  │                  │
         Netlify Functions    Supabase Client JS
         (Postgres directo)   (REST API + anon key)
                  │                  │
                  ▼                  ▼
┌─────────────────────────────────────────────────────┐
│  SUPABASE (buzblnkpfydeheingzgn)                    │
│  PostgreSQL + REST API                              │
│  Region: sa-east-1                                  │
└─────────────────────────────────────────────────────┘
```

### Dos vías de acceso a la DB:

1. **Netlify Functions** (`/api/*`): Conexión Postgres directa via `SUPABASE_DATABASE_URL`. RLS NO aplica. Autenticación a nivel de app.
2. **Supabase Client JS** (games, HDD portal, admin): Usa REST API + anon key. RLS SÍ aplica.

---

## HALLAZGOS CRÍTICOS

### 1. 17 TABLAS/VISTAS FALTANTES
El código referenciaba 17 tablas/vistas que **no existían** en la base de datos. Las migraciones estaban en el repo (`migrations/006-013`) pero **nunca se aplicaron**.

| Tabla/Vista | Usado por | Estado |
|---|---|---|
| `hdd_games` | Todos los juegos + admin | ✅ CREADA |
| `hdd_game_sessions` | neuro-chef, pill-organizer, admin | ✅ CREADA |
| `hdd_game_progress` | admin panel | ✅ CREADA |
| `hdd_game_schedule` | games-auth backend | ✅ CREADA |
| `hdd_mood_checkins` | neuro-chef pre/post mood | ✅ CREADA |
| `hdd_crisis_alerts` | admin clinical alerts | ✅ CREADA |
| `hdd_game_color_selections` | color psychology tracking | ✅ CREADA |
| `hdd_patient_monthly_summaries` | admin monthly reports | ✅ CREADA |
| `hdd_interaction_log` | session tracking | ✅ CREADA |
| `hdd_resources` | admin resource library | ✅ CREADA |
| `game_access_codes` | external partner access | ✅ CREADA |
| `game_access_sessions` | external sessions | ✅ CREADA |
| `external_game_sessions` | external game tracking | ✅ CREADA |
| `hdd_game_biometrics` | games/portal/dashboard.html | ✅ CREADA (VIEW) |
| `v_hdd_session_analysis` | metrics-dashboard.html | ✅ CREADA (VIEW) |
| `v_patient_game_summary` | hdd-admin.mts | ✅ CREADA (VIEW) |
| `v_patient_clinical_profile` | hdd-admin.mts | ✅ CREADA (VIEW) |

### 2. COLUMNA FALTANTE EN hdd_game_metrics
El código de neuro-chef y pill-organizer envía `game_session_id` pero la tabla solo tenía `session_id` (varchar).
- ✅ Se agregó `game_session_id INTEGER` (nullable) a `hdd_game_metrics`

### 3. KEYS DE SUPABASE INCORRECTAS (4 archivos)

| Archivo | Problema | Estado |
|---|---|---|
| `games/portal/dashboard.html` | Key de proyecto `yqpqfzvgcmvxvqzvtajx` | ✅ CORREGIDO |
| `games/play/neuro-chef/dashboard.html` | Key de proyecto `yqpqfzvgcmvxvqzvtajx` | ✅ CORREGIDO |
| `hdd/portal/metrics-dashboard.html` | Key de proyecto `yqpqfzvgcmvxvqzvtajx` | ✅ CORREGIDO |
| `hdd/portal/metrics.html` | `YOUR_SUPABASE_URL` placeholder | ✅ CORREGIDO |

### 4. RLS POLICIES
Todas las tablas nuevas tienen RLS habilitado con policies `anon` para lectura/escritura (custom auth a nivel de aplicación).

---

## ESTADO FINAL DE TABLAS

### Tablas con flujo completo verificado (FE → BE → DB):

| Tabla | Frontend | Backend | DB | RLS |
|---|---|---|---|---|
| consultations | core.js `/api/consultations` | consultations.mts | ✅ | ✅ |
| hdd_patients | juegos + portal | hdd-auth.mts | ✅ | ✅ |
| hdd_game_metrics | todos los juegos | hdd-admin.mts | ✅ | ✅ |
| hdd_mood_entries | mood-modals.js | hdd-admin.mts | ✅ | ✅ |
| hdd_games | juegos (select slug→id) | hdd-games.mts | ✅ | ✅ |
| hdd_game_sessions | neuro-chef, pill-org | hdd-admin.mts | ✅ | ✅ |
| hdd_community_posts | hdd-portal | hdd-community.mts | ✅ | ✅ |
| healthcare_professionals | telemedicine | professionals.mts | ✅ | ✅ |
| telemedicine_users | telemedicine | telemedicine-session.mts | ✅ | ✅ |

### Tablas solo usadas por backend (Netlify Functions, Postgres directo):

| Tabla | Backend | DB | Notas |
|---|---|---|---|
| hdd_crisis_alerts | hdd-admin.mts | ✅ | Alertas clínicas |
| hdd_resources | hdd-admin.mts | ✅ | Biblioteca recursos |
| hdd_game_progress | hdd-admin.mts | ✅ | Progreso agregado |
| hdd_interaction_log | hdd-admin.mts | ✅ | Log interacciones |
| game_access_codes | games-auth.mts | ✅ | Acceso externo |
| call_queue | call-queue.mts | ✅ | Cola videollamadas |
| video_sessions | telemedicine-session.mts | ✅ | Sesiones video |
| mp_payments | mercadopago.mts | ✅ | Pagos MercadoPago |

---

## JUEGOS REGISTRADOS EN hdd_games

| Slug | Nombre | Áreas Terapéuticas |
|---|---|---|
| lawn-mower | Cortadora de Césped | motricidad_fina, planificación, atención, control_impulsos |
| neuro-chef-v2 | Neuro Chef | memoria, planificación, secuenciación, atención |
| daily-routine | Rutina Diaria | planificación, secuenciación, autonomía |
| super-market | Supermercado | memoria, cálculo, decision_making |
| pill-organizer | Organizador de Pastillas | atención, responsabilidad_terapéutica, motricidad_fina |
| fridge-logic | Lógica de Heladera | categorización, planificación, lógica_espacial |

---

## VISTAS CLÍNICAS

### hdd_game_biometrics
Extrae métricas biométricas de `hdd_game_metrics` (reaction_time, d_prime, tremor, hits/misses).

### v_hdd_session_analysis
Cruza `hdd_game_sessions` + `hdd_mood_entries` para dashboard de paciente. Incluye tags psicológicos basados en color seleccionado.

### v_patient_game_summary
Resumen longitudinal por juego: baseline → latest score, progreso, promedios biométricos.

### v_patient_clinical_profile
Perfil clínico global cruzando todos los juegos: tendencia de score, promedios generales.

---

## PENDIENTES IDENTIFICADOS

1. **SEO**: clinicajoseingenieros.com.ar (dominio externo no controlado) aparece antes en buscadores
2. **Redes sociales**: no integradas todavía
3. **Video streaming**: Daily.co integrado via call-queue.mts
4. **Email**: Configurado via Netlify functions (notifications.mts)
5. **Tablas huérfanas**: escenas, eventos_interaccion, hotspots, sesiones_juego, resultados_sesion, pacientes, pacientes_auth (del sistema de juegos viejo - evaluar si migrar datos o deprecar)
