# AUDITORÍA INTEGRAL DE PRODUCCIÓN - Clínica José Ingenieros

**Fecha:** 10 de marzo de 2026
**Versión:** 1.0
**Objetivo:** Evaluar la preparación del sistema para lanzamiento comercial y venta
**Alcance:** Código, seguridad, Supabase, telemedicina, HCE, firma/sello, recetas, contabilidad, logging, buenas prácticas

---

## RESUMEN EJECUTIVO

| Área | Estado | Calificación |
|------|--------|-------------|
| Código y sintaxis | Sólido | 🟢 7/10 |
| Buenas prácticas | Aceptable con mejoras necesarias | 🟡 6/10 |
| Logging y auditoría | Bien implementado | 🟢 8/10 |
| Seguridad | Deficiencias críticas | 🔴 4/10 |
| Supabase / Base de datos | Parcialmente seguro | 🟡 5/10 |
| Telemedicina | Funcional pero incompleto legalmente | 🟡 6/10 |
| HCE (Historia Clínica) | Modelo robusto, falta firma digital | 🟡 6/10 |
| Firma y Sello Digital | NO CUMPLE requisitos legales | 🔴 2/10 |
| Recetas / Prescripciones | Parcial, sin firma digital | 🔴 3/10 |
| Contabilidad / Facturación | Solo pasarela de pago | 🔴 3/10 |

**Veredicto general:** El sistema tiene una arquitectura sólida y funcionalidades completas, pero **NO está listo para producción** sin resolver los hallazgos CRÍTICOS marcados abajo.

---

## 1. CÓDIGO, SINTAXIS Y BUENAS PRÁCTICAS

### 1.1 Stack tecnológico
- **Frontend:** HTML5 + Vanilla JS + CSS3 (sin frameworks)
- **Backend:** Netlify Functions (TypeScript .mts)
- **Base de datos:** Supabase PostgreSQL
- **Pagos:** Mercado Pago
- **Video:** Daily.co
- **Email:** Nodemailer + Zoho SMTP
- **Hosting:** Netlify

### 1.2 Hallazgos positivos ✓
- Código bien organizado en módulos serverless independientes
- Uso correcto de tagged template literals de `postgres` (previene SQL injection)
- Sistema de migraciones robusto con checksums y detección de drift
- Separación adecuada frontend/backend
- TypeScript en backend con tipado

### 1.3 Problemas detectados

| ID | Severidad | Archivo | Problema |
|----|-----------|---------|----------|
| COD-001 | MEDIA | `js/hdd-admin.js` | Archivo de 94 KB — excesivamente grande, difícil de mantener |
| COD-002 | MEDIA | `js/telemedicine.js` | 53 KB en un solo archivo, debería modularizarse |
| COD-003 | BAJA | `js/hdd-hce.js` | 50 KB monolítico |
| COD-004 | BAJA | Varios `.html` en `/games/` | Juegos de 116-167 KB inline (lawn-mower.html = 167 KB) |
| COD-005 | MEDIA | Frontend general | Sin bundler/minificación — CSS/JS sin optimizar para producción |
| COD-006 | BAJA | Frontend | Sin framework de componentes — dificulta mantenimiento a escala |
| COD-007 | MEDIA | Backend | Precios hardcodeados en `mercadopago.mts` en vez de tabla configurable |

### 1.4 Recomendaciones de código
1. **Modularizar** archivos JS grandes (>30 KB) en módulos ES6
2. **Implementar bundler** (Vite/esbuild) para minificación y tree-shaking
3. **Mover precios** a tabla de base de datos para gestión dinámica
4. **Extraer juegos** a componentes separados con build independiente

---

## 2. LOGGING Y AUDITORÍA

### 2.1 Estado: BIEN IMPLEMENTADO ✅

**Tabla:** `professional_audit_log`
**Archivo:** `netlify/functions/lib/audit.mts`

