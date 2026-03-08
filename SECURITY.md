# Política de Seguridad — Plataforma Digital de Salud Mental

## Alcance

Esta política aplica a la plataforma web de la Clínica José Ingenieros, incluyendo:
- Portal de pacientes HDD (Hospital de Día)
- Panel de administración profesional
- Sistema de telemedicina (Daily.co + MercadoPago)
- Juegos terapéuticos con métricas cognitivas
- Historia Clínica Electrónica (HCE)

## Controles de seguridad implementados

### Autenticación
- Hashing PBKDF2-like: SHA-256 × 10.000 iteraciones + salt por entorno
- Rate limiting: 5 intentos / 15 minutos por identificador
- Tokens de sesión criptográficos (UUID v4 + timestamp)
- TTL granular: paciente 60min, profesional 2h inactividad, gaming 1h/día
- Verificación de email con código de 6 dígitos

### Autorización
- Roles: SUPER_ADMIN / LIMITED_ADMIN / PROFESSIONAL (via env vars)
- RLS (Row Level Security) habilitado en 100% de las tablas
- Tablas HCE: REVOKE ALL FROM anon/authenticated, solo service_role
- Funciones HCE con triggers de inmutabilidad y auditoría

### Protección de datos
- TLS 1.3 en tránsito (Netlify + Supabase)
- Consultas parametrizadas (anti SQL injection)
- Escape HTML en templates de email (anti XSS)
- CORS restrictivo con whitelist de orígenes
- Headers de seguridad: HSTS, X-Frame-Options DENY, X-Content-Type-Options
- Sin almacenamiento de datos de pago (PCI compliance)
- Secrets Scanner habilitado en build (Netlify)

### Cumplimiento normativo
- Ley 26.529 (Derechos del Paciente — Historia Clínica)
- Ley 25.326 (Protección de Datos Personales)
- Ley 26.657 (Salud Mental)

## Reportar una vulnerabilidad

Si descubre una vulnerabilidad de seguridad en esta plataforma:

1. **No** la divulgue públicamente
2. Contacte al titular: **Dr. Gonzalo J. Perez Cortizo**
3. Dominio: clinicajoseingenieros.ar
4. Tiempo de respuesta estimado: 48 horas hábiles

Se evaluará cada reporte y se comunicará la resolución o mitigación aplicada.

## Versiones soportadas

| Versión | Soportada |
|---------|-----------|
| Producción (main) | Sí |
| Branches de desarrollo | No |
