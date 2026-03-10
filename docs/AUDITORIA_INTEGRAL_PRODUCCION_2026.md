# AUDITORÍA INTEGRAL DE PRODUCCIÓN — Clínica José Ingenieros
**Fecha:** 10 de marzo de 2026
**Alcance:** Frontend (JS), Backend (Netlify Functions), Base de Datos (Supabase/PostgreSQL), Normativa Argentina
**Archivos auditados:** 8 JS, 26 MTS, 27 SQL, 15+ HTML

---

## RESUMEN EJECUTIVO

| Área | Nota | Estado |
|------|------|--------|
| Código y sintaxis | **7/10** | Sólido, necesita modularización y sanitización |
| Logging / Auditoría | **6/10** | Existe pero no es inmutable ni completo |
| Telemedicina | **5/10** | Funcional, falta consentimiento informado y firma (Ley 27.553) |
| HCE | **7/10** | Modelo robusto (11 tablas), falta firma digital y cifrado |
| Seguridad | **3/10** | 9 vulnerabilidades CRÍTICAS, 12 ALTAS |
| Supabase/BD | **4/10** | RLS habilitado sin políticas efectivas, datos en texto plano |
| Firma y Sello | **2/10** | Solo snapshots de texto, no cumple Ley 25.506 |
| Recetas | **3/10** | Sin firma digital, sin ID único, sin tracking de psicotrópicos |
| Contabilidad | **2/10** | Solo Mercado Pago, sin facturación AFIP |

**Puntaje global de production-readiness: 4.3/10**
**Veredicto: NO APTO para lanzamiento comercial sin correcciones críticas.**

---

## HALLAZGOS BLOQUEANTES (9 Issues CRÍTICOS)

### CRIT-01: XSS via innerHTML con datos no sanitizados
**Archivos:** `js/core.js:570,644,814` | `js/telemedicine.js:412,1188` | `js/hdd-hce.js:155,202,289`
**Descripción:** Se inyecta HTML dinámico usando `innerHTML` con datos de servidor sin sanitizar consistentemente.

**Ejemplos específicos:**
```javascript
// core.js:570 — Announcements con a.title y a.content directo
list.innerHTML = filteredAnnouncements.map(a => `
    <h4>${a.title}</h4>        // ← NO SANITIZADO
    <p>${a.content}</p>        // ← NO SANITIZADO
`).join('');

// core.js:814 — Consultas con c.message directo
listEl.innerHTML = data.consultations.map(c => `
    <div>${c.message}</div>    // ← NO SANITIZADO
`).join('');

// core.js:644 — Profesionales con prof.fullName directo
listEl.innerHTML = data.professionals.map(prof => `
    <div>${prof.fullName}</div>  // ← NO SANITIZADO
`).join('');

// telemedicine.js:412 — iframe src con roomUrl potencialmente manipulable
container.innerHTML = `<iframe src="${roomUrl}" ...>`;

// hdd-hce.js:155-167 — Alertas médicas con datos del paciente
alertsEl.innerHTML += '<span>' + esc(p.grupo_sanguineo) + '</span>';  // ✅ usa esc()
// PERO en hdd-hce.js:202 los datos filiatorios NO se sanitizan completamente
```

**Nota:** `hdd-admin.js` tiene una función `escapeHtml()` (línea 2099) y la usa en muchos lugares, pero `core.js` y `telemedicine.js` NO la usan.

**Impacto:** Un atacante que inyecte `<script>` en campos de nombre, título o mensaje puede ejecutar código JS en el navegador de profesionales médicos, robando tokens de sesión o manipulando datos clínicos.

**Corrección:**
```javascript
// Agregar a core.js y telemedicine.js:
function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// Usar esc() en TODOS los datos dinámicos dentro de innerHTML
```

---

### CRIT-02: Webhook de MercadoPago sin verificación de firma
**Archivo:** `netlify/functions/mercadopago.mts:172-178`

**Descripción:** El handler de webhooks acepta notificaciones de pago SIN verificar el header `X-Signature` de MercadoPago. Un atacante puede forjar confirmaciones de pago.

```javascript
// ACTUAL — Sin verificación:
if (action === "webhook" || req.url.includes('/webhook')) {
    const { type, data } = body;
    if (type === "payment") {
        // Procesa directamente sin validar firma
```

**Impacto:** Bypass de pago completo — sesiones de telemedicina gratis.

**Corrección:** Implementar verificación HMAC-SHA256 con `X-Signature` y `X-Request-Id`.

