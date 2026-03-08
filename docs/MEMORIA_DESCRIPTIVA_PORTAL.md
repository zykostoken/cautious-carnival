# MEMORIA DESCRIPTIVA DEL PORTAL

## Plataforma Digital de Salud Mental - Hospital de Dia

**Autor y propietario:** Dr. Gonzalo J. Perez Cortizo (MP 94955 / MN 129615)
**Fecha:** Marzo 2026

---

## 1. DESCRIPCION GENERAL

El portal es una plataforma web integral de salud mental que digitaliza la operacion de un programa de Hospital de Dia (HDD). Funciona como un ecosistema autonomo que conecta pacientes, profesionales de la salud y herramientas terapeuticas digitales en un entorno seguro.

### Portales del sistema:

| Portal | URL | Usuarios | Proposito |
|--------|-----|----------|-----------|
| Sitio publico | `/index.html` | Visitantes | Informacion institucional, contacto |
| Portal HDD Publico | `/hdd/index.html` | Visitantes | Info del programa, actividades, tablero comunitario |
| Portal del Paciente | `/hdd/portal/index.html` | Pacientes activos | Dashboard terapeutico, juegos, comunidad |
| Panel Profesional | `/hdd/admin/index.html` | Profesionales | Gestion de pacientes, metricas |
| Panel Videoconsulta | `/hdd/admin/panel-profesional.html` | Profesionales | Videoconsulta, graficos de rendimiento |
| Portal de Juegos | `/games/index.html` | Usuarios con codigo | Acceso externo a juegos terapeuticos |

---

## 2. FLUJO DEL PACIENTE

### 2.1 Ingreso al sistema

```
Paso 1: El equipo terapeutico carga al paciente en el sistema
        POST /api/hdd/admin → action: add_patient
        Datos: DNI, nombre completo, fecha de ingreso
        Codigo: netlify/functions/hdd-admin.mts (linea 50)

Paso 2: El paciente accede al portal /hdd/portal/
        Frontend: hdd/portal/index.html
        JS: js/hdd-portal.js

Paso 3: Primer login con DNI
        El sistema detecta que no tiene password
        Presenta formulario de creacion de password
        POST /api/hdd/auth → action: first_login
        Codigo: netlify/functions/hdd-auth.mts (linea 58-120)

Paso 4: Password hasheado y almacenado
        Funcion: hashPassword() en lib/auth.mts (linea 47)
        Algoritmo: SHA-256 + salt + 10.000 iteraciones
        Se genera session_token (UUID + timestamp)

Paso 5: Redireccion al dashboard del paciente
        El token se guarda en localStorage
        Se presenta el panel con juegos, comunidad, actividades
```

### 2.2 Sesion terapeutica digital (uso diario)

```
Paso 1: Login con DNI + password
        POST /api/hdd/auth → action: login
        Rate limiting: 5 intentos / 15 minutos
        Codigo: netlify/functions/hdd-auth.mts

Paso 2: Dashboard principal
        Secciones disponibles:
        ├─ Juegos terapeuticos (con indicador de tiempo restante)
        ├─ Comunidad (feed de posts)
        ├─ Actividades programadas
        ├─ Mi perfil y progreso
        └─ Estado animico

Paso 3: Juego terapeutico (ejemplo: Cortadora de Cesped)
        a) Clic en juego → verificacion de limite diario
           GET /api/hdd/games?action=list&sessionToken=...
           Codigo: netlify/functions/hdd-games.mts (linea 66)

        b) Inicio de sesion de juego
           POST /api/hdd/games → action: start_session
           Verifica: checkDailyGamingLimit() en lib/auth.mts (linea 100)
           Si excede 1hr/dia: respuesta 429
           Si OK: INSERT hdd_game_sessions
           Codigo: hdd-games.mts (linea 222-240)

        c) Juego en ejecucion
           Frontend: games/play/lawn-mower.html
           Tracking en tiempo real: score, errores, tiempo reaccion

        d) Fin del juego → guardado de resultado
           POST /api/hdd/games → action: save_result
           UPDATE hdd_game_sessions + UPSERT hdd_game_progress
           Codigo: hdd-games.mts (linea 243-299)

        e) Check-in animico post-juego
           POST /api/hdd/games → action: mood_checkin
           Seleccion de color + intensidad (1-5)
           INSERT hdd_mood_entries + hdd_mood_checkins
           Codigo: hdd-games.mts (linea ~360-440)

        f) Deteccion de crisis (si aplica)
           Si mood <= 1 o keywords de riesgo:
           INSERT hdd_crisis_alerts
           Email + WhatsApp al equipo de guardia
           Codigo: hdd-games.mts (linea ~430-470)

Paso 4: Comunidad terapeutica
        a) Ver feed de posts aprobados
           GET /api/hdd/community?action=feed&sessionToken=...
           Codigo: netlify/functions/hdd-community.mts

        b) Crear post (texto + imagen opcional)
           POST /api/hdd/community → action: create_post
           Estado inicial: pendiente de aprobacion

        c) Comentar en posts de companeros
           POST /api/hdd/community → action: add_comment

        d) Dar "me gusta"
           POST /api/hdd/community → action: toggle_like

Paso 5: Sesion expira a los 60 minutos
        En siguiente request: isSessionExpired(lastLogin, SESSION_TTL.PATIENT)
        session_token = NULL → redirect a login
        Codigo: lib/auth.mts (linea 86)
```