#### Acciones auditadas:
- `view_patient` — Acceso a ficha del paciente
- `update_patient` — Modificación de datos
- `add_patient` — Alta de paciente
- `discharge_patient` / `readmit_patient`
- `hce_*` — Todas las acciones de HCE (evoluciones, medicación, diagnósticos, signos vitales)
- `video_session` — Sesiones de telemedicina
- `reset_password` / `bulk_import` — Acciones administrativas
- `consultation_response` — Respuesta a consultas

#### Datos capturados por entrada:
```
professional_id, professional_email, action_type, resource_type,
patient_id, patient_name, details (JSONB),
duration_seconds, ip_address, user_agent, created_at
```

#### Vistas de cumplimiento:
- `v_professional_usage_summary` — Resumen por profesional
- `v_professional_patient_interactions` — Quién accedió a qué paciente

### 2.2 Problemas detectados

| ID | Severidad | Problema |
|----|-----------|----------|
| LOG-001 | MEDIA | Audit log es fire-and-forget (si falla, se pierde silenciosamente) |
| LOG-002 | ALTA | `GRANT SELECT, INSERT TO anon` en audit_log — usuarios anónimos pueden insertar entradas falsas |
| LOG-003 | MEDIA | Solo `console.error` en catch — no hay alerta si el logging falla |
| LOG-004 | BAJA | No hay rotación/archivado de logs antiguos |

### 2.3 Recomendaciones
1. **Revocar permisos anon** en `professional_audit_log` — solo `service_role`
2. **Implementar retry** o cola de mensajes para logs fallidos
3. **Agregar alertas** cuando el logging falle (notificación a admin)
4. **Implementar archivado** automático después de 2 años (mantener 10 años según Ley 26.529)

---

## 3. SEGURIDAD

### 3.1 Hallazgos positivos ✓
- HSTS habilitado (max-age 1 año, includeSubDomains, preload)
- X-Frame-Options: DENY (anti-clickjacking)
- X-Content-Type-Options: nosniff
- Password hashing: PBKDF2 con 10,000 iteraciones SHA-256 + salt
- Rate limiting: 5 intentos / 15 minutos en login
- Prevención de enumeración de cuentas ("Credenciales inválidas" genérico)
- CORS restringido a dominios aprobados
- RLS habilitado en tablas críticas
- SSL requerido en conexiones a BD

### 3.2 Hallazgos CRÍTICOS 🔴

| ID | Severidad | Archivo | Vulnerabilidad |
|----|-----------|---------|---------------|
| SEC-001 | **CRÍTICA** | `js/telemedicine.js`, `js/hdd-hce.js`, `js/core.js` | **XSS via innerHTML** — Se usa `.innerHTML` con template strings interpolados. Si `roomUrl` u otra variable es manipulada, permite inyección de scripts |
| SEC-002 | **CRÍTICA** | `hdd-auth.mts:342` | **Contraseña mínima de 6 caracteres** — Insuficiente para sistema médico. Debe ser ≥12 con complejidad |
| SEC-003 | **CRÍTICA** | Múltiples endpoints | **Rate limiting incompleto** — Solo cubre login y consultas. Falta en: cambio de contraseña, registro de profesionales, acceso a juegos, actualización de perfil |
| SEC-004 | **CRÍTICA** | `mercadopago.mts` | **Sin validación de firma webhook** — Mercado Pago envía webhooks sin verificar autenticidad. Un atacante puede falsificar pagos aprobados |
| SEC-005 | **CRÍTICA** | 6 archivos frontend | **Supabase anon key hardcodeada** en código cliente — Permite acceso directo REST API |
| SEC-006 | **CRÍTICA** | Migrations | **`GRANT ALL ON hdd_game_metrics TO anon`** — Datos biométricos accesibles por usuarios anónimos via Supabase REST |

### 3.3 Hallazgos ALTOS 🟠

