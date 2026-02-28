# CLAUDE.md — Clínica Psiquiátrica José Ingenieros

Guía de referencia para asistentes de IA trabajando en este repositorio.

---

## Resumen del proyecto

**Clínica Psiquiátrica Privada José Ingenieros SRL** — sitio web completo con:

- Landing page institucional con telemedicina y pagos MercadoPago
- Portal de Hospital de Día Digital (HDD) para pacientes internos
- Juegos terapéuticos con métricas biométricas y psicomotoras
- Portal externo de juegos para partners/investigadores
- Panel administrativo clínico para profesionales de salud
- Sistema de videoconsultas con sala de espera y cobro por créditos

**URL de producción:** `https://clinicajoseingenieros.ar`
**Netlify dashboard:** `https://app.netlify.com/sites/joseingenieros`
**Supabase project:** `https://supabase.com/dashboard/project/yqpqfzvgcmvxvqzvtajx`

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5 + CSS3 + JavaScript vanilla (sin bundler) |
| Backend | Netlify Functions (TypeScript `.mts`) |
| Base de datos | Supabase (PostgreSQL vía `postgresjs`) |
| Despliegue | Netlify (auto-deploy desde `master`) |
| Pagos | MercadoPago API |
| Email | Zoho SMTP vía `nodemailer` |
| Juego 3D | Phaser 3 (Neuro-Chef) |
| Storage biométrico | Netlify Blobs + Supabase Storage |

---

## Estructura de directorios