### 2.3 Egreso del paciente

```
Profesional ejecuta:
POST /api/hdd/admin → action: discharge_patient
UPDATE hdd_patients SET status = 'discharged', discharge_date = NOW()
Codigo: netlify/functions/hdd-admin.mts

El paciente ya no puede loguearse (WHERE status = 'active')
Sus datos historicos se preservan para seguimiento
```

---

## 3. FLUJO DEL PROFESIONAL

### 3.1 Autenticacion

```
Paso 1: Accede a /hdd/admin/
        Frontend: hdd/admin/index.html
        JS: js/hdd-admin.js

Paso 2: Login con email + password
        POST /api/professionals → action: login
        Dominio requerido: @clinicajoseingenieros.ar
        Rate limiting: 5 intentos / 15 min
        Codigo: netlify/functions/professionals.mts (linea 438-507)

Paso 3: Session token generado
        Se guarda en localStorage como 'hdd_admin_session'
        Se registra last_login Y last_activity
        TTL: 2 horas de inactividad

Paso 4: Dashboard administrativo
        Verificacion de rol → GET /api/hdd/admin?action=my_role
        Permisos segun rol:
        ├─ SUPER_ADMIN: todo
        ├─ LIMITED_ADMIN: gestion basica
        └─ PROFESSIONAL: consulta y videoconsulta
```

### 3.2 Gestion de pacientes

```
Listado de pacientes:
  GET /api/hdd/admin?action=list&sessionToken=...
  Retorna: id, DNI, nombre, email, estado, ultimo login
  Codigo: hdd-admin.mts (linea 597-638)
  → Se registra en professional_audit_log (action: view_list)

Detalle de paciente:
  GET /api/hdd/admin?action=detail&patientId=123
  Retorna: datos + conteo de posts + historial
  Codigo: hdd-admin.mts (linea 641-685)
  → Se registra en audit_log (action: view_detail, patient_id: 123)

Metricas del paciente:
  GET /api/hdd/admin?action=patient_metrics&patientId=123
  Retorna:
  ├─ Metricas globales (logins, sesiones, mood promedio)
  ├─ Historial de mood (temporal)
  ├─ Sesiones de juego detalladas
  ├─ Perfil clinico (biometricos promedio, tendencia)
  ├─ Progreso por juego
  ├─ Actividad reciente
  └─ Resumen mensual
  Codigo: hdd-admin.mts (linea 836-1215)
  → Se registra en audit_log (action: view_patient_metrics, patient_id: 123)
```

### 3.3 Videoconsulta

```
Paso 1: Profesional abre panel-profesional.html
        Selecciona paciente de la lista
        Frontend: hdd/admin/panel-profesional.html (linea 701)

Paso 2: Clic en "Iniciar videoconsulta"
        Lee sessionToken de localStorage('hdd_admin_session')
        POST /api/daily/room → action: create_room
        Codigo: netlify/functions/daily-room.mts (linea 49-121)

Paso 3: Servidor crea sala en Daily.co
        Nombre: cji-{token_parcial}
        Duracion: 30 minutos + 15 min gracia
        Participantes: max 4
        Privacidad: private (requiere token)
        Codigo: daily-room.mts (linea 66-83)

Paso 4: Se generan 2 tokens
        Token profesional (is_owner: true → puede silenciar/expulsar)
        Token paciente (is_owner: false → participante)
        Se retornan las URLs con tokens embebidos

Paso 5: Consulta de video via WebRTC
        El profesional y paciente se conectan al mismo room
        Comunicacion peer-to-peer (Daily.co como relay)

Paso 6: Fin de consulta
        La sala se auto-destruye al expirar
        Se registra en audit_log (action: video_session, duration)
        Codigo: daily-room.mts (linea 109-121)
```

### 3.4 Consulta del audit log (Direccion Medica)

