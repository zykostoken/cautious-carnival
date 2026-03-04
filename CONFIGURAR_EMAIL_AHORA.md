# 📧 CONFIGURAR EMAIL NOTIFICATIONS - URGENTE

## 🎯 Problema
Los emails a `direccionmedica@clinicajoseingenieros.ar` NO están llegando porque falta la configuración de SMTP.

## ✅ Solución - 3 Pasos

### PASO 1: Ir a Netlify Environment Variables

**URL directa:** https://app.netlify.com/sites/joseingenieros/configuration/env

O navegar:
1. https://app.netlify.com/
2. Sites → joseingenieros (o "cautious-carnival")
3. Site configuration → Environment variables

---

### PASO 2: Agregar/Editar estas 3 variables

#### Variable 1: `ZOHO_SMTP_USER`
```
Key: ZOHO_SMTP_USER
Value: direccionmedica@clinicajoseingenieros.ar
Scopes: All scopes
Deploy contexts: All
```

#### Variable 2: `ZOHO_SMTP_PASS`
```
Key: ZOHO_SMTP_PASS
Value: (obtener de Zoho App Passwords - NO commitear)
Scopes: All scopes
Deploy contexts: All
```

#### Variable 3: `ZOHO_SMTP_HOST` (opcional)
```
Key: ZOHO_SMTP_HOST
Value: smtp.zoho.com
Scopes: All scopes  
Deploy contexts: All
```

---

### PASO 3: Trigger Redeploy

Después de guardar las variables:

1. En Netlify → Deploys
2. Click "Trigger deploy" → "Deploy site"
3. Esperar 1-2 minutos

---

## 🧪 Verificar que Funciona

### Opción A: Desde el Portal HDD

1. Ir a: https://clinicajoseingenieros.ar/hdd/portal
2. Completar un juego
3. Verificar que llegue email a `direccionmedica@clinicajoseingenieros.ar`

### Opción B: Test directo con curl

```bash
curl -X POST https://clinicajoseingenieros.ar/.netlify/functions/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "type": "test",
    "message": "Test de email desde configuración",
    "recipient": "direccionmedica@clinicajoseingenieros.ar"
  }'
```

---

## 📋 Checklist

- [ ] Variable `ZOHO_SMTP_USER` configurada
- [ ] Variable `ZOHO_SMTP_PASS` configurada  
- [ ] Variable `ZOHO_SMTP_HOST` configurada (opcional)
- [ ] Trigger redeploy ejecutado
- [ ] Deploy completado (verde en Netlify)
- [ ] Email de prueba recibido en direccionmedica@clinicajoseingenieros.ar

---

## 🔐 Credenciales de Zoho Mail

**Email:** direccionmedica@clinicajoseingenieros.ar  
**App Password:** (ver Zoho App Passwords)
**SMTP Host:** smtp.zoho.com  
**SMTP Port:** 465 (SSL) o 587 (TLS)

---

## ⚠️ Si NO Funciona

### Error: "SMTP not configured"
→ Las variables no están bien guardadas. Verificar que:
- Los nombres sean EXACTOS (case-sensitive)
- No haya espacios extras
- Se aplicó el redeploy

### Error: "Authentication failed"  
→ La contraseña de app está mal. Verificar:
- Obtener la app password desde: https://accounts.zoho.com/home#security/app-passwords
- Es una "App Password" de Zoho, no la contraseña normal
- Si expiró, generar nueva desde el link de arriba

### Error: "Connection timeout"
→ Firewall o problemas de red. Verificar:
- Netlify puede conectar a smtp.zoho.com:465
- El host es `smtp.zoho.com` (sin http://)

---

## 🎉 Email de Prueba Funcionando

Si todo está OK, deberías recibir emails con:

**Subject:** `[Clínica José Ingenieros] Nueva sesión de juego completada`

**From:** `Clínica José Ingenieros <direccionmedica@clinicajoseingenieros.ar>`

**Body:**
```
Paciente: [nombre]
Juego: [nombre del juego]
Fecha: [timestamp]
Métricas: [datos del juego]
```

---

**¿Listo para configurar? Ve a Netlify ahora:** 
👉 https://app.netlify.com/sites/joseingenieros/configuration/env