```
cautious-carnival/
├── index.html                    # Landing page institucional principal
├── netlify.toml                  # Config de Netlify: build, funciones, redirects, headers
├── package.json                  # Dependencias Node (Netlify Functions)
├── deno.lock                     # Lockfile Deno (legacy, no activo)
├── scripts/
│   └── setup-db.mjs              # Script de migración DB — corre en build de Netlify
├── js/                           # JavaScript frontend (cargados como módulos en HTML)
│   ├── core.js                   # Funcionalidad central: nav, modales, analytics
│   ├── effects.js                # Efectos visuales (parallax, partículas, etc.)
│   ├── hdd-admin.js              # Lógica del panel administrativo HDD
│   ├── hdd-index.js              # JS de la página pública HDD
│   ├── hdd-portal.js             # Lógica del portal de pacientes HDD (openGame, launchGame)
│   ├── modal-content.js          # Contenido HTML de todos los modales (~1.3MB)
│   └── telemedicine.js           # Flujo de telemedicina + integración MercadoPago
├── css/
│   ├── main.css                  # Estilos globales (landing + componentes)
│   ├── hdd-admin.css             # Estilos panel admin
│   ├── hdd-index.css             # Estilos página pública HDD
│   └── hdd-portal.css            # Estilos portal pacientes
├── hdd/                          # Sección Hospital de Día
│   ├── index.html                # Página pública del HDD
│   ├── admin/
│   │   ├── index.html            # Dashboard admin (login de profesionales)
│   │   ├── panel-profesional.html  # Panel longitudinal de seguimiento
│   │   └── clinical-dashboard.html # Dashboard clínico (filtro por DNI)
│   └── portal/
│       ├── index.html            # Portal del paciente HDD (juegos, comunidad, recursos)
│       ├── metrics.html          # Métricas del paciente
│       ├── metrics-dashboard.html # Dashboard de métricas con gráficos
│       └── games/
│           ├── lawn-mower.html   # Cortadora de césped (copia HDD)
│           └── medication-memory.html  # Memoria de medicación (copia HDD)
├── games/                        # Portal externo de juegos (para partners/investigadores)
│   ├── index.html                # Login/landing del portal de juegos
│   ├── shared/
│   │   ├── mood-modals.html      # HTML de modales 3 fases (pre/post juego)
│   │   └── mood-modals.js        # Lógica de modales de estado de ánimo
│   ├── portal/
│   │   ├── index.html            # Portal post-auth (lista de juegos)
│   │   └── dashboard.html        # Dashboard del portal externo
│   └── play/
│       ├── daily-routine.html    # Juego: rutina diaria
│       ├── fridge-logic.html     # Juego: lógica de heladera
│       ├── lawn-mower.html       # Juego: cortadora de césped
│       ├── medication-memory.html  # Juego: memoria de medicación
│       ├── pill-organizer.html   # Juego: organizador de pastillas (drag & drop)
│       ├── super-market.html     # Juego: supermercado
│       └── neuro-chef/           # Juego Phaser.js: cocina neurocognitiva
│           ├── index.html        # Pantalla de juego
│           ├── dashboard.html    # Dashboard del juego
│           └── js/
│               ├── game.js       # Lógica principal Phaser
│               ├── levels.js     # Definición de niveles
│               ├── biometrics.js # Captura biométrica en juego
│               ├── config.js     # Configuración Phaser
│               └── educational-tips.js  # Tips educativos
├── HDDD/
│   └── index.html                # Portal standalone HDDD (acceso directo)
├── netlify/
│   └── functions/                # Serverless functions (TypeScript .mts)
│       ├── lib/
│       │   ├── db.mts            # Conexión Supabase PostgreSQL (singleton)
│       │   ├── auth.mts          # Utilidades: hash, tokens, CORS helpers
│       │   ├── notifications.mts # Envío de emails vía Zoho SMTP
│       │   └── admin-roles.mts   # Roles y permisos admin
│       ├── analytics.mts         # Tracking de sesiones y eventos
│       ├── announcements.mts     # Gestión de anuncios del tablón
│       ├── biometricas.mts       # Almacenamiento de datos biométricos en Supabase Storage
│       ├── board-images.mts      # Imágenes del tablón de anuncios
│       ├── call-queue.mts        # Cola de videoconsultas y gestión de turnos
│       ├── consultations.mts     # Consultas/inquiries de contacto web
│       ├── games-auth.mts        # Auth del portal externo de juegos (códigos de acceso)
│       ├── hdd-admin.mts         # Operaciones admin HDD (pacientes, actividades, métricas)
│       ├── hdd-auth.mts          # Autenticación de pacientes HDD (DNI + PIN)
│       ├── hdd-community.mts     # Posts, comentarios y likes comunidad HDD
│       ├── hdd-games.mts         # Sesiones de juego, mood tracking, métricas longitudinales
│       ├── mercadopago.mts       # Creación de preferencias y webhooks de pago
│       ├── migrate.mts           # Endpoint de migración manual de DB
│       ├── notifications.mts     # Notificaciones push/email a pacientes y profesionales
│       ├── professionals.mts     # Auth y gestión de profesionales de salud
│       ├── serve-image.mts       # Sirve imágenes desde Supabase Storage
│       ├── submission-created.mts  # Webhook de formularios Netlify
│       ├── telemedicine-credits.mts  # Gestión de créditos de telemedicina
│       ├── telemedicine-session.mts  # Ciclo de vida de sesiones de video
│       ├── track-session.mts     # Tracking de analytics de sesión
│       ├── track-survey.mts      # Respuestas de encuestas
│       └── upload.mts            # Subida de archivos
├── sql/                          # Migrations adicionales (ejecutar manualmente en Supabase)
│   ├── 01_color_psychology.sql   # 60 colores con tags psicológicos (12 familias × 5 intensidades)
│   ├── 02_game_sessions.sql      # Sesiones de juego con mood tracking
│   ├── 03_neurochef_telemetry.sql  # Telemetría Neuro-Chef
│   └── 04_unified_metrics.sql    # Métricas unificadas longitudinales
├── migrations/                   # Historial de migrations Supabase
│   ├── 001_initial.sql           # Schema base
│   └── ... (013 migrations total)
└── docs/
    └── framework-biomet.md       # Marco semiológico métricas biométricas psicomotoras
```

