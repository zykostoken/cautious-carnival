# 📧 INSTRUCCIONES PARA FIX SMTP

## Paso a Paso en Netlify UI

1. **Ir a Netlify Dashboard**
   - https://app.netlify.com/sites/joseingenieros/configuration/env

2. **Buscar la variable:** `ZOHO_SMTP_PASS`

3. **Actualizar el valor a:** la app password generada en Zoho
   (Sin espacios - obtener desde https://accounts.zoho.com/home#security/2fa/app-passwords)

4. **Scopes:**
   - Context: All
   - Scopes: All

5. **Guardar y redeploy**

## Verificación

Después del deploy, probar enviando un email desde:
- https://clinicajoseingenieros.ar/#contacto

El email debería llegar a:
- direccionmedica@clinicajoseingenieros.ar

## Si sigue fallando

Verificar en Netlify Functions logs:
- Site → Functions → hdd-games → View function logs
- Buscar errores de SMTP

## App Password Backup

La contraseña de aplicación de Zoho:
- Nombre: "jose ingenieros web"
- Valor: (obtener desde Zoho - NUNCA commitear en el repo)
- Generada en: https://accounts.zoho.com/home#security/2fa/app-passwords