```
Solo SUPER_ADMIN puede consultar:
GET /api/hdd/admin?action=professional_usage&days=30

Respuesta:
{
  "summary": [
    {
      "professional_name": "Dra. Martinez",
      "email": "martinez@clinicajoseingenieros.ar",
      "total_actions": 145,
      "patients_viewed": 23,
      "video_sessions": 8,
      "total_video_seconds": 14400,
      "actions_last_7d": 42
    }
  ],
  "logs": [/* detalle cronologico */],
  "interactions": [
    {
      "professional_name": "Dra. Martinez",
      "patient_name": "Juan Perez",
      "total_interactions": 15,
      "video_sessions": 3,
      "metrics_reviews": 8,
      "total_video_seconds": 5400
    }
  ]
}

Codigo: hdd-admin.mts (endpoint professional_usage)
Tabla: professional_audit_log
Vistas: v_professional_usage_summary, v_professional_patient_interactions
Migracion: migrations/018_professional_audit_log.sql
```

---

## 4. JUEGOS TERAPEUTICOS - DETALLE

### 4.1 Cortadora de Cesped (`lawn-mower`)

**Pagina:** `games/play/lawn-mower.html`
**Areas terapeuticas:** Motricidad fina, planificacion, control de impulsos, atencion
**Mecanica:** El paciente controla una cortadora evitando flores y la pileta. Requiere precision y planificacion de ruta.
**Metricas:** Precision de corte, tiempo de reaccion, errores de comision, eficiencia de movimiento

### 4.2 Memoria de Medicacion (`medication-memory`)

**Pagina:** `games/play/medication-memory.html`
**Areas terapeuticas:** Memoria de trabajo, atencion, adherencia terapeutica
**Mecanica:** Matching de tarjetas de medicacion con sus prescripciones correspondientes
**Metricas:** Aciertos, errores, secuencia completada, tiempo por par

### 4.3 Rutina Diaria (`daily-routine`)

**Pagina:** `games/play/daily-routine.html`
**Areas terapeuticas:** Gestion del tiempo, actividades de vida diaria, secuenciacion
**Mecanica:** Ordenar actividades cotidianas en la secuencia temporal correcta
**Metricas:** Orden correcto, tiempo total, intentos necesarios

### 4.4 Logica del Frigorifico (`fridge-logic`)

**Pagina:** `games/play/fridge-logic.html`
**Areas terapeuticas:** Resolucion de problemas, categorizacion, planificacion
**Mecanica:** Organizar alimentos en categorias logicas dentro del refrigerador
**Metricas:** Clasificaciones correctas, eficiencia, tiempo

### 4.5 Supermercado (`super-market`)

**Pagina:** `games/play/super-market.html`
**Areas terapeuticas:** Toma de decisiones, presupuesto, control de impulsos
**Mecanica:** Comprar dentro de un presupuesto limitado, eligiendo productos necesarios
**Metricas:** Gasto total vs presupuesto, errores, planificacion

### 4.6 Organizador de Pastillas (`pill-organizer`)

**Pagina:** `games/play/pill-organizer.html`
**Areas terapeuticas:** Adherencia medicamentosa, organizacion, atencion
**Mecanica:** Distribuir pastillas correctamente en un pastillero semanal
**Metricas:** Precision, tiempo, omisiones, errores

### 4.7 Neuro Chef (`neuro-chef`)

**Pagina:** `games/play/neuro-chef/index.html`
**Estilos:** `games/play/neuro-chef/css/styles.css`
**Areas terapeuticas:** Funcion ejecutiva, seguimiento de instrucciones, multitarea
**Mecanica:** Seguir recetas de cocina con multiples pasos y temporizadores
**Metricas:** Pasos correctos, tiempos de respuesta, errores, gestion simultanea

---

## 5. SISTEMA DE MONITOREO ANIMICO

### 5.1 Modelo de 3 fases

```
FASE 1 - Pre-juego (baseline):
  Preguntas sobre estado actual del animo
  Se registra como context_type = 'pre_game'
  Tabla: hdd_mood_entries

FASE 2 - Durante el juego:
  Selecciones de color inline durante la actividad
  Se registra con source_activity = slug del juego
  Tabla: hdd_mood_entries

FASE 3 - Post-juego:
  Intensidad (1-5) + color elegido + nota libre
  Se registra como context_type = 'post_game'
  Tablas: hdd_mood_entries + hdd_mood_checkins
```

### 5.2 Psicologia del color

**Migracion:** `sql/01_color_psychology.sql`