---

## Routing y despliegue (Netlify)

El site es **estático** — no hay paso de build para el frontend.

```toml
# netlify.toml resumen
[build]
  publish = "."           # El directorio raíz ES el sitio
  command = "npm install && npm run setup-db"  # Solo instala deps y corre migrations

[functions]
  directory = "netlify/functions"  # Funciones en TypeScript .mts
```

**Redirects clave:**
- `/api/*` → `/.netlify/functions/:splat` (todas las llamadas API)
- `/hdd` → `/hdd/index.html`
- `/hdd/portal` → `/hdd/portal/index.html` (con `force = true`)
- `/games` → `/games/index.html`
- `/*` → `/index.html` (SPA fallback)

**Headers de caché:**
- CSS/JS: `max-age=31536000, immutable` (1 año — contenido versionado por hash)
- Imágenes HDD: `max-age=604800` (1 semana)
- HTML: `max-age=300, must-revalidate` (5 minutos)

---

## Backend: Netlify Functions

Todas las funciones viven en `netlify/functions/*.mts` y son TypeScript.

### Patrón estándar de función

```typescript
import { getDatabase } from "./lib/db.mts";
import { corsResponse, jsonResponse, errorResponse, CORS_HEADERS } from "./lib/auth.mts";

export default async (req: Request) => {
  // 1. Manejar preflight CORS
  if (req.method === "OPTIONS") return corsResponse();

  // 2. Parsear acción
  const { action, ...data } = await req.json();

  // 3. Obtener conexión DB
  const sql = getDatabase();

  // 4. Switch por acción
  switch (action) {
    case "my_action":
      const result = await sql`SELECT ...`;
      return jsonResponse(result);
    default:
      return errorResponse("Unknown action", 400);
  }
};

export const config = { path: "/api/my-endpoint" };
```

### Helpers compartidos en `lib/`

| Helper | Función |
|--------|---------|
| `getDatabase()` | Singleton PostgreSQL con pool (max 10 conexiones, SSL required, sin prepared statements para compatibilidad con Supabase Transaction Pooler) |
| `hashPassword(pwd)` | SHA-256 con salt de env var `PASSWORD_SALT` |
| `verifyPassword(pwd, hash)` | Verificación de contraseña |
| `generateSessionToken()` | UUID + timestamp base36 |
| `generateVerificationCode()` | PIN numérico de 6 dígitos |
| `CORS_HEADERS` | Headers CORS estándar (permite todos los orígenes) |
| `corsResponse()` | Respuesta 204 para OPTIONS |
| `jsonResponse(data, status)` | Response JSON con CORS |
| `errorResponse(msg, status)` | Response de error con CORS |

---

## Base de datos: Supabase PostgreSQL

### Conexión
```
Variable: SUPABASE_DATABASE_URL
Puerto: 6543 (Transaction Pooler — NO usar prepared statements)
SSL: required
```

La función `getDatabase()` en `lib/db.mts` gestiona un singleton con:
- `prepare: false` — requerido para el Transaction Pooler de Supabase
- `max: 10` — pool de conexiones
- `idle_timeout: 20`, `connect_timeout: 10`
- IPv4 forzado vía `dns.setDefaultResultOrder('ipv4first')`

### Tablas principales

**Sistema general:**
- `user_sessions` — tracking de sesiones de visitantes
- `section_views`, `modal_opens`, `contact_interactions`, `generic_events` — analytics
- `survey_responses` — respuestas a encuestas
- `consultations` — formularios de contacto del sitio
- `telemedicine_interest` — pre-registro para telemedicina

**Telemedicina:**
- `telemedicine_users` — pacientes de telemedicina (email/phone/DNI, créditos)
- `credit_transactions` — historial de créditos
- `video_sessions` — sesiones de videoconsulta (pending/active/completed/cancelled)
- `scheduled_appointments` — turnos programados
- `mp_payments` — pagos MercadoPago
- `telemedicine_plans` — planes con precios dinámicos por horario (ARS)
- `call_queue` — cola de llamadas entrantes para profesionales
- `notification_log` — log de notificaciones enviadas