---

### CRIT-03: GRANT ALL a `anon` en `hdd_game_metrics`
**Archivo:** `migrations/013_unified_patient_profile.sql`

```sql
GRANT ALL ON hdd_game_metrics TO anon, authenticated, service_role;
```

**Descripción:** Usuarios no autenticados pueden INSERT/UPDATE/DELETE datos biométricos de pacientes (tremor, tiempo de reacción, hesitación).

**Impacto:** Exposición y manipulación de datos médicos sensibles. Violación directa de Ley 25.326.

**Corrección:**
```sql
REVOKE ALL ON hdd_game_metrics FROM anon, authenticated;
GRANT SELECT, INSERT ON hdd_game_metrics TO service_role;
```

---

### CRIT-04: Datos médicos sin cifrar at-rest
**Archivos:** Todas las migraciones SQL

**Datos en texto plano:**
| Dato | Tabla | Riesgo |
|------|-------|--------|
| DNI | `hdd_patients`, `healthcare_professionals`, `telemedicine_users` | PII |
| Diagnósticos CIE-10/DSM-5 | `hce_diagnosticos.codigo, descripcion` | PHI |
| Medicación (droga, dosis) | `hce_medicacion` | PHI |
| Evoluciones clínicas | `hce_evoluciones.contenido` | PHI |
| Examen mental | `hce_evoluciones.examen_mental` | PHI |
| Signos vitales | `hce_signos_vitales` | PHI |
| Datos mood/biométricos | `hdd_mood_entries`, `hdd_game_metrics` | PHI |
| Tokens de sesión | `*.session_token` | Auth |

**No se usa:** `pgcrypto`, `pgsodium`, ni cifrado a nivel aplicación.

**Corrección:** Implementar cifrado con `pgcrypto` o Supabase Vault para columnas sensibles.

---

### CRIT-05: Firma digital NO criptográfica — NO cumple Ley 25.506
**Archivo:** `migrations/021_user_roles_firma_sello.sql`

**Implementación actual:**
```sql
ALTER TABLE hce_evoluciones ADD COLUMN firma_nombre VARCHAR(255);
ALTER TABLE hce_evoluciones ADD COLUMN firma_especialidad VARCHAR(100);
ALTER TABLE hce_evoluciones ADD COLUMN firma_matricula VARCHAR(60);
ALTER TABLE hce_evoluciones ADD COLUMN firma_role VARCHAR(50);
```

**Problema:** Son snapshots de texto (nombre, matrícula). NO hay:
- Hash criptográfico del contenido
- Certificado X.509 / PKI
- Timestamp de autoridad certificante
- No-repudio (el profesional puede negar haber firmado)
- Cadena de custodia

**Marco legal:**
- **Ley 25.506 (Firma Digital):** Requiere infraestructura PKI para validez jurídica
- **Ley 26.529 Art. 12:** HC electrónica requiere firma digital
- **Res. 115/2019:** Documentos de telemedicina requieren firma digital

**Corrección:** Integrar con ENCODE S.A. o prestador habilitado de firma digital (Ley 25.506).

---

### CRIT-06: Sin facturación electrónica AFIP
**Archivos:** `netlify/functions/mercadopago.mts` (único módulo de pagos)

**Estado actual:** Solo existe pasarela de pago MercadoPago. NO hay:
- Web Service WSFE/WSFEX (factura electrónica)
- CAE/CAEA (Código de Autorización Electrónico)
- Tipos de comprobante (Factura B/C)
- Punto de venta fiscal
- Libro IVA digital
- Integración con obras sociales (formato SIS)

**Impacto:** No puede operar comercialmente en Argentina sin emitir factura electrónica.

---

### CRIT-07: RLS habilitado sin políticas definidas
**Archivos:** `migrations/015_fix_rls_and_security.sql`, `migrations/016_hce_historia_clinica.sql`

**Estado:**
```sql
-- Se ejecuta:
ALTER TABLE hce_diagnosticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE hce_medicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE hce_evoluciones ENABLE ROW LEVEL SECURITY;
-- etc. para 10+ tablas clínicas

-- PERO: 0 políticas definidas para estas tablas
-- Resultado: RLS activado = DENY ALL por defecto
-- PERO: service_role BYPASSES RLS → Netlify functions tienen acceso total
```

**Impacto:** RLS no protege nada porque todas las operaciones pasan por `service_role` (Netlify backend). Si un atacante accede directamente a Supabase, las políticas de denegación por defecto bloquean todo, pero no hay granularidad.

