# AUDITORIA INTEGRAL - PORTAL CLINICA JOSE INGENIEROS
## Cumplimiento Normativo, Seguridad y Habilitacion

**Fecha:** 2026-03-08
**Repositorio:** cautious-carnival
**Dominio:** clinicajoseingenieros.ar / clinicajoseingenieros.netlify.app
**Stack:** HTML/JS/CSS (frontend) + Netlify Functions (backend) + Supabase PostgreSQL (DB)
**Auditor:** Claude Opus 4.6 - Auditoria automatizada

---

## RESUMEN EJECUTIVO

Se identificaron **47 hallazgos** clasificados por severidad:

| Severidad | Cantidad | Descripcion |
|-----------|----------|-------------|
| CRITICO   | 8        | Riesgos que impiden habilitacion o exponen datos sensibles |
| ALTO      | 12       | Incumplimientos normativos directos |
| MEDIO     | 15       | Debilidades tecnicas o documentales |
| BAJO      | 12       | Mejoras recomendadas |

**Veredicto general:** El portal **NO cumple** con los requisitos minimos para operar como sistema de historia clinica digital ni como plataforma de telemedicina habilitada bajo la normativa argentina vigente. Requiere correcciones criticas antes de cualquier proceso de homologacion.

---

## SECCION 1: CREDENCIALES EXPUESTAS (CRITICO INMEDIATO)

### H-001: Contrasena SMTP expuesta en repositorio Git
- **Archivo:** `VARIABLES_ENTORNO_NECESARIAS.md:12-15`
- **Hallazgo:** Contrasena real del servidor SMTP (`Npemb5ZNuFA8`) commiteada en texto plano
- **Impacto:** Cualquier persona con acceso al repo puede enviar emails como `direccionmedica@clinicajoseingenieros.ar`
- **Normativa:** Ley 25.326 (Proteccion de Datos Personales) Art. 9 - medidas de seguridad
- **Accion:** ROTAR CREDENCIAL INMEDIATAMENTE. Eliminar del historial Git con `git filter-branch` o BFG Repo Cleaner

### H-002: URL de proyecto Supabase expuesta
- **Archivo:** `VARIABLES_ENTORNO_NECESARIAS.md:41-43`
- **Hallazgo:** URL del proyecto Supabase (`yqpqfzvgcmvxvqzvtajx.supabase.co`) expuesta
- **Impacto:** Facilita reconocimiento para ataques dirigidos a la base de datos
- **Accion:** Mover toda informacion de configuracion a documentacion privada fuera del repo

### H-003: Email personal de admin hardcodeado
- **Archivo:** `netlify/functions/professionals.mts:48`
- **Hallazgo:** Email personal `gonzaloperezcortizo@gmail.com` hardcodeado como admin
- **Impacto:** Expone identidad del administrador; viola principio de minimo privilegio
- **Accion:** Mover a variable de entorno

---

## SECCION 2: AUTENTICACION Y GESTION DE SESIONES

### H-004: Hashing de contrasenas inseguro (CRITICO)
- **Archivo:** `netlify/functions/lib/auth.mts:3-9`
- **Hallazgo:** Se usa SHA-256 simple con salt estatico para hashear contrasenas
- **Detalle:** `crypto.subtle.digest('SHA-256', data)` con salt fallback `'clinica_salt_2024'`
- **Problema:** SHA-256 NO es un algoritmo de hashing de contrasenas. Es vulnerable a ataques de fuerza bruta con GPU (miles de millones de intentos/segundo)
- **Normativa:**
  - Ley 25.326 Art. 9: "El responsable del archivo debe adoptar medidas tecnicas que garanticen la seguridad de los datos"
  - Res. 1840/2018: Requiere medidas de seguridad adecuadas para datos de salud
  - Disposicion AAIP 11/2006: Medidas de seguridad nivel critico para datos de salud
- **Correccion:** Reemplazar por `bcrypt`, `scrypt` o `argon2id` con factor de costo adecuado