| ID | Severidad | Archivo | Vulnerabilidad |
|----|-----------|---------|---------------|
| SEC-007 | ALTA | `js/core.js:620` | Emails de admin hardcodeados en código cliente |
| SEC-008 | ALTA | Múltiples archivos | Tokens de sesión en query params de URL (visibles en logs, historial, referers) |
| SEC-009 | ALTA | Todos los POST endpoints | Sin protección CSRF explícita |
| SEC-010 | ALTA | `lib/auth.mts` | PBKDF2 con SHA-256 — Debería usar Argon2id para hashing de contraseñas |
| SEC-011 | ALTA | Frontend games | `patient_id` tomado de localStorage — Permite spoofing de identidad del paciente |

### 3.4 Hallazgos MEDIOS 🟡

| ID | Severidad | Problema |
|----|-----------|---------|
| SEC-012 | MEDIA | localhost wildcard en CORS (permitido en desarrollo) |
| SEC-013 | MEDIA | Sin Content-Security-Policy (CSP) header |
| SEC-014 | MEDIA | Sin rate limiting en endpoints de telemedicina |
| SEC-015 | MEDIA | Validación de email básica (regex simple) |

### 3.5 Plan de remediación de seguridad

**Semana 1 (Bloqueantes):**
1. Reemplazar `innerHTML` por `textContent`/`createElement` o usar DOMPurify
2. Aumentar contraseña mínima a 12+ caracteres con complejidad
3. Extender rate limiting a todos los endpoints mutantes
4. Implementar validación de firma en webhook de Mercado Pago
5. Revocar `GRANT ALL TO anon` en tablas clínicas
6. Mover anon key de Supabase fuera del código cliente

**Semana 2-3:**
7. Migrar tokens de sesión de URL params a headers Authorization
8. Implementar CSRF tokens
9. Agregar Content-Security-Policy
10. Migrar hashing a Argon2id

---

## 4. SUPABASE / BASE DE DATOS

### 4.1 Configuración
- **Conexión:** `postgres` library con SSL requerido, pool de 10 conexiones
- **Migraciones:** 27 migraciones con checksums y validación de drift
- **RLS:** Habilitado en tablas críticas

### 4.2 Hallazgos positivos ✓
- Prepared statements deshabilitados (compatibilidad con transaction pooler)
- Idle timeout de 20 segundos
- Tabla `schema_migrations` para tracking de migraciones
- Views convertidas de SECURITY DEFINER → SECURITY INVOKER (migración 019)
- `search_path` configurado en 11 funciones (previene schema injection)

### 4.3 Problemas detectados

| ID | Severidad | Problema |
|----|-----------|---------|
| DB-001 | **CRÍTICA** | `GRANT ALL ON hdd_game_metrics TO anon` — Datos biométricos expuestos |
| DB-002 | **CRÍTICA** | Datos médicos en texto plano — Sin cifrado at-rest para DNI, diagnósticos, vitales |
| DB-003 | ALTA | `CASCADE DELETE` en `hdd_patients` borra todas las historias clínicas — Viola retención de 10 años (Ley 26.529 Art. 18) |
| DB-004 | ALTA | `GRANT INSERT TO anon` en `professional_audit_log` — Permite insertar entradas falsas |
| DB-005 | MEDIA | Sin pseudonimización de datos sensibles |
| DB-006 | MEDIA | Sin backup verificable documentado |
| DB-007 | BAJA | Sin particionamiento de tablas para escalabilidad futura |

### 4.4 Recomendaciones
1. **Revocar permisos anon** en todas las tablas clínicas
2. **Implementar cifrado at-rest** con `pgcrypto` para campos sensibles (DNI, diagnósticos)
3. **Cambiar CASCADE a RESTRICT** en foreign keys de datos clínicos
4. **Implementar soft-delete** (campo `deleted_at`) en vez de DELETE físico
5. **Documentar y verificar** plan de backups con Supabase

---