---

### CRIT-08: Consentimiento informado solo en localStorage
**Archivo:** `js/hdd-hce.js:238-272`

```javascript
function saveConsent() {
    const consentData = { tratamiento, hce, medicacion, estudios, internacion };
    localStorage.setItem('hce_consent_' + patientId, JSON.stringify(consentData));
    // ← Solo localStorage, NO persiste en servidor
}
```

**Problema:** El consentimiento informado:
- Se pierde al limpiar el navegador
- No tiene validez jurídica (sin fecha/hora/IP/firma)
- No se persiste en la base de datos
- No se vincula a la historia clínica
- No cumple con Ley 27.553 para telemedicina

---

### CRIT-09: Tokens de sesión en URLs y sin hash
**Archivos:** `netlify/functions/mercadopago.mts:299`, múltiples funciones

```javascript
dailyPatientUrl = `${room.url}?t=${patientToken.token}`;
// Token en URL → visible en logs, HTTP Referer, historial del navegador
```

Además, los tokens se almacenan en texto plano en la DB:
```sql
healthcare_professionals.session_token VARCHAR(255)  -- sin hash
hdd_patients.session_token VARCHAR(255)  -- sin hash
```

---

## HALLAZGOS DE ALTA PRIORIDAD (12 Issues)

### ALT-01: Profesionales con contraseña mínima de 6 caracteres
**Archivo:** `netlify/functions/professionals.mts:326`, `js/hdd-admin.js:2212`
- Demasiado débil para un sistema médico. Recomendado: 12+ caracteres con complejidad.

### ALT-02: Rate limiting en memoria (se pierde al reiniciar)
**Archivo:** `netlify/functions/consultations.mts:42`
- Las funciones serverless se reinician frecuentemente → rate limiting inefectivo.
- sessionId puede rotarse para evadir el límite.

### ALT-03: anon puede INSERT en `professional_audit_log`
**Archivo:** `migrations/018_professional_audit_log.sql`
```sql
GRANT SELECT, INSERT ON professional_audit_log TO anon, authenticated;
```
- Usuarios anónimos pueden crear entradas de auditoría falsas.

### ALT-04: Sin Content Security Policy (CSP)
- No hay headers CSP en las respuestas HTTP.
- Facilita ataques XSS y inyección de scripts externos.

### ALT-05: Reporte clínico exporta solo TXT sin protección
**Archivo:** `js/hdd-admin.js:1507-1537`
```javascript
function exportPatientReport() {
    // Genera archivo .txt sin cifrar, sin marca de agua, sin auditoría
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
}
```
- Datos clínicos exportados sin cifrar ni registrar la exportación.

### ALT-06: Sin validación de prescripciones para psicotrópicos
**Archivo:** `hce_medicacion` (tabla SQL)
- No hay campo para clasificación de psicotrópicos (Schedule I-IV)
- No hay tracking de dispensación
- No hay alertas de interacciones medicamentosas
- No hay libro de psicotrópicos (obligatorio por ANMAT)

### ALT-07: Detección de crisis con falsos positivos
**Archivo:** `netlify/functions/hdd-games.mts:408-417`
```javascript
const concerningKeywords = ['suicid', 'morir', 'no puedo mas', 'terminar', 'daño', 'cortar'];
const lowerNote = note.toLowerCase();
for (const keyword of concerningKeywords) {
    if (lowerNote.includes(keyword)) alertTriggered = true;
}
```
- "Puedo cortar verduras" activaría la alarma. Se necesita NLP contextual.

### ALT-08: Audit trail sin inmutabilidad
- Los registros de auditoría pueden ser eliminados o modificados.
- No hay hash chaining, no hay firma criptográfica.
- No cumple con requisitos de no-repudio.

### ALT-09: Evoluciones clínicas editables sin versionado
**Archivo:** `js/hdd-hce.js` (función editEvolution)
- Las evoluciones se pueden editar destructivamente.
- Debería crear nueva versión (nunca UPDATE, siempre INSERT nueva versión).

### ALT-10: Session tokens no se rotan
- El token permanece estático durante toda la sesión.
- No hay expiración automática configurable.

### ALT-11: Sin idempotencia en guardado de sesiones de juego
**Archivo:** `netlify/functions/hdd-games.mts`
- Guardar resultados de juego múltiples veces duplica registros.

### ALT-12: Upload sin rate limiting
**Archivo:** `netlify/functions/upload.mts`
- Sin límite de subida por usuario. DoS posible con archivos de 5MB repetidos.

