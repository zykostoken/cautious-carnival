# TELEMEDICINA - NO FUNCIONA EN CHROME

## SÍNTOMA:
- ✅ Funciona en Opera
- ❌ NO funciona en Chrome
- Modal no abre al hacer click

## POSIBLES CAUSAS:

### 1. CACHE DE CHROME
Chrome cachea agresivamente JS/CSS
**Solución:** Hard reload (Ctrl + Shift + R)

### 2. EXTENSIONES DE CHROME
Bloqueadores de ads/scripts pueden interferir
**Solución:** Probar en modo incógnito

### 3. CONSOLE ERRORS
Chrome puede tener errores específicos
**Solución:** Ver console.log

## DEBUGGING:

### Paso 1: Limpiar cache
```
Chrome → Settings → Privacy → Clear browsing data
Seleccionar: Cached images and files
```

### Paso 2: Incógnito
```
Ctrl + Shift + N
Ir a: https://clinicajoseingenieros.ar
```

### Paso 3: Console
```
F12 → Console
Click en Telemedicina
Ver logs de [openModal]
```

## LOGS ESPERADOS:
```
============================================
[openModal] ⭐ CALLED with id: telemedicina
[ensureModalContent] START
[ensureModalContent] Loading modal-content.js...
[ensureModalContent] ✅ Script loaded
[ensureModalContent] ✅ After setTimeout, window.modalContent: true
[openModal] Content for telemedicina : EXISTS
[openModal] ✅ Setting modal content...
[openModal] ✅ Modal opened!
============================================
```

## SI NO FUNCIONA:
Copiar TODO el console.log y pasarlo.
