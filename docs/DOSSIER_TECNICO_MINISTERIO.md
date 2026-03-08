# DOSSIER TECNICO - PLATAFORMA DIGITAL DE SALUD MENTAL

## Presentacion ante el Ministerio de Salud de la Nacion Argentina

**Fecha de emision:** Marzo 2026
**Autor y titular de propiedad intelectual:** Dr. Gonzalo J. Perez Cortizo
**Matricula Provincial:** MP 94955
**Matricula Nacional:** MN 129615
**Plataforma:** Portal Digital de Salud Mental - Hospital de Dia
**Estado:** En produccion - Operativo
**Dominio:** clinicajoseingenieros.ar

---

## 1. RESUMEN EJECUTIVO

La presente plataforma constituye un ecosistema digital terapeutico integral para la gestion de programas de Hospital de Dia (HDD) en salud mental. Combina gestion de pacientes, juegos terapeuticos con seguimiento cognitivo, telemedicina con video en tiempo real, monitoreo de estado animico, deteccion de crisis, comunidad terapeutica digital y herramientas de administracion profesional.

El sistema fue disenado, desarrollado y es propiedad exclusiva del **Dr. Gonzalo J. Perez Cortizo** (MP 94955 / MN 129615), operando de forma autonoma legal y financieramente. La arquitectura esta preparada para escalar como plataforma SaaS de salud digital (finhealthtech).

### Objetivos terapeuticos de la plataforma:
- Rehabilitacion cognitiva mediante juegos terapeuticos validados
- Monitoreo longitudinal del estado animico y alertas tempranas de crisis
- Continuidad terapeutica entre sesiones presenciales via comunidad digital
- Telemedicina integrada con pasarela de pagos
- Trazabilidad completa de la intervencion profesional

---

## 2. STACK TECNOLOGICO

### 2.1 Frontend
| Componente | Tecnologia | Justificacion |
|------------|------------|---------------|
| Marcado | HTML5 semantico | Accesibilidad WCAG, SEO, compatibilidad universal |
| Estilos | CSS3 con variables custom | Tematizacion, modo claro/oscuro, responsive mobile-first |
| Logica | JavaScript ES6+ vanilla | Sin dependencias de frameworks, menor superficie de ataque |
| Internacionalizacion | Sistema i18n propio | Soporte espanol/ingles/portugues via localStorage |

**Archivos fuente:**
- `js/core.js` — Sistema i18n, modales, utilidades globales
- `js/hdd-portal.js` — Logica del portal de pacientes
- `js/hdd-admin.js` — Panel de administracion profesional
- `js/telemedicine.js` — UI de videoconsulta e integracion de pagos
- `css/main.css`, `css/hdd-portal.css`, `css/hdd-admin.css` — Estilos por modulo

### 2.2 Backend
| Componente | Tecnologia | Justificacion |
|------------|------------|---------------|
| Servidor | Netlify Functions (serverless) | Escalabilidad automatica, sin administracion de infraestructura |
| Lenguaje | TypeScript (.mts) | Tipado estatico, deteccion de errores en compilacion |
| Runtime | Node.js ES6+ | Async/await, modulos ES nativos |

**Directorio:** `netlify/functions/`
**Librerias compartidas:** `netlify/functions/lib/`
- `auth.mts` — Autenticacion, hashing, sesiones, CORS, rate limiting
- `db.mts` — Pool de conexiones PostgreSQL (singleton)
- `audit.mts` — Log de auditoria de uso profesional
- `admin-roles.mts` — Control de acceso basado en roles
- `entitlements.mts` — Sistema de planes y habilitaciones
- `notifications.mts` — Email via Zoho SMTP + WhatsApp

### 2.3 Base de datos
| Componente | Tecnologia | Justificacion |
|------------|------------|---------------|
| Motor | PostgreSQL 15+ (Supabase) | JSONB, extensiones vectoriales, RLS nativo |
| Hosting | Supabase Cloud | Backups automaticos, dashboard, tiempo real |
| Migraciones | SQL sequencial (001-018) | Idempotentes con IF NOT EXISTS |

**Directorio de migraciones:** `migrations/`