**Profesionales:**
- `healthcare_professionals` — psiquiatras, psicólogos, TO, enfermeros (con auth, disponibilidad)
- `announcements` — tablón de anuncios del HDD

**HDD (Hospital de Día):**
- `hdd_patients` — pacientes activos del HDD (DNI + PIN, sesión token)
- `hdd_community_posts` — posts de la comunidad HDD
- `hdd_post_comments`, `hdd_post_likes` — interacciones sociales
- `hdd_activities` — actividades terapéuticas (música, huerta, cocina, etc.)
- `hdd_attendance` — asistencia a actividades
- `hdd_login_tracking` — tracking de logins y sesiones de pacientes

**Juegos terapéuticos:**
- `hdd_games` — catálogo de juegos (slug, nombre, áreas terapéuticas)
- `hdd_game_schedule` — disponibilidad horaria de juegos
- `hdd_game_sessions` — sesiones individuales de juego (score, nivel, métricas JSONB)
- `hdd_game_progress` — progreso agregado por paciente/juego
- `hdd_game_metrics` — métricas unificadas longitudinales (todas las métricas van aquí)
- `hdd_mood_entries` — selecciones de color post-actividad (sin interpretación clínica)

**Portal externo:**
- `game_access_codes` — códigos de acceso para partners/investigadores
- `game_access_sessions` — sesiones activas de acceso externo
- `external_game_sessions` — sesiones de juego de usuarios externos

**Vistas SQL:**
- `v_patient_game_summary` — resumen de sesiones por paciente/juego
- `v_patient_color_timeline` — timeline de colores elegidos por paciente

### Schema de migrations

Las migrations se corren en dos lugares:
1. **`scripts/setup-db.mjs`** — corre automáticamente en cada build de Netlify (`npm run setup-db`). Crea tablas con `CREATE TABLE IF NOT EXISTS` y usa `ALTER TABLE ADD COLUMN IF NOT EXISTS` para ser idempotente.
2. **`sql/` y `migrations/`** — SQL adicional a ejecutar manualmente en el SQL Editor de Supabase.

---

## Autenticación

### Pacientes HDD
- Login con **DNI** (como username) + **PIN/contraseña**
- Contraseña hasheada con SHA-256 + `PASSWORD_SALT`
- Token de sesión guardado en `hdd_patients.session_token` y en `localStorage`
- Endpoint: `/api/hdd-auth`

### Profesionales de Salud
- Login con **email** + **contraseña**
- Verificación de email requerida (código de 6 dígitos)
- Token de sesión en `healthcare_professionals.session_token`
- Endpoint: `/api/professionals`

### Portal Externo de Juegos
- Acceso con **código de acceso** (tabla `game_access_codes`)
- Genera un `game_access_sessions` con token
- Tipos de código: `demo`, `partner`, `researcher`
- Endpoint: `/api/games-auth`

### Pacientes de Telemedicina
- Registro con email o teléfono + nombre + DNI
- Créditos pre-pagados vía MercadoPago
- Endpoint: `/api/telemedicine-session`

---

## Sistema de juegos terapéuticos

### Juegos disponibles

| Slug | Nombre | Áreas terapéuticas |
|------|--------|-------------------|
| `lawn-mower` | Cortadora de Césped | Motricidad fina, planificación, atención, control de impulsos |
| `medication-memory` | Memoria de Medicación | Memoria de trabajo, atención al detalle, responsabilidad terapéutica |
| `pill-organizer` | Organizador de Pastillas | Planificación, secuenciación, motricidad (drag & drop) |
| `neuro-chef` | Neuro-Chef | Múltiples funciones ejecutivas (Phaser 3) |
| `daily-routine` | Rutina Diaria | Organización temporal, hábitos |
| `fridge-logic` | Lógica de Heladera | Razonamiento lógico, categorización |
| `super-market` | Supermercado | Planificación, gestión de recursos |