| Color | Significado terapeutico | hex |
|-------|-------------------------|-----|
| Rojo | Energia, enojo, intensidad | #FF0000 |
| Azul | Calma, tristeza, tranquilidad | #0000FF |
| Amarillo | Alegria, ansiedad, optimismo | #FFFF00 |
| Verde | Equilibrio, esperanza, crecimiento | #00FF00 |
| Negro | Depresion, vacio, aislamiento | #000000 |
| Blanco | Paz, confusion, neutralidad | #FFFFFF |

### 5.3 Deteccion automatica de crisis

**Codigo:** `netlify/functions/hdd-games.mts`

```
Triggers:
1. mood_value = 1 (muy bajo) → alerta inmediata
2. Keywords: ["suicid", "morir", "no puedo mas", ...] → alerta inmediata
3. Patron: 3+ dias consecutivos con mood <= 2 → alerta por patron

Accion:
INSERT hdd_crisis_alerts (patient_id, alert_type, reason, mood_value, note)
Email: sendEmailNotification() a ADMIN_EMAIL
WhatsApp: Notificacion a ADMIN_PHONE
```

---

## 6. COMUNIDAD TERAPEUTICA DIGITAL

### 6.1 Funcionalidades

| Feature | Endpoint | Codigo |
|---------|----------|--------|
| Feed de posts | `GET /api/hdd/community?action=feed` | `hdd-community.mts` |
| Crear post | `POST action=create_post` | `hdd-community.mts` |
| Comentar | `POST action=add_comment` | `hdd-community.mts` |
| Me gusta | `POST action=toggle_like` | `hdd-community.mts` |
| Eliminar propio | `POST action=delete_post` | `hdd-community.mts` |
| Mis posts | `GET action=my_posts` | `hdd-community.mts` |

### 6.2 Moderacion
- Los posts nuevos tienen `is_approved` = pendiente por defecto
- Solo el equipo profesional puede aprobar contenido
- Los pacientes solo eliminan contenido propio
- Posts fijados (`is_pinned`) aparecen primero

---

## 7. ROLES Y PERMISOS

### 7.1 Matriz de permisos

| Accion | SUPER_ADMIN | LIMITED_ADMIN | PROFESSIONAL | PACIENTE |
|--------|:-----------:|:-------------:|:------------:|:--------:|
| Ver pacientes | Si | Si | Asignados | N/A |
| Alta paciente | Si | Si | No | N/A |
| Egreso paciente | Si | Si | No | N/A |
| Reset password | Si | No | No | N/A |
| Import masivo | Si | No | No | N/A |
| Videoconsulta | Si | Si | Si | Si (receptor) |
| Ver metricas | Si | Si | Asignados | Propias |
| Audit log | Si | No | No | N/A |
| Juegos | N/A | N/A | N/A | Si (1hr/dia) |
| Comunidad | N/A | N/A | Moderar | Publicar |

### 7.2 Configuracion de roles

```
SUPER_ADMIN: Variable de entorno ADMIN_EMAILS
LIMITED_ADMIN: Variable de entorno LIMITED_ADMIN_EMAILS
PROFESSIONAL: Cualquier @clinicajoseingenieros.ar registrado
PACIENTE: DNI cargado en hdd_patients con status = 'active'
```

**Codigo:** `netlify/functions/lib/admin-roles.mts`

---

## 8. USABILIDAD

### 8.1 Diseno responsive
- **Mobile-first:** Breakpoints a 768px y 1024px
- **Touch-friendly:** Botones minimo 48px
- **Fuentes:** Playfair Display (titulos) + Inter (cuerpo)
- **Paleta:** Azules clinicos, verdes calmos, grises neutros
- **Modo oscuro:** Soporte via CSS variables

### 8.2 Accesibilidad
- HTML5 semantico (`<nav>`, `<main>`, `<article>`, `<section>`)
- Atributo `lang="es"` en todas las paginas
- Labels en formularios asociados a inputs
- Contraste WCAG AA
- Navegacion por teclado

### 8.3 Internacionalizacion
- 3 idiomas: Espanol (default), Ingles, Portugues
- Sistema propio en `js/core.js`
- Persistencia en localStorage key 'lang'
- Atributos `data-i18n` en elementos de UI

### 8.4 Feedback al usuario
- Indicadores de carga en operaciones asincronas
- Mensajes de error claros en espanol
- Confirmaciones visuales de acciones completadas
- Tiempo restante de juego visible antes de iniciar sesion
- Indicador de estado de conexion de video

---

