# 🔐 VARIABLES DE ENTORNO NECESARIAS

**URL Configuración Netlify:** https://app.netlify.com/sites/joseingenieros/configuration/env

---

## ✅ CONFIGURADAS (YA ESTÁN):

### 1. ZOHO SMTP (Email)
```
ZOHO_SMTP_USER = direccionmedica@clinicajoseingenieros.ar
ZOHO_SMTP_PASS = Npemb5ZNuFA8
ZOHO_SMTP_HOST = smtp.zoho.com
ZOHO_SMTP_PORT = 465
```
**Estado:** ✅ Configuradas
**Función:** Envío de notificaciones por email

---

## ❌ FALTANTES (NECESARIAS):

### 2. MERCADOPAGO (Pagos)
```
MP_ACCESS_TOKEN = (TU TOKEN DE MERCADOPAGO)
```
**Estado:** ❌ NO CONFIGURADA
**Función:** Procesar pagos de telemedicina
**Cómo obtener:**
1. Ir a: https://www.mercadopago.com.ar/developers/panel
2. Login con tu cuenta MercadoPago
3. Crear aplicación o usar una existente
4. Copiar "Access Token" (Production o Test)

**Importante:**
- **Test token:** Empieza con `TEST-`
- **Production token:** Empieza con `APP_USR-`

### 3. SUPABASE (Base de Datos)
```
SUPABASE_URL = https://yqpqfzvgcmvxvqzvtajx.supabase.co
SUPABASE_ANON_KEY = (TU ANON KEY)
SUPABASE_SERVICE_KEY = (TU SERVICE KEY)
```
**Estado:** ❌ NO CONFIGURADAS (probablemente)
**Función:** Base de datos para HDD, juegos, pacientes
**Cómo obtener:**
1. Ir a: https://supabase.com/dashboard/project/yqpqfzvgcmvxvqzvtajx/settings/api
2. Copiar:
   - Project URL → `SUPABASE_URL`
   - anon/public key → `SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_KEY`

---

## 🔧 CÓMO CONFIGURAR EN NETLIFY:

1. **Ir a:** https://app.netlify.com/sites/joseingenieros/configuration/env

2. **Click en:** "Add a variable" o "Add"

3. **Agregar cada variable:**
   - Key: `MP_ACCESS_TOKEN`
   - Value: (tu token)
   - Scopes: Marcar todos (Production, Deploy Previews, Branch deploys)
   - Click "Create variable"

4. **Repetir** para cada variable faltante

5. **Trigger redeploy:**
   - Ir a: https://app.netlify.com/sites/joseingenieros/deploys
   - Click "Trigger deploy" → "Deploy site"

---

## 🧪 VERIFICAR SI ESTÁN CONFIGURADAS:

Después de configurar, probá:

### MercadoPago:
```bash
curl https://clinicajoseingenieros.ar/.netlify/functions/mercadopago
```
Debería devolver:
```json
{"configured": true, "message": "APP_USR-..."}
```

Si devuelve `"configured": false`, falta el token.

### Supabase:
```bash
curl https://clinicajoseingenieros.ar/.netlify/functions/hdd-auth
```
Si funciona, está OK.

---

## 📋 CHECKLIST:

- [x] ZOHO_SMTP_USER
- [x] ZOHO_SMTP_PASS
- [x] ZOHO_SMTP_HOST
- [x] ZOHO_SMTP_PORT
- [ ] MP_ACCESS_TOKEN
- [ ] SUPABASE_URL
- [ ] SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_KEY

---

## ⚠️ IMPORTANTE:

**SIN estas variables:**
- ❌ Telemedicina NO podrá procesar pagos
- ❌ HDD NO podrá guardar datos de pacientes
- ❌ Juegos NO podrán guardar métricas

**CON estas variables:**
- ✅ Telemedicina funcional con pagos
- ✅ HDD guarda todo en base de datos
- ✅ Sistema completo operativo