---

## HALLAZGOS POR ÁREA DETALLADOS

### 1. CÓDIGO FRONTEND (7/10)

**Positivo:**
- Función `escapeHtml()` implementada en `hdd-admin.js:2099` y `hdd-portal.js:626` y `hdd-index.js:106`
- Código modular con separación clara por función
- i18n implementado (ES/EN/PT)
- Sistema de tabs y modales funcional
- Canvas charts personalizados (sin dependencia de Chart.js)

**Negativo:**
- `core.js` y `telemedicine.js` NO usan `escapeHtml()` → XSS
- Estilos inline excesivos en JS (debería estar en CSS)
- Console.log extensivo en producción (`core.js:170-256` tiene 20+ console.log)
- Sin minificación ni bundling
- `telemedicine.js:412` inyecta iframe src sin validación

### 2. TELEMEDICINA (5/10)

**Implementado:**
- Registro de usuario telemedicina (`telemedRegister`)
- Flujo de pago con MercadoPago
- Videollamada con Daily.co
- Cola de llamadas (`call-queue.mts`)
- Créditos/sesiones prepagadas

**Faltante para Ley 27.553:**
- ❌ Consentimiento informado previo a cada consulta (OBLIGATORIO)
- ❌ Firma digital en prescripciones electrónicas
- ❌ Registro en REFEPS (Registro Federal de EPS)
- ❌ Almacenamiento seguro de grabaciones (si aplica)
- ❌ Certificado de la plataforma ante autoridad sanitaria

**Consentimiento actual:** Solo checkboxes en HCE (localStorage), NO para telemedicina.

### 3. HCE — HISTORIA CLÍNICA ELECTRÓNICA (7/10)

**Implementado (11 tablas):**
- ✅ Datos filiatorios ampliados (fecha nacimiento, sexo, género, nacionalidad, dirección, OS)
- ✅ Antecedentes (personal, familiar, quirúrgico, alérgico, hábito, perinatal, ginecológico)
- ✅ Diagnósticos (CIE-10/DSM-5, tipos: principal/secundario/diferencial)
- ✅ Medicación (droga, dosis, frecuencia, vía, estado, motivo suspensión)
- ✅ Evoluciones (evolucion, interconsulta, epicrisis, ingreso, egreso)
- ✅ Estudios complementarios (laboratorio, imagen, EEG, psicométrico)
- ✅ Signos vitales (peso, talla, TA, FC, FR, temp, SpO2, glucemia)
- ✅ Número de HC auto-generado
- ✅ Flag de confidencialidad
- ✅ Autosave en evoluciones
- ✅ Vista resumen (`v_hce_resumen_paciente`)

**Faltante:**
- ❌ Firma digital criptográfica (solo snapshots de texto)
- ❌ Cifrado de datos clínicos
- ❌ Exportación PDF de HC
- ❌ Versionado inmutable de evoluciones
- ❌ Consentimiento persistido en DB
- ❌ Interoperabilidad HL7/FHIR

### 4. FIRMA Y SELLO (2/10)

**Estado:** Solo metadata textual:
```
firma_nombre: "Dr. Juan Pérez"
firma_especialidad: "Psiquiatría"
firma_matricula: "MN 12345"
firma_role: "medico"
```

**Para cumplir Ley 25.506 se necesita:**
1. Certificado X.509 del profesional
2. Hash SHA-256 del contenido firmado
3. Timestamp de autoridad certificante
4. Cadena de certificación verificable
5. Almacenamiento seguro de claves privadas (HSM)
6. Integración con prestador habilitado (ENCODE, firma-digital.gob.ar)

### 5. RECETAS / PRESCRIPCIONES (3/10)

**Implementado:**
- Tabla `hce_medicacion` con campos básicos
- Tabla `doctor_prescriptions` para servicios (gaming, terapia)
- Atribución del profesional prescriptor

**Faltante:**
- ❌ ID único de receta (obligatorio)
- ❌ Firma digital del prescriptor (Ley 27.553)
- ❌ Clasificación de psicotrópicos
- ❌ Libro de estupefacientes/psicotrópicos (ANMAT)
- ❌ Tracking de dispensación
- ❌ Alertas de interacciones medicamentosas
- ❌ Formato estandarizado de receta electrónica
- ❌ Validación contra VADEMECUM/ANMAT

### 6. CONTABILIDAD / FACTURACIÓN (2/10)

**Implementado:**
- Pasarela MercadoPago (cobro de consultas)
- Tabla `mp_payments` para registrar pagos
- Sistema de créditos prepagados