## 5. TELEMEDICINA

### 5.1 Estado: FUNCIONAL ✅ pero INCOMPLETO LEGALMENTE ⚠️

#### Flujo implementado:
```
Registro → Solicitud de consulta → Pago (Mercado Pago) →
Creación de sala Daily.co → Notificación por email →
Consulta por video → Expiración automática (60 min)
```

#### Planes de precios:
| Plan | Precio | Duración | Prioridad |
|------|--------|----------|-----------|
| Con espera | $50,000 ARS | 15 min | Cola normal |
| Sin cola | $70,000 ARS | 15 min | Prioridad |
| Premium VIP | $120,000 ARS | 15 min | Máxima |

#### Funcionalidades ✓:
- Video conferencia via Daily.co con tokens separados (profesional/paciente)
- Cola de llamadas con priorización
- Expiración automática de salas (65 min)
- Reembolso automático si no se atiende en 60 min
- Notificaciones por email al paciente y a dirección médica
- Límite de 4 participantes por sala

### 5.2 Hallazgos CRÍTICOS para Ley 27.553

| ID | Severidad | Requisito legal | Estado |
|----|-----------|----------------|--------|
| TEL-001 | **CRÍTICA** | **Consentimiento informado previo** (Art. 2) | ❌ NO IMPLEMENTADO — Debe mostrarse modal de aceptación antes de cada consulta |
| TEL-002 | **CRÍTICA** | **Registro como acto clínico en HCE** (Art. 2 + Ley 26.529 Art. 15) | ❌ NO IMPLEMENTADO — La teleconsulta no genera evolución en HCE |
| TEL-003 | **CRÍTICA** | **Firma digital en prescripciones** emitidas por telemedicina (Art. 3) | ❌ NO IMPLEMENTADO |
| TEL-004 | ALTA | **Validación de firma en webhooks** de Mercado Pago | ❌ NO IMPLEMENTADO — Riesgo de fraude |
| TEL-005 | ALTA | **Verificación de monto** en webhook (podría subdeclararse el pago) | ❌ NO IMPLEMENTADO |
| TEL-006 | MEDIA | Grabación de consultas (opcional pero recomendado) | ❌ NO IMPLEMENTADO |

### 5.3 Recomendaciones prioritarias
1. **Implementar modal de consentimiento informado** antes de iniciar cada consulta
2. **Crear evolución automática en HCE** al finalizar teleconsulta (tipo: "teleconsulta")
3. **Validar firma HMAC** de webhooks de Mercado Pago
4. **Verificar monto del pago** contra precio del plan antes de aprobar

---

## 6. HCE (HISTORIA CLÍNICA ELECTRÓNICA)

### 6.1 Estado: MODELO ROBUSTO ✅ con GAPS LEGALES ⚠️

#### Modelo de datos implementado:
| Tabla | Contenido |
|-------|-----------|
| `hdd_patients` (extendida) | Demografía, contacto, obra social, número de HC |
| `hce_antecedentes` | Personales, familiares, quirúrgicos, alérgicos, hábitos, ginecológicos |
| `hce_diagnosticos` | CIE-10/DSM-5, tipo (principal/secundario/diferencial), estado |
| `hce_evoluciones` | Evoluciones, interconsultas, epicrisis, ingresos, egresos |
| `hce_medicacion` | Drogas, dosis, frecuencia, vía, prescriptor |
| `hce_estudios` | Laboratorio, imágenes, informes externos |
| `hce_signos_vitales` | TA, FC, FR, temp, saturación, glucemia, peso, talla |

#### Funcionalidades implementadas ✓:
- CRUD completo para todas las tablas
- Evoluciones confidenciales (solo visibles para autor + dirección médica)
- Validación de rangos clínicos en signos vitales
- Solo el autor puede editar su evolución (ownership check)
- Tracking de ediciones (`editado=true`, `editado_at`)
- Firma inmutable una vez comprometida (commit_draft)
- Auditoría completa de todas las acciones HCE
- 50 evoluciones recientes, 20 últimos signos vitales/estudios