### Flujo de sesión de juego (modales 3 fases)

```
1. PRE-GAME: Chat conversacional (3 preguntas abiertas)
2. JUEGO: Sesión de juego activa
3. POST-GAME:
   a. Intensidad emocional (5 círculos: muy leve → muy intenso)
   b. Selección de color (60 colores = 12 familias × 5 intensidades)
   c. Modal proyectivo (sin referencias emocionales explícitas)
```

Los modales están en `games/shared/mood-modals.html` + `mood-modals.js`.

### Tracking de paciente

El `patient_id` / `patient_dni` se pasa siempre:
```javascript
// Desde URL params
const urlParams = new URLSearchParams(window.location.search);
const patientId = urlParams.get('patient_id');

// O desde localStorage
const patientId = localStorage.getItem('hdd_patient_id');
```

**Regla crítica:** Cada registro en `hdd_game_metrics` y `hdd_mood_entries` tiene `patient_dni` y/o `patient_id`. **Nunca mezclar datos entre pacientes.**

### Métricas biométricas psicomotoras

Definidas en `docs/framework-biomet.md`. El módulo `games/shared/biomet.js` captura:
- **Tremor**: en reposo, al inicio, terminal
- **Praxis**: rectificaciones, eficiencia de trayectoria, errores de omisión/comisión
- **Atención/RT**: latencia de inicio, tiempo de reacción (media, SD, CV)
- **Funciones ejecutivas**: impulsividad, flexibilidad, inhibición motora

Los datos se guardan en `metric_type: 'session_biomet'` en `hdd_game_metrics`.

---

## Frontend: convenciones

### Organización del JS

No hay bundler ni transpilación. Los archivos JS se cargan directamente en HTML:
```html
<script src="/js/core.js"></script>
<script src="/js/modal-content.js"></script>
<script src="/js/telemedicine.js"></script>
```

**`js/core.js`** — funciones globales usadas en todo el sitio:
- `openModal(id)` / `closeModal(id)` — sistema de modales
- Analytics básico (track session, section views)
- Navegación, scroll, efectos hover

**`js/modal-content.js`** — contiene el HTML completo de todos los modales del landing page (archivo muy grande, ~1.3MB). Al modificar modales de la landing, editar este archivo.

**`js/hdd-portal.js`** — lógica del portal de pacientes:
- `openGame(slug)` — abre juegos del HDD (lawn-mower, medication-memory)
- `launchGame(gameSlug)` — lanza juegos del portal externo (pill-organizer, neuro-chef)
- Gestión de comunidad, recursos, perfil

### Llamadas a la API desde frontend

```javascript
// Patrón estándar para llamadas al backend
const response = await fetch('/api/hdd-games', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'save_session',
    patient_id: currentPatientId,
    game_slug: 'lawn-mower',
    // ...
  })
});
const data = await response.json();
```

Las funciones se acceden via `/api/<nombre-función>` gracias al redirect de Netlify.

---

## Variables de entorno requeridas

Configurar en **Netlify** → `https://app.netlify.com/sites/joseingenieros/configuration/env`

| Variable | Estado | Descripción |
|----------|--------|-------------|
| `SUPABASE_DATABASE_URL` | **REQUERIDA** | URL de conexión PostgreSQL Supabase (puerto 6543 para Transaction Pooler) |
| `MP_ACCESS_TOKEN` | **REQUERIDA** | Token de MercadoPago (empieza con `APP_USR-` en producción, `TEST-` en pruebas) |
| `ZOHO_SMTP_USER` | Configurada | Email de Zoho para envío de notificaciones |
| `ZOHO_SMTP_PASS` | Configurada | Contraseña SMTP de Zoho |
| `ZOHO_SMTP_HOST` | Configurada | `smtp.zoho.com` |
| `ZOHO_SMTP_PORT` | Configurada | `465` |
| `PASSWORD_SALT` | Opcional | Salt para hash de contraseñas (default: `clinica_salt_2024`) |