### 2.4 Integraciones externas
| Servicio | Proposito | Protocolo |
|----------|-----------|-----------|
| Daily.co | Videoconferencia HD (telemedicina) | REST API + WebRTC |
| Mercado Pago | Pasarela de pagos (Argentina) | REST API + Webhooks |
| Zoho SMTP | Notificaciones por email | SMTP/TLS puerto 465 |
| Supabase | Base de datos + almacenamiento | PostgreSQL + REST |

---

## 3. ARQUITECTURA DE SEGURIDAD

### 3.1 Autenticacion y autorizacion

**Codigo fuente:** `netlify/functions/lib/auth.mts`

| Control | Implementacion | Referencia |
|---------|----------------|------------|
| H-003 | Emails admin desde variables de entorno, nunca hardcodeados | `admin-roles.mts` |
| H-004 | Hashing PBKDF2-like: SHA-256 + salt + 10.000 iteraciones | `auth.mts:47-56` |
| H-005 | TTL de sesion granular por contexto (ver seccion 3.2) | `auth.mts:40-45` |
| H-006 | Rate limiting: 5 intentos / 15 min por identificador | `auth.mts:106-121` |
| H-008 | Mensajes de error unificados (anti-enumeracion) | `hdd-auth.mts`, `professionals.mts` |
| H-010 | CORS restrictivo con whitelist de origenes | `auth.mts:4-26` |
| H-049 | Auth obligatorio en endpoints de video | `daily-room.mts:37-46` |
| H-056 | Escape HTML en templates de email (anti-XSS) | `auth.mts:124-132` |

### 3.2 Politica de sesiones (TTL granular)

**Codigo fuente:** `netlify/functions/lib/auth.mts:40-45`

```typescript
export const SESSION_TTL = {
  PATIENT: 60 * 60 * 1000,               // 60 min - sesion terapeutica
  TELERESOURCE: 30 * 60 * 1000,          // 30 min - videoconsulta/telerecurso
  GAMING_DAILY_LIMIT_MS: 60 * 60 * 1000, // 1 hr/dia total entre todos los juegos
  PROFESSIONAL_IDLE: 2 * 60 * 60 * 1000, // 2 hrs de inactividad
};
```

| Contexto | TTL | Mecanismo |
|----------|-----|-----------|
| Sesion de paciente (terapia) | 60 minutos desde login | `isSessionExpired(lastLogin, SESSION_TTL.PATIENT)` |
| Sesion de profesional | 2 horas de inactividad | `isProfessionalSessionExpired(lastActivity)` |
| Gaming diario | 1 hora/dia acumulada | `checkDailyGamingLimit(sql, patientId)` |
| Videoconsulta | 30 minutos + 15 min gracia | Expiracion de sala Daily.co |

### 3.3 Headers de seguridad

**Configuracion:** `netlify.toml`

```
Strict-Transport-Security: max-age=31536000
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(self)
```

### 3.4 Proteccion de datos
- Consultas parametrizadas (prevencion inyeccion SQL)
- Tokens de sesion con UUID criptografico + timestamp
- Validacion de email con regex + verificacion de dominio
- Sanitizacion de entrada con `escapeHtml()`
- Sin almacenamiento local de datos de pago (PCI compliance)
- CORS restrictivo por endpoint

---

## 4. ENDPOINTS API

### 4.1 Autenticacion

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/hdd/auth` | POST | Login paciente (DNI + password), registro, cambio de password | `hdd-auth.mts` |
| `/api/hdd/auth` | GET | Verificacion de sesion, perfil | `hdd-auth.mts` |
| `/api/professionals` | POST | Login profesional, registro, verificacion email | `professionals.mts` |
| `/api/professionals` | GET | Verificacion sesion, listado disponibilidad | `professionals.mts` |
| `/api/games/auth` | POST/GET | Autenticacion por codigo de acceso (externos) | `games-auth.mts` |

### 4.2 Gestion de pacientes y administracion

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/hdd/admin` | POST | Alta, modificacion, egreso, reingreso de pacientes | `hdd-admin.mts` |
| `/api/hdd/admin` | POST | Gestion de actividades y recursos | `hdd-admin.mts` |
| `/api/hdd/admin` | POST | Importacion masiva (CSV), reset de passwords | `hdd-admin.mts` |
| `/api/hdd/admin` | GET | Listado pacientes, metricas, estadisticas, audit log | `hdd-admin.mts` |