### 6.2 Problemas detectados

| ID | Severidad | Problema |
|----|-----------|---------|
| HCE-001 | **CRÍTICA** | **Firma digital NO CRIPTOGRÁFICA** — Solo snapshots de texto (nombre, matrícula, especialidad). No cumple Ley 25.506 |
| HCE-002 | **CRÍTICA** | **Sin sello institucional** — No hay timestamp certificado ni sello del establecimiento |
| HCE-003 | **CRÍTICA** | **Sin cifrado at-rest** de datos clínicos — Diagnósticos, evoluciones, medicación en texto plano |
| HCE-004 | ALTA | **CASCADE DELETE** borra toda la HC al eliminar paciente — Viola retención de 10 años |
| HCE-005 | ALTA | **Sin exportación de HC** — Paciente tiene derecho a copia (Ley 26.529 Art. 14) |
| HCE-006 | ALTA | **Sin integración HL7 FHIR** — Requerido para interoperabilidad (Res. 1959/2024) |
| HCE-007 | MEDIA | Sin códigos SNOMED-CT completos (usa CIE-10, aceptable pero limitado) |
| HCE-008 | MEDIA | Sin derechos ARCO (acceso, rectificación, cancelación, oposición) per Ley 25.326 |

### 6.3 Recomendaciones
1. **Implementar firma digital PKI** (Ley 25.506) — integrar con prestador certificado (ej: Encode, AC-RAIZ)
2. **Agregar sello institucional** con timestamp certificado
3. **Implementar exportación PDF** de historia clínica completa
4. **Cambiar CASCADE a RESTRICT** + implementar soft-delete
5. **Agregar endpoint FHIR** básico para interoperabilidad futura
6. **Implementar cifrado** de campos sensibles con pgcrypto

---

## 7. FIRMA Y SELLO DIGITAL

### 7.1 Estado: NO CUMPLE REQUISITOS LEGALES 🔴

#### Implementación actual:
```sql
-- Lo que se guarda (texto plano, NO es firma digital):
firma_nombre = 'Dr. Juan Pérez'
firma_especialidad = 'Psiquiatría'
firma_matricula = 'MP 12345'
firma_role = 'psiquiatra'
```

Esto es un **snapshot informativo**, NO una firma digital según la ley argentina.

### 7.2 Requisitos legales NO cumplidos

| Ley | Requisito | Estado |
|-----|-----------|--------|
| **Ley 25.506** (Firma Digital) | Certificado digital calificado via PKI | ❌ No implementado |
| **Ley 25.506** | Infraestructura de clave pública | ❌ No implementado |
| **Ley 25.506** | Integridad y no repudio del documento | ❌ No implementado |
| **Ley 27.553** Art. 3 | Firma digital para prescripciones telemédicas | ❌ No implementado |
| **Res. 1840/2018** | Sello institucional con timestamp | ❌ No implementado |
| **HL7 Argentina** | Firma CDA/FHIR en documentos clínicos | ❌ No implementado |

### 7.3 Qué se necesita implementar

#### Firma Digital (mínimo viable):
1. **Integrar prestador de firma digital** certificado por AC-RAIZ Argentina
   - Opciones: Encode S.A., AFIP (Token Fiscal), SeCyT
2. **Implementar flujo de firma:**
   ```
   Profesional escribe evolución → commit_draft →
   Genera hash SHA-256 del contenido →
   Firma con certificado digital del profesional →
   Almacena firma + certificado + timestamp
   ```
3. **Verificación de firma** en lectura de documentos

#### Sello Institucional:
1. **Obtener certificado institucional** de la clínica
2. **Implementar sello temporal** (TSA - Timestamp Authority)
3. **Almacenar** sello junto con cada documento firmado