**Faltante:**
- ❌ Web Service AFIP WSFE (factura electrónica) — OBLIGATORIO
- ❌ Generación de CAE/CAEA
- ❌ Tipos de comprobante (Factura B, C, nota de crédito)
- ❌ Punto de venta fiscal
- ❌ Libro IVA digital
- ❌ Integración con obras sociales (formato SIS)
- ❌ Módulo de caja/contabilidad
- ❌ Reportes fiscales
- ❌ Gestión de cobros a OS/prepagas

### 7. SUPABASE / BASE DE DATOS (4/10)

**Positivo:**
- Esquema bien diseñado (50+ tablas)
- Índices completos (50+)
- Foreign keys con CASCADE apropiado
- Migraciones ordenadas (27 archivos)
- Constraints CHECK en mood_value

**Crítico:**
- RLS habilitado sin políticas → falsa sensación de seguridad
- GRANT ALL a `anon` en tablas sensibles
- Sin `pgcrypto` / cifrado de columnas
- Tokens de sesión en texto plano
- Sin UNIQUE en (patient_id, date) para check-ins diarios
- `prescripto_por` cambió de FK a VARCHAR (pierde integridad referencial)

### 8. LOGGING / AUDITORÍA (6/10)

**Implementado:**
- `professional_audit_log` con 13 tipos de acción
- `hdd_login_tracking` para logins de pacientes
- `notification_log` para emails/WhatsApp
- `hdd_interaction_log` para interacciones generales
- Vista `v_professional_usage_summary`
- Console.log extensivo en frontend (pero excesivo para producción)

**Faltante:**
- ❌ Inmutabilidad (hash chaining)
- ❌ Registro de acceso a datos (quién vio qué)
- ❌ Intentos de login fallidos
- ❌ Exportación/descarga de datos clínicos
- ❌ Cambios de roles/permisos
- ❌ Firma criptográfica de registros de auditoría
- ❌ Limpieza de console.log en producción

---

## CUMPLIMIENTO NORMATIVO ARGENTINO

| Normativa | Requisito | Estado | Gravedad |
|-----------|-----------|--------|----------|
| **Ley 25.506** (Firma Digital) | PKI para documentos electrónicos | ❌ No implementado | BLOQUEANTE |
| **Ley 26.529** (Derechos del Paciente) | HC con consentimiento + confidencialidad | ⚠️ Parcial | CRÍTICO |
| **Ley 27.553** (Telemedicina) | Consentimiento + firma electrónica | ❌ No implementado | BLOQUEANTE |
| **Ley 25.326** (Datos Personales) | Cifrado + consentimiento | ❌ No implementado | CRÍTICO |
| **ANMAT** (Psicotrópicos) | Libro + receta especial | ❌ No implementado | ALTO |
| **AFIP** | Facturación electrónica | ❌ No implementado | BLOQUEANTE |
| **Res. 115/2019** | Consentimiento teleasistencia | ❌ No implementado | CRÍTICO |

---

## PLAN DE ACCIÓN RECOMENDADO

### FASE 1 — Seguridad Crítica (Semanas 1-2)
| # | Tarea | Archivos | Esfuerzo |
|---|-------|----------|----------|
| 1 | Sanitizar TODOS los innerHTML con `esc()` | `core.js`, `telemedicine.js` | 2 días |
| 2 | Verificar firma webhook MercadoPago | `mercadopago.mts` | 1 día |
| 3 | REVOCAR permisos excesivos (GRANT ALL anon) | Nueva migración SQL | 1 día |
| 4 | Hashear tokens de sesión en DB | `lib/auth.mts`, migración | 2 días |
| 5 | Implementar CSP headers | `netlify.toml` o middleware | 1 día |
| 6 | Rate limiting en DB (no en memoria) | Nuevo módulo | 2 días |
| 7 | Eliminar console.log de producción | Todos los JS | 1 día |
| 8 | Validar roomUrl en telemedicine iframe | `telemedicine.js` | 0.5 días |

### FASE 2 — Cumplimiento Legal Básico (Semanas 3-5)
| # | Tarea | Archivos | Esfuerzo |
|---|-------|----------|----------|
| 9 | Consentimiento informado persistente (DB) | `hdd-hce.js`, nuevo endpoint, migración | 3 días |
| 10 | Consentimiento previo telemedicina | `telemedicine.js`, nuevo modal | 2 días |
| 11 | Cifrado de datos sensibles (pgcrypto) | Migración + lib | 5 días |
| 12 | Definir RLS policies para tablas clínicas | Migración | 3 días |
| 13 | Versionado inmutable de evoluciones | `hdd-hce.mts`, migración | 3 días |
| 14 | Exportación PDF de Historia Clínica | Nuevo módulo | 3 días |