### 4.3 Juegos terapeuticos

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/hdd/games` | GET | Listado de juegos, progreso, disponibilidad horaria | `hdd-games.mts` |
| `/api/hdd/games` | POST | Inicio sesion de juego, guardado de resultado | `hdd-games.mts` |
| `/api/hdd/games` | POST | Check-in animico, registro de interaccion | `hdd-games.mts` |

### 4.4 Telemedicina

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/daily-room` | POST | Creacion de sala de video (Daily.co) | `daily-room.mts` |
| `/api/telemedicine/session` | POST/GET | Gestion de sesion de telemedicina | `telemedicine-session.mts` |
| `/api/mercadopago` | POST | Procesamiento de pagos + webhooks | `mercadopago.mts` |
| `/api/call-queue` | GET/POST | Cola de llamadas profesionales | `call-queue.mts` |

### 4.5 Comunidad y contenido

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/hdd/community` | GET/POST | Posts, comentarios, likes, feed | `hdd-community.mts` |
| `/api/announcements` | GET/POST | Anuncios del tablero | `announcements.mts` |
| `/api/consultations` | POST/GET | Consultas y formulario de contacto | `consultations.mts` |

### 4.6 Analitica

| Endpoint | Metodo | Funcion | Archivo |
|----------|--------|---------|---------|
| `/api/analytics` | POST | Tracking de sesiones y paginas | `analytics.mts` |
| `/api/track-session` | POST | Metricas de sesion de usuario | `track-session.mts` |
| `/api/biometricas` | POST | Datos biometricos de juegos | `biometricas.mts` |

---

## 5. MODELO DE DATOS

### 5.1 Tablas principales

#### Pacientes (`hdd_patients`)
```sql
id SERIAL PRIMARY KEY,
dni VARCHAR(20) UNIQUE NOT NULL,
full_name VARCHAR(255) NOT NULL,
email VARCHAR(255),
phone VARCHAR(50),
password_hash VARCHAR(255),
status VARCHAR(20) DEFAULT 'active',  -- active | discharged
session_token VARCHAR(255),
last_login TIMESTAMPTZ,
admission_date DATE,
discharge_date DATE,
photo_url TEXT,
email_verified BOOLEAN DEFAULT FALSE,
patient_type VARCHAR(20) DEFAULT 'obra_social'
```

#### Profesionales (`healthcare_professionals`)
```sql
id SERIAL PRIMARY KEY,
email VARCHAR(255) UNIQUE NOT NULL,
password_hash VARCHAR(255),
full_name VARCHAR(255),
specialty VARCHAR(100),
license_number VARCHAR(50),
dni VARCHAR(20),
phone VARCHAR(50),
whatsapp VARCHAR(50),
is_active BOOLEAN DEFAULT TRUE,
is_available BOOLEAN DEFAULT FALSE,
session_token VARCHAR(255),
last_login TIMESTAMPTZ,
last_activity TIMESTAMPTZ,  -- para timeout por inactividad
current_calls INTEGER DEFAULT 0,
max_concurrent_calls INTEGER DEFAULT 2
```

#### Sesiones de juego (`hdd_game_sessions`)
```sql
id SERIAL PRIMARY KEY,
patient_id INTEGER REFERENCES hdd_patients(id),
game_id INTEGER REFERENCES hdd_games(id),
level INTEGER DEFAULT 1,
score INTEGER,
max_score INTEGER,
duration_seconds INTEGER,
completed BOOLEAN DEFAULT FALSE,
metrics JSONB DEFAULT '{}',
started_at TIMESTAMPTZ DEFAULT NOW(),
completed_at TIMESTAMPTZ
```

#### Registro animico (`hdd_mood_entries`)
```sql
id SERIAL PRIMARY KEY,
patient_id INTEGER REFERENCES hdd_patients(id),
color_hex VARCHAR(7),
color_id VARCHAR(50),
context_type VARCHAR(50),   -- pre_game | post_game | checkin
source_activity VARCHAR(50),
session_ordinal INTEGER,
recorded_at TIMESTAMPTZ DEFAULT NOW()
```

#### Alertas de crisis (`hdd_crisis_alerts`)
```sql
id SERIAL PRIMARY KEY,
patient_id INTEGER REFERENCES hdd_patients(id),
alert_type VARCHAR(50),     -- mood_checkin | keyword | pattern
reason TEXT,
mood_value INTEGER,
note TEXT,
status VARCHAR(20) DEFAULT 'pending' -- pending | acknowledged | resolved
```

#### Auditoria profesional (`professional_audit_log`)
```sql
id SERIAL PRIMARY KEY,
professional_id INTEGER REFERENCES healthcare_professionals(id),
professional_email VARCHAR(255),
action_type VARCHAR(50),    -- view_patient, video_session, update_patient, etc.
resource_type VARCHAR(50),  -- patient, video, resource, activity, game_stats
patient_id INTEGER REFERENCES hdd_patients(id),
patient_name VARCHAR(255),
details JSONB DEFAULT '{}',
duration_seconds INTEGER,
ip_address VARCHAR(45),
user_agent TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### 5.2 Vistas analiticas