**Sin `SUPABASE_DATABASE_URL`:** El script de setup-db omite la migración silenciosamente (no falla el build).

---

## Flujo de telemedicina

```
1. Paciente abre modal "Telemedicina" en landing
2. Registro: nombre, email, teléfono, DNI
3. Selección de servicio con precio dinámico por horario:
   - Diurna 09-13hs:    $120.000 ARS
   - Vespertina 13-20hs: $150.000 ARS
   - Nocturna 20-09hs:  $200.000 ARS
4. Pago via MercadoPago → webhook actualiza créditos
5. Sala de espera (cola de llamadas)
6. Videochat con profesional
7. Al finalizar: se descuentan créditos proporcionalmente
```

Funciones involucradas:
- `mercadopago.mts` — crea preference, maneja webhook IPN
- `telemedicine-session.mts` — crea/gestiona `video_sessions`
- `telemedicine-credits.mts` — operaciones de créditos
- `call-queue.mts` — lógica de asignación de profesionales

---

## Workflow de desarrollo

### Setup local

```bash
# Clonar e instalar
npm install

# Desarrollo local con Netlify Dev (levanta funciones serverless)
npm run dev
# → http://localhost:8888
```

### Sin variables de entorno configuradas

La app funciona en modo degradado: el frontend carga normalmente, pero las llamadas a la API que requieren DB fallarán. Es posible trabajar en HTML/CSS/JS sin configurar Supabase.

### Modificar una función serverless

1. Editar el archivo `.mts` correspondiente en `netlify/functions/`
2. Las funciones se recargan automáticamente con `netlify dev`
3. La URL de la función es `/api/<nombre-sin-.mts>`

### Agregar un juego nuevo

1. Crear `games/play/<nombre-juego>.html`
2. Integrar `games/shared/mood-modals.html` y `mood-modals.js`
3. Agregar el juego al catálogo en `hdd_games` (SQL o via admin)
4. Agregar función `launchGame('<nombre>')` en `js/hdd-portal.js`
5. Agregar redirect en `netlify.toml` si es necesario
6. Integrar `games/shared/biomet.js` para captura biométrica

### Modificar la DB (agregar tabla/columna)

1. Agregar `CREATE TABLE IF NOT EXISTS` o `ALTER TABLE ADD COLUMN IF NOT EXISTS` al SQL en `scripts/setup-db.mjs`
2. El script es idempotente — se ejecuta en cada deploy
3. Para migrations manuales complejas: agregar archivo en `migrations/` y ejecutar en Supabase SQL Editor

---

## Despliegue

El despliegue es **automático** al hacer push al branch `master` en GitHub.

```bash
# Proceso de deploy
git push origin master
# → Netlify detecta el push
# → Ejecuta: npm install && npm run setup-db
# → Deploy del directorio raíz como sitio estático
# → Funciones TypeScript compiladas automáticamente por Netlify
```

**Deploy preview:** Cada Pull Request genera un preview URL automáticamente.

### Verificar que funciona

```bash
# Verificar Supabase (DB)
curl https://clinicajoseingenieros.ar/.netlify/functions/hdd-auth

# Verificar MercadoPago
curl https://clinicajoseingenieros.ar/.netlify/functions/mercadopago
# → {"configured": true} o {"configured": false}
```

---

## Convenciones de código

### TypeScript en funciones (.mts)

- Las funciones exportan `default async (req: Request) => Response`
- Siempre manejar `OPTIONS` para CORS preflight
- Usar los helpers de `lib/auth.mts` para respuestas (`jsonResponse`, `errorResponse`)
- No usar `prepare: true` en queries SQL (incompatible con Supabase Transaction Pooler)
- Usar template literals de `postgresjs`: `` sql`SELECT * FROM tabla WHERE id = ${id}` ``