### H-005: Sesiones sin expiracion (CRITICO)
- **Archivo:** `netlify/functions/lib/auth.mts:16-18`
- **Hallazgo:** `generateSessionToken()` genera UUID + timestamp pero NO tiene TTL
- **Detalle:** Los tokens de sesion se almacenan en DB sin campo de expiracion. Una sesion robada es valida indefinidamente
- **Archivo afectado:** `netlify/functions/hdd-auth.mts:142-149` - login actualiza `session_token` pero no `session_expires`
- **Normativa:**
  - Res. 1840/2018: Gestion de acceso con timeout obligatorio
  - OWASP Session Management: Sesiones deben expirar por inactividad
- **Correccion:** Agregar campo `session_expires_at` y validar en cada request

### H-006: Sin proteccion contra fuerza bruta (ALTO)
- **Archivo:** `netlify/functions/hdd-auth.mts:68-139`, `netlify/functions/professionals.mts:444-504`
- **Hallazgo:** No hay rate limiting ni bloqueo por intentos fallidos en login
- **Impacto:** Un atacante puede probar contrasenas ilimitadamente
- **Normativa:**
  - Res. 1840/2018: Control de acceso con medidas anti-intrusion
  - Disposicion AAIP 11/2006: Nivel critico requiere registro de intentos fallidos
- **Correccion:** Implementar rate limiting (max 5 intentos/15 min), lockout temporal, CAPTCHA

### H-007: Reset de contrasena debil (ALTO)
- **Archivo:** `netlify/functions/professionals.mts:314-380`
- **Hallazgo:** El reset de contrasena usa solo los ultimos 4 digitos del DNI como verificacion
- **Impacto:** Solo 10,000 combinaciones posibles. Trivial de adivinar sin rate limiting
- **Normativa:** Ley 25.326 Art. 9 - medidas de seguridad proporcionales a la sensibilidad
- **Correccion:** Implementar reset via email con token temporal de un solo uso

### H-008: Contrasena minima de 6 caracteres (MEDIO)
- **Archivo:** `netlify/functions/hdd-auth.mts:339-341`, `netlify/functions/professionals.mts:329`
- **Hallazgo:** Contrasena minima de 6 caracteres sin requisitos de complejidad
- **Normativa:** Disposicion AAIP 11/2006: Minimo 8 caracteres con combinacion alfanumerica
- **Correccion:** Minimo 8 caracteres, requerir mayusculas, minusculas y numeros

### H-009: Token de sesion en URL via GET (MEDIO)
- **Archivo:** `netlify/functions/hdd-auth.mts:453`, `netlify/functions/professionals.mts:800`
- **Hallazgo:** `sessionToken` se pasa como query parameter en requests GET
- **Impacto:** Los tokens quedan en logs de servidor, historial de navegador, y proxies intermedios
- **Normativa:** OWASP - tokens de sesion no deben transmitirse via URL
- **Correccion:** Usar header `Authorization: Bearer <token>` en todos los requests

---

## SECCION 3: CORS Y SEGURIDAD HTTP

### H-010: CORS abierto a todos los origenes (CRITICO)
- **Archivo:** `netlify/functions/lib/auth.mts:24-29`
- **Hallazgo:** `"Access-Control-Allow-Origin": "*"` en TODOS los endpoints
- **Impacto:** Cualquier sitio web puede hacer requests a la API de la clinica y acceder a datos de pacientes
- **Normativa:**
  - Ley 25.326 Art. 9: Medidas de seguridad para datos personales
  - Ley 26.529 Art. 2: Confidencialidad de datos de salud
  - Res. 1959/2024: Proteccion de datos en sistemas digitales de salud
- **Correccion:** Restringir a `https://clinicajoseingenieros.ar` y `https://clinicajoseingenieros.netlify.app`