| Vista | Proposito | Archivo |
|-------|-----------|---------|
| `v_patient_game_summary` | Resumen de rendimiento por juego/paciente | `04_unified_metrics.sql` |
| `v_patient_color_timeline` | Linea temporal de elecciones de color | `011_color_mood.sql` |
| `v_professional_usage_summary` | Uso de recursos por profesional | `018_professional_audit_log.sql` |
| `v_professional_patient_interactions` | Interacciones profesional-paciente | `018_professional_audit_log.sql` |

### 5.3 Indices de rendimiento
```sql
idx_hdd_patients_session          ON hdd_patients (session_token)
idx_hdd_patients_dni              ON hdd_patients (dni)
idx_game_sessions_patient_daily   ON hdd_game_sessions (patient_id, started_at)
idx_professionals_last_activity   ON healthcare_professionals (last_activity)
idx_audit_professional            ON professional_audit_log (professional_id, created_at)
idx_audit_patient                 ON professional_audit_log (patient_id, created_at)
```

---

## 6. JUEGOS TERAPEUTICOS

### 6.1 Catalogo de juegos

| Juego | Slug | Areas terapeuticas | Metricas recolectadas |
|-------|------|--------------------|-----------------------|
| Cortadora de Cesped | `lawn-mower` | Motricidad, planificacion, control de impulsos | Precision, tiempo reaccion, errores |
| Memoria de Medicacion | `medication-memory` | Memoria de trabajo, atencion, adherencia | Aciertos, errores, secuencia |
| Rutina Diaria | `daily-routine` | Gestion del tiempo, AVD, secuenciacion | Orden correcto, tiempo, intentos |
| Logica del Frigorifico | `fridge-logic` | Resolucion de problemas, categorizacion | Clasificaciones, eficiencia |
| Supermercado | `super-market` | Toma de decisiones, presupuesto | Gastos, errores, planificacion |
| Organizador de Pastillas | `pill-organizer` | Adherencia, organizacion, atencion | Precision, tiempo, omisiones |
| Neuro Chef | `neuro-chef` | Funcion ejecutiva, multitarea | Pasos correctos, tiempos, errores |

**Archivos fuente:** `games/play/*.html`, `games/play/neuro-chef/`

### 6.2 Flujo de sesion de juego

```
1. Paciente selecciona juego
2. Sistema verifica limite diario (1hr/dia) → checkDailyGamingLimit()
3. Si excede: respuesta 429 "Limite diario alcanzado"
4. Si permitido: INSERT hdd_game_sessions → retorna sessionId + remainingMinutes
5. Paciente juega con tracking en tiempo real
6. Al finalizar: save_result → UPDATE hdd_game_sessions + UPSERT hdd_game_progress
7. Check-in animico post-juego (color + intensidad)
8. Deteccion de crisis si mood <= 1 o keywords de riesgo
```