### FASE 3 — Firma Digital y Facturación (Semanas 6-10)
| # | Tarea | Archivos | Esfuerzo |
|---|-------|----------|----------|
| 15 | Integración firma digital (ENCODE/PKI) | Nuevo módulo, migración | 2 semanas |
| 16 | Facturación electrónica AFIP (WSFE) | Nuevo módulo | 2 semanas |
| 17 | Receta electrónica con firma | Nuevo módulo | 1 semana |
| 18 | Libro de psicotrópicos | Nuevo módulo | 1 semana |

### FASE 4 — Producción (Semanas 11-12)
| # | Tarea | Esfuerzo |
|---|-------|----------|
| 19 | Penetration testing profesional | 1 semana |
| 20 | Auditoría de compliance por abogado | 1 semana |
| 21 | Registro en REFEPS | Trámite administrativo |
| 22 | Certificación ante autoridad sanitaria | Trámite administrativo |

---

## INVENTARIO DE ARCHIVOS AUDITADOS

### Frontend JS (8.053 líneas)
| Archivo | Líneas | XSS Risk | escapeHtml |
|---------|--------|----------|------------|
| `js/core.js` | 946 | 🔴 ALTO | ❌ No tiene |
| `js/telemedicine.js` | 1.439 | 🔴 ALTO | ❌ No tiene |
| `js/hdd-hce.js` | 1.146 | 🟡 MEDIO | ✅ Usa `esc()` |
| `js/hdd-admin.js` | 2.499 | 🟡 MEDIO | ✅ Usa `escapeHtml()` |
| `js/hdd-portal.js` | 1.577 | 🟡 MEDIO | ✅ Usa `escapeHtml()` |
| `js/hdd-index.js` | 252 | 🟡 MEDIO | ✅ Usa `escapeHtml()` |
| `js/effects.js` | 194 | 🟢 BAJO | N/A |

### Backend Netlify Functions (26 archivos .mts)
| Archivo | Función | Auth | Rate Limit |
|---------|---------|------|------------|
| `professionals.mts` | Login/registro | ✅ bcrypt | ⚠️ En memoria |
| `mercadopago.mts` | Pagos | ✅ Session | ❌ Sin verificar webhook |
| `hdd-hce.mts` | Historia clínica | ✅ Session | ❌ Sin rate limit |
| `hdd-admin.mts` | Admin panel | ✅ Session+Role | ❌ Sin rate limit |
| `hdd-auth.mts` | Auth pacientes | ✅ bcrypt | ⚠️ En memoria |
| `telemedicine-session.mts` | Sesiones telemed | ✅ Session | ❌ Sin rate limit |
| `upload.mts` | Subida imágenes | ✅ Session | ❌ Sin rate limit |
| `daily-room.mts` | Salas video | ✅ Session | ❌ Sin rate limit |
| `consultations.mts` | Formulario contacto | ⚠️ Parcial | ⚠️ En memoria |

### Migraciones SQL (27 archivos)
- Tablas clínicas: 11 (HCE completo)
- Tablas de soporte: 15+ (juegos, actividades, recursos, pagos)
- Tablas de auditoría: 4
- RLS habilitado: 10+ tablas (sin políticas)
- Índices: 50+

---

## CONCLUSIÓN

El sistema tiene una **arquitectura sólida** y un **modelo de datos clínico completo** (HCE con 11 tablas, sistema de juegos terapéuticos, telemedicina). Sin embargo, presenta **deficiencias críticas de seguridad y cumplimiento normativo** que impiden su lanzamiento comercial.

**Los 3 bloqueantes principales para la venta son:**
1. **Seguridad:** XSS, webhook sin verificar, datos sin cifrar, permisos excesivos
2. **Legal:** Sin firma digital (Ley 25.506), sin consentimiento informado efectivo (Ley 27.553)
3. **Fiscal:** Sin facturación electrónica AFIP

**Estimación para production-ready:** 10-12 semanas de desarrollo dedicado.

---

*Auditoría realizada sobre el código fuente completo del repositorio `cautious-carnival`.*
*Metodología: Revisión estática de código (SAST manual), análisis de migraciones SQL, verificación de cumplimiento normativo argentino.*