### 7.4 Alternativa interim (firma electrónica simple):
Si no se puede implementar PKI completa inmediatamente:
- Implementar **firma electrónica** (no digital) con:
  - OTP por email/SMS al profesional
  - Hash del contenido + timestamp
  - Log de IP y dispositivo
- **NOTA:** Esto tiene menor valor probatorio que firma digital PKI pero es mejor que snapshot de texto

---

## 8. VALIDACIÓN DE RECETAS / PRESCRIPCIONES

### 8.1 Estado: PARCIALMENTE IMPLEMENTADO ⚠️

#### Modelo actual:

**Recetas de servicios** (`doctor_prescriptions`):
```sql
patient_id, prescribed_by, service_type ('gaming', 'terapia_grupal'),
diagnosis, indication, frequency, max_sessions,
valid_from, valid_until, status (active/completed/cancelled/expired)
```

**Medicación** (`hce_medicacion`):
```sql
patient_id, droga, nombre_comercial, dosis, frecuencia, via,
fecha_inicio, fecha_fin, estado (activo/suspendido/finalizado),
prescripto_por, motivo_suspension
```

### 8.2 Problemas CRÍTICOS

| ID | Severidad | Problema |
|----|-----------|---------|
| RX-001 | **CRÍTICA** | **Sin firma digital** en recetas — No cumple Ley 25.506 ni Ley 27.553 Art. 3 |
| RX-002 | **CRÍTICA** | **Sin identificador único de receta** — Necesario para verificación en farmacia |
| RX-003 | **CRÍTICA** | **Sin tracking de sustancias controladas** — Psicotrópicos (Ley 17.818 y 19.303) requieren triplicado |
| RX-004 | ALTA | **Sin vencimiento automático** de recetas — Las recetas no deberían ser perpetuas |
| RX-005 | ALTA | **Sin integración con ANMAT/Vademecum** — Sin validación de drogas/dosis |
| RX-006 | ALTA | **Sin generación de PDF** de receta para impresión o envío digital |
| RX-007 | MEDIA | Sin interacción medicamentosa — No se validan contraindicaciones entre drogas |
| RX-008 | MEDIA | Sin alertas de dosis máxima — No se validan límites terapéuticos |

### 8.3 Recomendaciones

#### Para lanzamiento mínimo:
1. **Generar PDF de receta** con: datos del paciente, droga, dosis, frecuencia, fecha, firma digital, sello, nro. de receta
2. **Implementar numeración secuencial** de recetas (o UUID con código corto)
3. **Agregar vencimiento automático** (30 días para medicación común, 10 días para psicotrópicos)
4. **Implementar categorización** de sustancias (venta libre, bajo receta, psicotrópicos)

#### Para versión completa:
5. Integrar base de datos de medicamentos (ANMAT/Kairos/Alfabeta)
6. Validar interacciones medicamentosas
7. Implementar receta electrónica según estándares FHIR

---

## 9. CONTABILIDAD Y FACTURACIÓN

### 9.1 Estado: SOLO PASARELA DE PAGO 🔴

#### Lo que está implementado:
- **Mercado Pago** integrado con preference creation + webhooks
- **Tabla `mp_payments`**: id, user_id, amount, status, payment_method, paid_at
- **Reembolsos automáticos** si sesión no atendida >60 min
- **Referencia externa**: `TELE-{userId}-{planId}-{timestamp}`

#### Lo que NO está implementado:

| ID | Severidad | Faltante |
|----|-----------|---------|
| CONT-001 | **CRÍTICA** | **Sin generación de facturas** — Obligatorio por ley argentina (AFIP) |
| CONT-002 | **CRÍTICA** | **Sin integración AFIP** — No se emite factura electrónica |
| CONT-003 | **CRÍTICA** | **Sin manejo de IVA** — Servicios médicos tienen IVA exento (Art. 7 Ley IVA) pero debe declararse |
| CONT-004 | ALTA | **Sin libro diario contable** — No hay registro de asientos contables |
| CONT-005 | ALTA | **Sin conciliación bancaria** — Pagos MP no se cruzan con extractos |
| CONT-006 | ALTA | **Sin reportes financieros** — No hay balance, estado de resultados |
| CONT-007 | MEDIA | **Sin gestión de obras sociales** — No se generan prestaciones para facturar a OS |
| CONT-008 | MEDIA | **Sin módulo de coseguros** — Pacientes de OS pagan diferencia |
| CONT-009 | BAJA | Precios hardcodeados en código en vez de tabla configurable |

### 9.2 Recomendaciones

#### Mínimo viable para lanzamiento:
1. **Integrar facturación electrónica AFIP** (Web Service WSFE/WSFEX)
   - Factura C para consumidor final
   - Factura B para monotributistas/responsables inscriptos
2. **Generar recibo/comprobante** por cada pago procesado
3. **Mover precios a tabla** `service_plans` editable por admin

#### Para versión completa:
4. Módulo de facturación a obras sociales (formato SIS)
5. Reportes financieros básicos (ingresos diarios/mensuales)
6. Conciliación automática con Mercado Pago
7. Gestión de coseguros y copagos

---

## 10. CUMPLIMIENTO NORMATIVO ARGENTINO

### Matriz de cumplimiento

| Norma | Requisito | Estado | Prioridad |
|-------|-----------|--------|-----------|
| **Ley 26.529** (Derechos del Paciente) | HCE con consentimiento | ⚠️ Parcial — Falta consentimiento informado | CRÍTICA |
| **Ley 26.529 Art. 14** | Derecho a copia de HC | ❌ Sin exportación | ALTA |
| **Ley 26.529 Art. 18** | Retención 10 años | ⚠️ Riesgo CASCADE DELETE | ALTA |
| **Ley 25.506** (Firma Digital) | PKI para documentos clínicos | ❌ No implementado | CRÍTICA |
| **Ley 25.326** (Datos Personales) | Cifrado + derechos ARCO | ❌ Sin cifrado at-rest | CRÍTICA |
| **Ley 25.326** | Registro en AAIP | ❌ No registrado | ALTA |
| **Ley 26.657** (Salud Mental) | Confidencialidad reforzada | ⚠️ Parcial — H-060 expone biométricos | ALTA |
| **Ley 27.553** (Telemedicina) | Consentimiento + firma | ❌ Ambos faltantes | CRÍTICA |
| **Ley 27.553 Art. 3** | Receta digital firmada | ❌ No implementado | CRÍTICA |
| **Res. 1840/2018** (HCE) | Estándares, cifrado, audit | ⚠️ Parcial — Audit ✓, cifrado ❌ | ALTA |
| **Res. 1959/2024** (ReNaPDiS) | Registro en ministerio | ❌ No registrado | MEDIA |
| **Res. 1959/2024** | HL7 FHIR | ❌ No implementado | MEDIA |
| **AFIP** | Facturación electrónica | ❌ No implementado | CRÍTICA |
| **Ley 17.818/19.303** | Control de psicotrópicos | ❌ No implementado | ALTA |

---

## 11. PLAN DE ACCIÓN PARA LANZAMIENTO

### Fase 1: BLOQUEANTES (Semanas 1-2) — Sin esto NO se puede lanzar

| # | Acción | Archivos afectados | Esfuerzo |
|---|--------|-------------------|----------|
| 1 | Corregir XSS (innerHTML → textContent/DOMPurify) | `js/telemedicine.js`, `js/hdd-hce.js`, `js/core.js` | 2-3 días |
| 2 | Contraseña mínima 12 chars + complejidad | `hdd-auth.mts` | 1 día |
| 3 | Rate limiting en todos los endpoints | `lib/auth.mts`, endpoints varios | 2 días |
| 4 | Revocar permisos anon en tablas clínicas | Nueva migración SQL | 1 día |
| 5 | Validar firma webhook Mercado Pago | `mercadopago.mts` | 1 día |
| 6 | Implementar consentimiento informado (telemedicina) | `js/telemedicine.js`, nuevo endpoint | 2 días |
| 7 | Mover Supabase anon key fuera del cliente | 6 archivos frontend | 1 día |