### 6.3 Recoleccion de datos por sesion (JSONB metrics)
```json
{
  "accuracy": 0.85,
  "reactionTimeMs": 450,
  "commissionErrors": 2,
  "omissionErrors": 1,
  "hesitations": 3,
  "movementEfficiency": 0.92,
  "dPrime": 2.1,
  "tremor": 0.15
}
```

---

## 7. SISTEMA DE TELEMEDICINA

### 7.1 Arquitectura de videoconsulta

```
Paciente                 Servidor                  Daily.co
   |                        |                        |
   |-- Solicita consulta -->|                        |
   |                        |-- Verifica pago ------>|
   |                        |-- Crea sala (POST) --->|
   |                        |<-- room_url + tokens --|
   |<-- URLs con tokens ----|                        |
   |                        |                        |
   |====== WebRTC P2P ==============================|
   |                        |                        |
   |-- Fin consulta ------->|                        |
   |                        |-- Destruye sala ------>|
```

### 7.2 Parametros de sala
- **Privacidad:** Private (requiere token)
- **Duracion:** 30 minutos + 15 min gracia
- **Participantes:** Maximo 4 (profesional + paciente + observadores)
- **Grabacion:** Local solamente (privacidad del paciente)
- **Auto-expulsion:** Activada al vencer la sala
- **Idioma:** Espanol

**Codigo fuente:** `netlify/functions/daily-room.mts:66-83`

### 7.3 Modalidades de consulta

| Modalidad | Precio ARS | Duracion |
|-----------|------------|----------|
| Con cola (espera) | $50.000 | 15 min |
| Sin cola (prioritaria) | $70.000 | 15 min |
| Premium | $120.000 | 15 min |

**Procesamiento:** Mercado Pago → Webhook → Creacion de sala → Notificacion al profesional

---

## 8. DETECCION DE CRISIS Y ALERTAS

### 8.1 Triggers de alerta

| Trigger | Condicion | Accion |
|---------|-----------|--------|
| Mood bajo | `mood_value <= 1` | Alerta inmediata |
| Keywords | Coincidencia con lista de riesgo | Alerta inmediata |
| Patron | 3+ dias consecutivos con mood <= 2 | Alerta por patron |

### 8.2 Cadena de notificacion
```
1. INSERT INTO hdd_crisis_alerts (status = 'pending')
2. Email a ADMIN_EMAIL (con datos del paciente + contexto)
3. WhatsApp a ADMIN_PHONE
4. Profesional reconoce → status = 'acknowledged'
5. Intervencion completada → status = 'resolved'
```

**Codigo fuente:** `netlify/functions/hdd-games.mts` (mood_checkin action)

---

## 9. AUDITORIA DE USO PROFESIONAL

### 9.1 Que se registra

Cada accion de un profesional en el portal genera un registro en `professional_audit_log`:

| Accion | resource_type | Detalle |
|--------|---------------|---------|
| `view_patient` | patient | Consulta de ficha del paciente |
| `view_patient_metrics` | patient | Consulta de metricas/graficos |
| `update_patient` | patient | Modificacion de datos |
| `add_patient` | patient | Alta de nuevo paciente |
| `discharge_patient` | patient | Egreso |
| `video_session` | video | Inicio de videoconsulta |
| `view_resources` | resource | Consulta de recursos |
| `add_activity` | activity | Creacion de actividad |

### 9.2 Consulta del audit log

**Endpoint:** `GET /api/hdd/admin?action=professional_usage`
**Acceso:** Solo SUPER_ADMIN (Direccion Medica)
**Parametros:** `professionalId` (opcional), `days` (default 30)

**Respuesta:**
```json
{
  "summary": [/* resumen por profesional */],
  "logs": [/* detalle de acciones */],
  "interactions": [/* cruce profesional-paciente */]
}
```

**Codigo fuente:** `netlify/functions/hdd-admin.mts`, `netlify/functions/lib/audit.mts`

---

## 10. MIGRACIONES DE BASE DE DATOS