## 9. ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
cautious-carnival/
├── index.html                          # Sitio publico principal
├── netlify.toml                        # Configuracion Netlify + headers seguridad
├── package.json                        # Dependencias Node.js
│
├── hdd/                                # Hospital de Dia
│   ├── index.html                      # Pagina publica HDD
│   ├── portal/
│   │   └── index.html                  # Portal del paciente
│   └── admin/
│       ├── index.html                  # Login profesional
│       ├── clinical-dashboard.html     # Dashboard clinico
│       └── panel-profesional.html      # Panel de videoconsulta + metricas
│
├── games/                              # Juegos terapeuticos
│   ├── index.html                      # Login con codigo de acceso
│   ├── portal/
│   │   ├── index.html                  # Dashboard de juegos
│   │   └── dashboard.html              # Dashboard detallado
│   ├── shared/
│   │   └── mood-modals.html            # Modales de check-in animico
│   └── play/
│       ├── lawn-mower.html             # Cortadora de Cesped
│       ├── medication-memory.html      # Memoria de Medicacion
│       ├── daily-routine.html          # Rutina Diaria
│       ├── fridge-logic.html           # Logica del Frigorifico
│       ├── super-market.html           # Supermercado
│       ├── pill-organizer.html         # Organizador de Pastillas
│       └── neuro-chef/                 # Neuro Chef (multi-archivo)
│           ├── index.html
│           └── css/styles.css
│
├── js/                                 # Modulos JavaScript
│   ├── core.js                         # i18n, modales, utilidades
│   ├── effects.js                      # Efectos visuales
│   ├── modal-content.js                # Contenido de modales
│   ├── hdd-index.js                    # Interacciones pagina publica HDD
│   ├── hdd-portal.js                   # Logica portal paciente
│   ├── hdd-admin.js                    # Panel administrativo
│   └── telemedicine.js                 # UI de videoconsulta + pagos
│
├── css/                                # Hojas de estilo
│   ├── main.css                        # Sitio principal
│   ├── hdd-index.css                   # Pagina publica HDD
│   ├── hdd-portal.css                  # Portal paciente
│   └── hdd-admin.css                   # Panel admin
│
├── netlify/functions/                  # Backend serverless
│   ├── hdd-auth.mts                    # Autenticacion pacientes
│   ├── hdd-admin.mts                   # Administracion + audit log
│   ├── hdd-games.mts                   # Juegos + mood + crisis
│   ├── hdd-community.mts              # Comunidad
│   ├── professionals.mts              # Autenticacion profesionales
│   ├── daily-room.mts                 # Creacion salas video
│   ├── telemedicine-session.mts       # Sesiones telemedicina
│   ├── mercadopago.mts                # Pagos Mercado Pago
│   ├── call-queue.mts                 # Cola de llamadas
│   ├── consultations.mts             # Consultas/contacto
│   ├── announcements.mts             # Anuncios
│   ├── analytics.mts                  # Tracking
│   ├── board-images.mts               # Imagenes tablero
│   └── lib/                            # Librerias compartidas
│       ├── auth.mts                    # Auth + sesiones + CORS + rate limit
│       ├── db.mts                      # Conexion PostgreSQL
│       ├── audit.mts                   # Auditoria profesional
│       ├── admin-roles.mts            # Roles y permisos
│       ├── entitlements.mts           # Planes y habilitaciones
│       └── notifications.mts         # Email + WhatsApp
│
├── migrations/                         # Migraciones SQL
│   ├── 001_initial.sql                # → 018_professional_audit_log.sql
│   └── ...
│
├── sql/                                # Scripts SQL adicionales
│   ├── 01_color_psychology.sql
│   ├── 02_game_sessions.sql
│   ├── 03_neurochef_telemetry.sql
│   └── 04_unified_metrics.sql
│
├── scripts/
│   └── setup-db.mjs                   # Script de inicializacion de BD
│
└── docs/                               # Documentacion
    ├── DOSSIER_TECNICO_MINISTERIO.md
    └── MEMORIA_DESCRIPTIVA_PORTAL.md
```

---

## 10. PROPIEDAD INTELECTUAL

La totalidad del codigo fuente, diseno, arquitectura, logica de negocio, algoritmos terapeuticos y documentacion de esta plataforma son **propiedad intelectual exclusiva del Dr. Gonzalo J. Perez Cortizo** (MP 94955 / MN 129615).

La plataforma opera de forma **autonoma legal y financieramente**, independiente de cualquier institucion clinica. Su arquitectura esta disenada para escalar como producto SaaS de salud digital, con potencial de evolucion hacia un modelo de **finhealthtech**.

---

*Documento generado a partir del analisis exhaustivo del codigo fuente del portal.*
*Cada referencia a archivo, linea y endpoint es verificable en el repositorio.*
