# 📧 INSTRUCCIONES PARA FIX SMTP

## Paso a Paso en Netlify UI

1. **Ir a Netlify Dashboard**
   - https://app.netlify.com/sites/joseingenieros/configuration/env

2. **Buscar la variable:** `ZOHO_SMTP_PASS`

3. **Actualizar el valor a:**
   ```
   Npemb5ZNuFA8
   ```
   (Sin espacios - esta es la app password de Zoho Mail)

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

La contraseña de aplicación de Zoho es:
- Nombre: "jose ingenieros web"
- Valor: Npemb5ZNuFA8
- Generada en: https://accounts.zoho.com/home#security/2fa/app-passwords