| # | Archivo | Descripcion |
|---|---------|-------------|
| 001 | `001_initial.sql` | Tablas base (sesiones, telemedicina, profesionales) |
| 002 | `002_hdd_verification.sql` | Columnas de verificacion HDD |
| 003 | `003_healthcare_professionals_verification.sql` | Schema de verificacion profesional |
| 006 | `006_hdd_games.sql` | Tablas de juegos terapeuticos + seed |
| 009 | `009_game_access_codes.sql` | Control de acceso externo a juegos |
| 010 | `010_mood_checkins_and_alerts.sql` | Tracking de salud mental |
| 011 | `011_color_mood_and_extended_metrics.sql` | Metricas ampliadas de color/animo |
| 012 | `012_resources_and_activity_management.sql` | Actividades y recursos |
| 013 | `013_unified_patient_profile.sql` | Consolidacion del perfil de paciente |
| 014 | `014_two_tier_patient_model.sql` | Modelo de paciente de dos niveles |
| 015 | `015_fix_rls_and_security.sql` | Politicas de seguridad a nivel de fila |
| 016 | `016_hce_historia_clinica.sql` | Historia Clinica Electronica |
| 017 | `017_session_expiry_granular.sql` | TTLs granulares de sesion |
| 018 | `018_professional_audit_log.sql` | Auditoria de uso profesional |

---

## 11. DESPLIEGUE Y CONFIGURACION

### 11.1 Variables de entorno requeridas

| Variable | Proposito | Critica |
|----------|-----------|---------|
| `SUPABASE_DATABASE_URL` | Conexion PostgreSQL | Si |
| `PASSWORD_SALT` | Salt para hashing de passwords | Si |
| `ADMIN_EMAIL` | Email para alertas de crisis | Si |
| `ADMIN_PHONE` | WhatsApp para alertas de crisis | Si |
| `DAILY_API_KEY` | API de videoconferencia | Si |
| `MP_ACCESS_TOKEN` | Mercado Pago token | Si |
| `ZOHO_SMTP_USER` | Email SMTP usuario | Si |
| `ZOHO_SMTP_PASS` | Email SMTP password | Si |
| `ADMIN_EMAILS` | Lista de super admins | No |
| `URL` | URL base del portal | No |

### 11.2 Pipeline de build
```bash
npm install && npm run setup-db
```
1. Instala dependencias (@netlify/functions, postgres, nodemailer)
2. Ejecuta script de setup-db
3. Conecta a Supabase y aplica migraciones
4. Compila funciones serverless TypeScript

### 11.3 Configuracion de Netlify (`netlify.toml`)
- Funciones: `netlify/functions/`
- Publicacion: directorio raiz
- Cache: CSS/JS 300s, imagenes 7 dias
- Headers de seguridad configurados
- Redirects: `/api/*` → funciones serverless

---

## 12. CUMPLIMIENTO NORMATIVO

### 12.1 Proteccion de datos personales sensibles
- Datos de salud mental almacenados con encriptacion en transito (TLS 1.3)
- Acceso restringido por roles (SUPER_ADMIN > LIMITED_ADMIN > PROFESSIONAL)
- Auditoria completa de accesos profesionales
- Sin almacenamiento de datos de pago en servidores propios

### 12.2 Trazabilidad
- Log de login/logout de pacientes con IP, user agent, duracion
- Log de todas las acciones profesionales con timestamp y contexto
- Historial de alertas de crisis con estados de seguimiento
- Registros de sesiones de juego con metricas detalladas

### 12.3 Consentimiento y privacidad
- Grabacion de video desactivada por defecto (solo local si el profesional la activa)
- Comunidad moderada (posts requieren aprobacion)
- Los pacientes solo pueden eliminar su propio contenido
- Sin comparticion de datos con terceros

---

## 13. CONTACTO

**Titular:** Dr. Gonzalo J. Perez Cortizo
**MP:** 94955 | **MN:** 129615
**Plataforma:** clinicajoseingenieros.ar
**Repositorio:** Privado (GitHub)

---

*Documento generado automaticamente a partir del analisis del codigo fuente del portal.*
*Todos los fragmentos de codigo referenciados son verificables en el repositorio.*