### Fase 2: ALTA PRIORIDAD (Semanas 3-4) — Necesario para cumplimiento legal

| # | Acción | Esfuerzo |
|---|--------|----------|
| 8 | Implementar firma electrónica (OTP + hash + timestamp) | 1 semana |
| 9 | Cifrado at-rest con pgcrypto para campos sensibles | 3-4 días |
| 10 | Exportación PDF de historia clínica | 3 días |
| 11 | Generación de receta en PDF con numeración | 3 días |
| 12 | Integrar teleconsulta como evolución en HCE | 2 días |
| 13 | Cambiar CASCADE → RESTRICT + soft-delete | 2 días |
| 14 | Tokens de sesión en headers (no URL params) | 2-3 días |

### Fase 3: PRE-LANZAMIENTO (Semanas 5-8) — Para venta profesional

| # | Acción | Esfuerzo |
|---|--------|----------|
| 15 | Facturación electrónica AFIP (WSFE) | 2 semanas |
| 16 | Firma digital PKI (integrar prestador certificado) | 2 semanas |
| 17 | Sello institucional con TSA | 1 semana |
| 18 | Tracking de psicotrópicos (triplicado) | 1 semana |
| 19 | Migrar hashing a Argon2id | 2-3 días |
| 20 | Registro en AAIP (datos personales) | Trámite |
| 21 | Registro en ReNaPDiS (ministerio) | Trámite |

### Fase 4: POST-LANZAMIENTO (Meses 3-6) — Mejora continua

| # | Acción |
|---|--------|
| 22 | HL7 FHIR endpoint para interoperabilidad |
| 23 | Integración vademecum ANMAT |
| 24 | Validación interacciones medicamentosas |
| 25 | Facturación a obras sociales (SIS) |
| 26 | Reportes financieros |
| 27 | Bundler + optimización frontend |
| 28 | Tests automatizados (unit + integration) |

---

## 12. RESUMEN FINAL

### Fortalezas del sistema:
1. **Arquitectura serverless** escalable y económica
2. **Modelo HCE completo** con evoluciones, medicación, diagnósticos, signos vitales
3. **Telemedicina funcional** con video, pagos y cola de espera
4. **Auditoría profesional** completa con trazabilidad
5. **Juegos terapéuticos** innovadores con biometría
6. **Confidencialidad** de evoluciones implementada
7. **RLS** en tablas principales

### Riesgos bloqueantes para la venta:
1. 🔴 **Sin firma digital legal** — El sistema no tiene validez jurídica para documentos clínicos
2. 🔴 **Vulnerabilidades XSS** — Riesgo de compromiso de datos de pacientes
3. 🔴 **Datos médicos sin cifrar** — No cumple Ley 25.326 ni Res. 1840
4. 🔴 **Sin facturación** — No puede operar comercialmente sin factura electrónica
5. 🔴 **Sin consentimiento informado** — Requisito obligatorio Ley 27.553
6. 🔴 **Permisos anon en tablas clínicas** — Datos biométricos expuestos

### Conclusión:
El sistema tiene una **base técnica sólida** y funcionalidades **muy completas para una clínica psiquiátrica**. Los juegos terapéuticos con biometría y la integración HCE son **diferenciadores competitivos valiosos**. Sin embargo, requiere **6-8 semanas de trabajo enfocado** en seguridad, firma digital y cumplimiento normativo antes de estar listo para producción y venta.

---

*Documento generado el 10 de marzo de 2026*
*Auditoría realizada sobre el repositorio cautious-carnival*