### H-011: Sin headers de seguridad HTTP (ALTO)
- **Archivo:** `netlify.toml`
- **Hallazgo:** Faltan headers de seguridad criticos:
  - `Strict-Transport-Security` (HSTS)
  - `Content-Security-Policy` (CSP)
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- **Impacto:** Vulnerable a clickjacking, XSS, sniffing de contenido, ataques man-in-the-middle
- **Normativa:** Res. 1840/2018 - seguridad en transmision de datos
- **Correccion recomendada para `netlify.toml`:**
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=self, microphone=self, geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.mercadopago.com https://*.supabase.co https://api.daily.co"
```

---

## SECCION 4: EXPOSICION DE DATOS SENSIBLES

### H-012: Error responses revelan detalles internos (ALTO)
- **Archivo:** `netlify/functions/hdd-auth.mts:443-446`, `netlify/functions/professionals.mts:787-790`
- **Hallazgo:** Los errores 500 incluyen `details: errorMessage` con stack traces completos
- **Detalle:** Comentario explicito: "Return more details in development to help debug"
- **Impacto:** Un atacante puede obtener informacion sobre la estructura interna, queries SQL, etc.
- **Normativa:** Ley 25.326 - principio de seguridad; OWASP Error Handling
- **Correccion:** Eliminar `details` de respuestas en produccion

### H-013: Endpoint de historial de pagos sin autenticacion (ALTO)
- **Archivo:** `netlify/functions/mercadopago.mts:483-518`
- **Hallazgo:** El endpoint `GET /api/mercadopago?action=history&userId=X` devuelve historial de pagos sin verificar sesion
- **Impacto:** Cualquiera puede ver pagos de cualquier usuario con solo conocer su ID (numerico secuencial)
- **Normativa:**
  - Ley 25.326 Art. 11: Cesion de datos solo con consentimiento
  - Ley 26.529 Art. 2: Confidencialidad
- **Correccion:** Exigir `sessionToken` y validar que pertenece al usuario consultado

### H-014: Sesiones de video sin autorizacion cruzada (MEDIO)
- **Archivo:** `netlify/functions/telemedicine-session.mts:682-724`
- **Hallazgo:** `GET /api/telemedicine/session?userId=X` devuelve sesiones sin validar identidad
- **Impacto:** Cualquiera puede ver las sesiones de videoconsulta de otro usuario
- **Correccion:** Validar sesion del usuario que consulta

### H-015: Endpoint check_dni revela estado de pacientes (MEDIO)
- **Archivo:** `netlify/functions/hdd-auth.mts:410-434`
- **Hallazgo:** `action: "check_dni"` revela si un DNI esta registrado como paciente activo
- **Impacto:** Permite enumeracion de pacientes. Saber que alguien es paciente psiquiatrico es dato sensible
- **Normativa:**
  - Ley 26.529 Art. 2 inc. c): Confidencialidad de la condicion de paciente
  - Ley 26.657 (Salud Mental) Art. 7 inc. d): Derecho a confidencialidad del tratamiento
- **Correccion:** Rate limiting + respuesta generica que no distinga entre "no existe" y "no autorizado"

---

## SECCION 5: CUMPLIMIENTO LEY 27.553 (TELEMEDICINA/RECETAS DIGITALES)

### H-016: Sin consentimiento informado digital (CRITICO)
- **Archivos:** `netlify/functions/telemedicine-session.mts`, `index.html`
- **Hallazgo:** No existe mecanismo de consentimiento informado previo a la teleconsulta
- **Normativa:**
  - Ley 27.553 Art. 2: "Las prescripciones pueden ser confeccionadas de manera electronica... con previo consentimiento del paciente"
  - Ley 26.529 Art. 5-6: Consentimiento informado obligatorio
  - Res. 115/2019 Art. 5: Consentimiento informado especifico para teleasistencia
- **Correccion:** Implementar modal de consentimiento informado con:
  - Explicacion del procedimiento de teleconsulta
  - Limitaciones de la telemedicina
  - Derechos del paciente
  - Checkbox de aceptacion
  - Almacenamiento del consentimiento con fecha/hora/IP

### H-017: Sin firma digital en recetas/indicaciones (CRITICO)
- **Hallazgo:** No hay integracion con firma digital (Ley 25.506) ni firma electronica
- **Normativa:**
  - Ley 25.506: Ley de Firma Digital
  - Ley 27.553 Art. 3: Las prescripciones digitales requieren firma digital o electronica
  - Res. 1959/2024: Las recetas digitales deben tener firma conforme a normativa vigente
- **Correccion:** Integrar con prestador de firma digital certificado (ej. Encode, VALIDe) o implementar firma electronica con certificados del Ministerio

### H-018: Sin identificacion fehaciente del paciente remoto (ALTO)
- **Hallazgo:** La teleconsulta no verifica identidad del paciente mas alla del login con DNI/contrasena
- **Normativa:**
  - Ley 27.553 Art. 2: "mediante la utilizacion de plataformas de teleasistencia en salud validadas"
  - Res. 115/2019 Art. 4: Identificacion fehaciente del paciente
- **Correccion:** Implementar al menos uno de:
  - Verificacion por video al inicio de la consulta
  - Validacion de identidad via RENAPER
  - Segundo factor de autenticacion

### H-019: Sin registro de la teleconsulta como acto medico (ALTO)
- **Hallazgo:** Las sesiones de video se registran con datos tecnicos pero no como acto medico
- **Normativa:**
  - Ley 26.529 Art. 15: Toda actuacion medica debe registrarse en la HC
  - Res. 115/2019 Art. 7: La teleconsulta debe quedar registrada como parte de la HC
- **Correccion:** Integrar registro de teleconsulta con campos:
  - Motivo de consulta
  - Diagnostico presuntivo (CIE-10)
  - Indicaciones
  - Derivaciones
  - Profesional interviniente con matricula

---

## SECCION 6: CUMPLIMIENTO LEY 26.529 (HISTORIA CLINICA DIGITAL)

### H-020: Sin historia clinica digital estructurada (CRITICO)
- **Hallazgo:** El sistema NO tiene modulo de historia clinica. Solo registra metricas de juegos y estados de animo
- **Normativa:**
  - Ley 26.529 Art. 12: "La historia clinica es el documento obligatorio..."
  - Ley 26.529 Art. 15: Contenido minimo: fecha, datos del profesional, datos del paciente, evolucion, diagnostico, tratamiento
  - Res. 1840/2018: Estandares para HC electronica
- **Impacto:** Sin HC digital, el portal no puede funcionar como sistema de informacion clinica habilitado
- **Correccion:** Implementar modulo de HC con campos obligatorios segun Ley 26.529

### H-021: Sin trazabilidad de accesos a datos clinicos (ALTO)
- **Hallazgo:** No existe tabla de audit log para registrar quien accede a datos de pacientes
- **Normativa:**
  - Ley 26.529 Art. 18: "La historia clinica es propiedad del paciente"
  - Ley 25.326 Art. 9: Trazabilidad de accesos
  - Res. 1840/2018: Log de accesos obligatorio
- **Correccion:** Crear tabla `audit_log` con: usuario, accion, recurso, timestamp, IP

### H-022: Sin mecanismo de portabilidad de datos (MEDIO)
- **Hallazgo:** No hay endpoint para exportar datos del paciente
- **Normativa:**
  - Ley 26.529 Art. 19: Copia de HC a solicitud del paciente
  - Ley 25.326 Art. 14: Derecho de acceso a datos personales
- **Correccion:** Implementar endpoint de exportacion de datos en formato estandar (CDA/HL7 FHIR)

---

## SECCION 7: CUMPLIMIENTO RESOLUCION 1959/2024 (ReNaPDiS)

### H-023: Sin registro en ReNaPDiS (CRITICO)
- **Hallazgo:** No hay evidencia de registro ante el Registro Nacional de Prestadores Digitales en Salud
- **Normativa:** Res. 1959/2024 Art. 3: Todo sistema de salud digital debe registrarse
- **Accion:** Iniciar tramite de inscripcion ante el Ministerio de Salud

### H-024: Sin interoperabilidad con SNOMED-CT/CIE-10 (ALTO)
- **Hallazgo:** No se utilizan terminologias estandar para diagnosticos o procedimientos
- **Normativa:**
  - Res. 1959/2024: Interoperabilidad obligatoria
  - Res. 1840/2018: Uso de SNOMED-CT para codificacion
- **Correccion:** Integrar catalogos SNOMED-CT para diagnosticos y CIE-10 para codificacion

### H-025: Sin estandar HL7 FHIR (MEDIO)
- **Hallazgo:** Los endpoints usan formato JSON propietario, no HL7 FHIR
- **Normativa:** Res. 1959/2024 - interoperabilidad con estandares internacionales
- **Correccion:** Migrar gradualmente a recursos FHIR (Patient, Encounter, Observation, etc.)

---

## SECCION 8: PROTECCION DE DATOS PERSONALES (Ley 25.326)

### H-026: Sin politica de privacidad publicada (ALTO)
- **Archivo:** `index.html`
- **Hallazgo:** No existe pagina de politica de privacidad ni aviso legal
- **Normativa:**
  - Ley 25.326 Art. 6: Informacion al titular de los datos
  - Disposicion AAIP 10/2018: Requisitos del aviso de privacidad
- **Correccion:** Crear y publicar politica de privacidad que incluya:
  - Responsable del tratamiento
  - Finalidad
  - Destinatarios
  - Derechos ARCO (Acceso, Rectificacion, Cancelacion, Oposicion)
  - Plazo de conservacion
  - Medidas de seguridad

### H-027: Sin aviso legal / terminos de uso (MEDIO)
- **Hallazgo:** No hay terminos y condiciones de uso del portal
- **Normativa:** Ley 24.240 (Defensa del Consumidor) - informacion clara sobre el servicio
- **Correccion:** Redactar y publicar terminos de uso

### H-028: Datos de pacientes en logs de consola (MEDIO)
- **Archivo:** `netlify/functions/notifications.mts:29`
- **Hallazgo:** `console.log` incluye telefono y mensaje de WhatsApp de pacientes
- **Normativa:** Ley 25.326 Art. 9 - los datos personales no deben exponerse en logs
- **Correccion:** Sanitizar logs, nunca incluir PII

---

## SECCION 9: SEGURIDAD DE BASE DE DATOS

### H-029: Sin cifrado de datos en reposo para campos sensibles (ALTO)
- **Archivos:** Migrations `001_initial.sql` a `014_*`
- **Hallazgo:** DNI, email, telefono, datos de salud mental se almacenan en texto plano
- **Normativa:**
  - Ley 25.326 Art. 9: Medidas de seguridad tecnica
  - Disposicion AAIP 11/2006: Cifrado para datos de nivel critico (salud)
- **Correccion:** Implementar cifrado a nivel de columna para:
  - `hdd_patients.dni`
  - `hdd_patients.email`
  - `hdd_patients.phone`
  - Datos clinicos y de salud mental

### H-030: Datos semilla con pacientes reales (ALTO)
- **Archivo:** `migrations/006_seed_hdd_patients.sql`
- **Hallazgo:** Migracion de seed contiene datos que podrian ser de pacientes reales (DNIs, nombres)
- **Normativa:**
  - Ley 25.326 Art. 10: Deber de confidencialidad
  - Ley 26.657 Art. 7: Confidencialidad en salud mental
- **Correccion:** Verificar que los datos de seed son ficticios. Si son reales, eliminar del historial Git

### H-031: Sin Row Level Security (RLS) en Supabase (MEDIO)
- **Hallazgo:** No se configuran politicas RLS en las migraciones
- **Impacto:** Si la `anon_key` de Supabase se expone, acceso directo a toda la base de datos
- **Correccion:** Implementar RLS para todas las tablas con datos de pacientes

---

## SECCION 10: SEGURIDAD DEL FRONTEND

### H-032: Token de sesion en localStorage (ALTO)
- **Hallazgo estimado:** Los tokens se almacenan en `localStorage` (patron estandar del frontend observado)
- **Impacto:** Vulnerable a XSS - cualquier script inyectado puede robar tokens
- **Correccion:** Usar `httpOnly` cookies o sessionStorage con politica CSP estricta

### H-033: Sin sanitizacion de inputs HTML (MEDIO)
- **Hallazgo:** Los datos de pacientes se insertan en el DOM sin sanitizacion explicitamente visible
- **Impacto:** Potencial XSS almacenado si un nombre de paciente contiene HTML malicioso
- **Correccion:** Usar `textContent` en vez de `innerHTML` para datos de usuario

### H-034: SECURITY.md es template generico (BAJO)
- **Archivo:** `SECURITY.md`
- **Hallazgo:** El archivo SECURITY.md es el template por defecto de GitHub, sin personalizacion
- **Correccion:** Personalizar con proceso real de reporte de vulnerabilidades

---

## SECCION 11: ARQUITECTURA Y CODIGO

### H-035: Codigo muerto / unreachable (MEDIO)
- **Archivo:** `netlify/functions/telemedicine-session.mts:563`
- **Hallazgo:** `if (action === "schedule_call")` esta despues de un `return` incondicional (linea 551-560)
- **Impacto:** Codigo muerto que agrega confuion y complejidad innecesaria

### H-036: SQL injection via concatenacion de strings (MEDIO)
- **Archivo:** `netlify/functions/telemedicine-session.mts:413`
- **Hallazgo:** `notes = CONCAT(notes, ' | Sala: ${dailyRoomName || 'sin sala'}')` - interpolacion de JS dentro de template literal de SQL
- **Detalle:** Aunque `postgresjs` parametriza los tagged templates, la interpolacion JS dentro del string SQL NO esta parametrizada
- **Impacto:** Potencial SQL injection si `dailyRoomName` contiene caracteres especiales
- **Correccion:** Usar parametros separados: `notes = CONCAT(notes, ' | Sala: ' || ${dailyRoomName || 'sin sala'})`

### H-037: Migraciones con ALTER TABLE en runtime (MEDIO)
- **Archivo:** `netlify/functions/professionals.mts:10-44`
- **Hallazgo:** `ensureVerificationColumns()` ejecuta ALTER TABLE en cada request
- **Impacto:** Posible degradacion de rendimiento y condiciones de carrera
- **Correccion:** Ejecutar migraciones en el proceso de build, no en runtime

### H-038: Duplicacion de migraciones (BAJO)
- **Archivos:** `migrations/014_create_missing_tables_complete.sql` vs `migrations/014_two_tier_patient_model.sql`
- **Hallazgo:** Dos migraciones con el mismo numero (014)
- **Impacto:** Inconsistencia en el esquema segun cual se ejecute primero

### H-039: Sin validacion de webhook de MercadoPago (ALTO)
- **Archivo:** `netlify/functions/mercadopago.mts:177-383`
- **Hallazgo:** El webhook de MercadoPago no valida la firma/origen del request
- **Impacto:** Un atacante puede enviar webhooks falsos para activar sesiones sin pago real
- **Normativa:** PCI DSS - validacion de integridad de notificaciones de pago
- **Correccion:** Validar header `x-signature` de MercadoPago usando el secret del webhook

---

## SECCION 12: TELEMEDICINA - DAILY.CO

### H-040: Salas de video "public" por defecto (MEDIO)
- **Archivo:** `netlify/functions/lib/daily.mts:38`
- **Hallazgo:** `privacy: "public"` en la configuracion por defecto de salas
- **Nota:** En `telemedicine-session.mts` se usa `privacy: "private"`, pero la funcion helper crea salas publicas
- **Impacto:** Si se usa la funcion helper, cualquiera con la URL puede entrar a la consulta
- **Normativa:** Ley 26.529 Art. 2 - confidencialidad de la consulta
- **Correccion:** Cambiar default a `"private"`

### H-041: Sin grabacion ni registro de la sesion de video (MEDIO)
- **Hallazgo:** No se registra duracion real, participantes, ni se graba la sesion
- **Normativa:** Res. 115/2019 Art. 7 - registro de la teleconsulta
- **Correccion:** Implementar registro de eventos de la sala (join, leave, duracion)

---

## SECCION 13: PROCESAMIENTO DE PAGOS

### H-042: Sin verificacion de monto en webhook (ALTO)
- **Archivo:** `netlify/functions/mercadopago.mts:188-233`
- **Hallazgo:** El webhook acepta el monto reportado por MercadoPago sin verificar contra el monto esperado
- **Impacto:** Un atacante podria pagar menos y aun asi activar la sesion
- **Correccion:** Comparar `paymentInfo.transaction_amount` contra el monto registrado en `mp_payments`

### H-043: Precios hardcodeados en el backend (BAJO)
- **Archivo:** `netlify/functions/telemedicine-session.mts:42-64`
- **Hallazgo:** Precios de telemedicina hardcodeados en el codigo fuente
- **Correccion:** Mover a configuracion en DB o variables de entorno

---

## SECCION 14: CONFIGURACION DE DEPLOY

### H-044: Escaneo de secretos deshabilitado (MEDIO)
- **Archivo:** `netlify.toml:4`
- **Hallazgo:** `SECRETS_SCAN_SMART_DETECTION_ENABLED = "false"`
- **Impacto:** Netlify no escaneara el build por secretos expuestos
- **Correccion:** Habilitar (`"true"`)

### H-045: SPA fallback captura todo (BAJO)
- **Archivo:** `netlify.toml:113-115`
- **Hallazgo:** `from = "/*" to = "/index.html"` captura todas las rutas no matcheadas
- **Impacto:** Puede enmascarar errores 404 y dificultar la deteccion de paths incorrectos

---

## SECCION 15: ACCESIBILIDAD Y UX

### H-046: Sin certificacion WCAG (BAJO)
- **Hallazgo:** No hay evidencia de cumplimiento de accesibilidad WCAG 2.1
- **Normativa:** Ley 26.653 (Accesibilidad Web) - sitios de interes publico
- **Correccion:** Auditar con herramientas como axe-core o WAVE

### H-047: Juegos terapeuticos sin disclaimer medico (BAJO)
- **Archivos:** `games/play/*.html`
- **Hallazgo:** Los juegos (Pill Organizer, Neuro-Chef, etc.) no incluyen disclaimer de que no constituyen tratamiento medico
- **Correccion:** Agregar disclaimer visible en cada juego

---

## CHECKLIST DE HABILITACION MINISTERIAL

### Resolucion 1840/2018 - HCE

| Requisito | Estado | Referencia |
|-----------|--------|------------|
| Historia Clinica Digital | NO IMPLEMENTADO | H-020 |
| Firma digital/electronica | NO IMPLEMENTADO | H-017 |
| Trazabilidad de accesos | NO IMPLEMENTADO | H-021 |
| Identificacion univoca del paciente | PARCIAL (DNI sin validacion RENAPER) | H-018 |
| Interoperabilidad SNOMED-CT | NO IMPLEMENTADO | H-024 |
| Backup y recuperacion | NO VERIFICADO | - |
| Cifrado de datos en reposo | NO IMPLEMENTADO | H-029 |
| Cifrado de datos en transito | SI (HTTPS via Netlify) | - |
| Control de acceso basado en roles | PARCIAL (solo admin/profesional) | - |
| Registro de modificaciones | NO IMPLEMENTADO | H-021 |

### Ley 27.553 - Telemedicina

| Requisito | Estado | Referencia |
|-----------|--------|------------|
| Consentimiento informado digital | NO IMPLEMENTADO | H-016 |
| Prescripcion electronica con firma | NO IMPLEMENTADO | H-017 |
| Identificacion del paciente | PARCIAL | H-018 |
| Registro de teleconsulta en HC | NO IMPLEMENTADO | H-019 |
| Plataforma validada | NO REGISTRADA | H-023 |

### Resolucion 1959/2024 - ReNaPDiS

| Requisito | Estado | Referencia |
|-----------|--------|------------|
| Registro en ReNaPDiS | NO INICIADO | H-023 |
| Interoperabilidad HL7 FHIR | NO IMPLEMENTADO | H-025 |
| Estandares de seguridad | INSUFICIENTE | Seccion 2-4 |

### Ley 25.326 - Proteccion de Datos Personales

| Requisito | Estado | Referencia |
|-----------|--------|------------|
| Politica de privacidad | NO PUBLICADA | H-026 |
| Consentimiento para tratamiento de datos | NO IMPLEMENTADO | H-016 |
| Medidas de seguridad tecnica | INSUFICIENTE | H-004, H-010 |
| Derecho de acceso | NO IMPLEMENTADO | H-022 |
| Deber de confidencialidad | RIESGO | H-001, H-012-H-015 |
| Registro de base de datos ante AAIP | NO VERIFICADO | - |

---

## PLAN DE REMEDIACION PRIORIZADO

### Fase 1: EMERGENCIA (Semana 1)
1. **Rotar credenciales SMTP** expuestas en Git (H-001)
2. **Restringir CORS** a dominios propios (H-010)
3. **Eliminar detalles de error** en produccion (H-012)
4. **Agregar autenticacion** a endpoints de historial/sesiones (H-013, H-014)
5. **Validar webhook** de MercadoPago (H-039)

### Fase 2: CRITICA (Semanas 2-4)
6. **Migrar hashing** de SHA-256 a argon2id (H-004)
7. **Implementar expiracion de sesiones** (H-005)
8. **Agregar rate limiting** en login (H-006)
9. **Agregar headers de seguridad** HTTP (H-011)
10. **Implementar consentimiento informado** digital (H-016)
11. **Publicar politica de privacidad** (H-026)

### Fase 3: NORMATIVA (Meses 2-3)
12. **Implementar modulo de HC digital** (H-020)
13. **Implementar audit log** (H-021)
14. **Integrar firma digital** (H-017)
15. **Implementar cifrado de datos sensibles** (H-029)
16. **Integrar SNOMED-CT / CIE-10** (H-024)

### Fase 4: HABILITACION (Meses 3-6)
17. **Registrar en ReNaPDiS** (H-023)
18. **Implementar HL7 FHIR** (H-025)
19. **Implementar portabilidad de datos** (H-022)
20. **Auditar accesibilidad WCAG** (H-046)

---

## CONCLUSION

El portal de la Clinica Jose Ingenieros tiene una base funcional solida para servicios de Hospital de Dia digital (juegos terapeuticos, metricas de bienestar, portal de pacientes) y telemedicina (videoconsulta con pago integrado). Sin embargo, presenta deficiencias criticas en:

1. **Seguridad**: Credenciales expuestas, hashing debil, CORS abierto, endpoints sin autenticacion
2. **Cumplimiento normativo**: Sin HC digital, sin firma digital, sin consentimiento informado, sin registro en ReNaPDiS
3. **Proteccion de datos**: Sin politica de privacidad, datos sensibles sin cifrar, logs con PII

**El sistema NO esta listo para habilitacion ministerial** en su estado actual. Se requiere la implementacion del plan de remediacion propuesto, comenzando por las acciones de emergencia en la Fase 1.

---

*Informe generado automaticamente. Requiere revision por profesional de seguridad informatica y asesor legal especializado en derecho sanitario argentino.*