### SQL

- Queries via `postgresjs` template literals (auto-escapado, previene SQL injection)
- Índices en todas las columnas usadas en WHERE frecuentes
- Usar `CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS` en migrations
- Timestamps siempre con `WITH TIME ZONE`
- Soft deletes: columna `is_active` o `status`, nunca `DELETE` hard en producción

### Frontend JS

- Sin frameworks — JS vanilla puro
- Funciones globales accesibles desde el HTML (onclick inline)
- `patient_id` / `patient_dni` **siempre** incluido en requests de juegos
- `localStorage` para persistir sesión entre páginas
- Fetch API para llamadas al backend (sin axios ni libs)

### HTML/CSS

- Sin preprocesadores (CSS puro)
- Imágenes de pacientes/staff en el root del repo (PNG/JPG)
- Variables CSS para colores y tipografía definidos en `css/main.css`

---

## Sistema de Biometría Longitudinal (Lifetime)

### Principio central

Las biometrías se capturan **desde el primer login** y se guardan **para siempre**, ancladas al `patient_dni`. El alta hospitalaria NO interrumpe el registro. Permite ver la evolución psicomotora a lo largo de toda la historia clínica, incluyendo tratamientos posteriores al alta.

### Tabla `hdd_biometric_timeline`

Tabla permanente, anclada por `patient_dni` (no por `patient_id`, que puede cambiar entre internaciones):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `patient_dni` | VARCHAR(20) NOT NULL | Identificador permanente (DNI) |
| `patient_id` | INTEGER | FK a internación actual (nullable) |
| `capture_context` | VARCHAR(64) | `'login'` \| `'game'` \| `'navigation'` |
| `source_activity` | VARCHAR(64) | Slug del juego o `'login_form'` |
| `biomet_data` | JSONB | Payload biométrico completo |
| `captured_at` | TIMESTAMP WITH TIME ZONE | Momento de captura |

### Puntos de captura

| Contexto | Qué se captura | Flujo |
|----------|---------------|-------|
| `login` | Intervalos inter-tecla (`ik_mean_ms`, `ik_sd_ms`, `ik_cv`), tiempo total, nº teclas | `hdd/portal/index.html` (inline script) → `js/hdd-portal.js:login()` → `hdd-auth.mts` |
| `game` | Tremor, RT, praxis, funciones ejecutivas (todos los campos de `biomet.js`) | `games/shared/biomet.js` → `hdd-games.mts:save_game_metrics` → mirror a timeline |

### Login biométrico (keyboard dynamics)

El script inline en `hdd/portal/index.html` registra keydown timestamps en los campos DNI y contraseña. Al submit computa:
- `ik_mean_ms` — promedio inter-tecla (velocidad de escritura)
- `ik_sd_ms` — desvío estándar inter-tecla
- `ik_cv` — coeficiente de variación (variabilidad motora fina, proxy de temblor/rigidez)

Esto se envía como `login_biomet` en el POST a `/api/hdd/auth` y se guarda con `capture_context: 'login'`.

### Mirror de juegos

`hdd-games.mts → save_game_metrics`: además de guardar en `hdd_game_metrics`, inserta en `hdd_biometric_timeline`. Todos los juegos que usan `biomet.js` alimentan automáticamente la timeline lifetime.

### Tabla `hdd_clinical_annotations`

Los profesionales asocian estado clínico + síntomas a fechas. Estos se superponen sobre los gráficos biométricos:

```sql
clinical_state: 'estable' | 'mejoria' | 'deterioro' | 'crisis'
symptoms: TEXT[]    -- ej. ['ansiedad', 'insomnio', 'alucinaciones']
```

### Dashboard clínico — secciones nuevas

En `hdd/admin/clinical-dashboard.html`:

1. **Panel de anotaciones clínicas** — el profesional registra estado + síntomas, se reflejan en gráficos en tiempo real
2. **Radar "Perfil Psicomotor"** — 6 dimensiones normalizadas a 0-100 (RT, tremor, omisiones, comisiones, eficiencia, impulsividad) calculadas sobre toda la historia lifetime
3. **"Dinámica de Teclado en Login"** — línea temporal del `ik_cv` desde el primer login; los puntos se colorean por estado clínico anotado en esa fecha

### API endpoints

```typescript
// Obtener perfil lifetime completo
POST /api/hdd/admin { action: 'get_biometric_profile', patient_dni: '12345678' }
// → { timeline: [...captures...], annotations: [...clinical_states...] }

// Agregar anotación clínica
POST /api/hdd/admin { action: 'add_clinical_annotation',
  patient_dni, annotation_date, clinical_state, symptoms, notes }
```

### Vista SQL `v_patient_biomet_profile`

Agrega el perfil por `(patient_dni, capture_context, source_activity)` calculando promedios de cada dimensión biométrica sobre toda la historia.

---

## Seguridad — consideraciones importantes

- **NO exponer** credenciales en frontend (todo via funciones serverless)
- Las funciones validan `session_token` antes de cualquier operación de paciente
- Datos de pacientes: nunca retornar `password_hash` al cliente
- MercadoPago: verificar IPN signatures en el webhook
- CORS: actualmente abierto (`*`) — apropiado para API pública del sitio
- Rate limiting: no implementado actualmente — agregar si se detecta abuso

---

## Archivos de documentación existentes

| Archivo | Contenido |
|---------|-----------|
| `AUDITORIA_COMPLETA.md` | Auditoría del estado del sistema (Feb 2026) |
| `PATIENT_TRACKING_SYSTEM.md` | Sistema de tracking individual de pacientes |
| `DEPLOYMENT_INSTRUCTIONS.md` | Instrucciones de deploy paso a paso |
| `VARIABLES_ENTORNO_NECESARIAS.md` | Variables de entorno requeridas |
| `CONFIGURAR_EMAIL_AHORA.md` | Setup de SMTP Zoho |
| `SMTP_FIX_INSTRUCTIONS.md` | Fix de configuración SMTP |
| `TESTING_CHROME.md` | Instrucciones de testing en Chrome |
| `README_MEGA_FIX.md` | Descripción del sistema de modales 3 fases |
| `MEGA_FIX_V3_PLAN.md` | Plan de implementación v3 |
| `ESTADO_REAL.md` | Estado real del sistema |
| `SECURITY.md` | Política de seguridad |
| `docs/framework-biomet.md` | Marco semiológico de métricas biométricas |

---

## Preguntas frecuentes para IA

**¿Cómo agrego una nueva acción a una función existente?**
Agregar un `case` en el switch de `action` dentro de la función `.mts` correspondiente.

**¿Cómo verifico el paciente en una función?**
```typescript
const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '')
  || body.session_token;
const patient = await sql`
  SELECT * FROM hdd_patients WHERE session_token = ${sessionToken} LIMIT 1
`;
if (!patient.length) return errorResponse("Sesión inválida", 401);
```

**¿Por qué no usar prepared statements?**
Supabase Transaction Pooler (puerto 6543) no los soporta. El cliente `postgresjs` se configura con `prepare: false`.

**¿Cómo funciona el routing?**
Todo pasa por Netlify Redirects. Las APIs van a `/.netlify/functions/<nombre>`. No hay servidor Node — todo son funciones serverless stateless.

**¿Dónde están los precios de telemedicina?**
En `scripts/setup-db.mjs` (tabla `telemedicine_plans`) y reflejados en `js/telemedicine.js` para el frontend. Actualizar ambos si cambian precios.

**¿Cómo se identifican los pacientes en los juegos?**
Via `patient_dni` (DNI numérico como string) o `patient_id` (INTEGER FK a `hdd_patients`). Los juegos del portal externo usan `access_session_id` en vez de `patient_id`.
