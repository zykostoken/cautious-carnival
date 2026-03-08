# 🚀 INSTRUCCIONES DE DEPLOYMENT - EJECUTAR DESDE TU MÁQUINA

## ✅ TODO LO QUE ESTÁ LISTO

El branch `mega-fix-hdd-complete` tiene **5 commits** con todo implementado:

1. **Commit 1:** Modales 3 fases + SQL migrations (60%)
2. **Commit 2:** Backend soporte 3 fases (70%)
3. **Commit 3:** Integración a juegos + docs tracking (80%)
4. **Commit 4:** Dashboard + SMTP instructions (95%)
5. **Commit 5:** README completo (100%)

---

## 📋 PASOS PARA DEPLOYMENT

### PASO 1: Sincronizar con este branch

Desde tu WSL/Ubuntu:

```bash
cd ~/zykostoken/cautious-carnival  # O donde esté tu repo

# Fetch el branch desde el container
git fetch origin mega-fix-hdd-complete

# Checkout al branch
git checkout mega-fix-hdd-complete

# Verificar commits
git log --oneline -5
```

Deberías ver 5 commits recientes empezando con:
- "docs: Complete README..."
- "feat: Phase 4 - Dashboard..."
- "feat: Phase 3 - Game integration..."
- "feat: Phase 2 - Backend support..."
- "feat: Phase 1 - 3-phase mood modals..."

### PASO 2: Push a GitHub

```bash
git push origin mega-fix-hdd-complete
```

### PASO 3: Crear Pull Request

1. Ir a: https://github.com/zykostoken/cautious-carnival
2. Verás banner "mega-fix-hdd-complete had recent pushes"
3. Click "Compare & pull request"
4. Título: **"feat: 3-phase mood tracking system + individual patient metrics"**
5. Descripción: (copiar de abajo)

```markdown
## 🎯 Mega Fix HDD - Sistema Completo

### ✅ Implementado

1. **Sistema de Modales 3 Fases**
   - Pre-game: Chat conversacional
   - Post-game: Intensidad (5 círculos) → Color (12 opciones)
   - Sin referencias ni nombres - 100% proyectivo

2. **Paleta de 60 Colores**
   - 12 familias × 5 intensidades
   - Tags psicológicos clínicos

3. **Base de Datos Supabase**
   - Tabla `hdd_color_psychology` (60 colores)
   - Tabla `hdd_game_sessions` (tracking individual)
   - Cooldown system (12 horas)

4. **Backend API**
   - Soporte phase: 'pre'/'post'
   - Backward compatible

5. **Dashboard de Métricas**
   - Por paciente individual (NO población)
   - Charts + exportación CSV

6. **Integración Completa**
   - 3 juegos actualizados
   - Pill Organizer en portal

### 📋 Testing Needed

- [ ] Pre-game chat funciona
- [ ] Post-game selectors funcionan
- [ ] Dashboard muestra datos por paciente
- [ ] Email notifications (después de SMTP fix)

### ⚠️ Acciones Post-Merge

1. Ejecutar SQL migrations en Supabase
2. Actualizar `ZOHO_SMTP_PASS` en Netlify

Ver: `README_MEGA_FIX.md` para detalles completos
```

6. **NO MERGEAR TODAVÍA** - Solo crear el PR

### PASO 4: Ejecutar SQL Migrations

Conectar a Supabase:

```bash
# Opción 1: Desde SQL Editor en Supabase UI
# https://supabase.com/dashboard/project/yqpqfzvgcmvxvqzvtajx/sql/new

# Copiar y ejecutar contenido de:
# - sql/01_color_psychology.sql
# - sql/02_game_sessions.sql

# Opción 2: Desde psql (si tenés instalado)
export SUPABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require"

psql $SUPABASE_URL -f sql/01_color_psychology.sql
psql $SUPABASE_URL -f sql/02_game_sessions.sql
```

Verificar:
```sql
SELECT COUNT(*) FROM hdd_color_psychology;  -- Debe ser 60
SELECT * FROM hdd_game_sessions LIMIT 1;   -- Verifica que existe
```

### PASO 5: Fix SMTP en Netlify

1. Ir a: https://app.netlify.com/sites/joseingenieros/configuration/env
2. Buscar variable: `ZOHO_SMTP_PASS`
3. Editar y cambiar valor a: `[SET_IN_NETLIFY_ENV_VARS]`
4. Save
5. Trigger redeploy

### PASO 6: Testing en Deploy Preview

Netlify creará automáticamente un deploy preview del PR.

URL será tipo: `https://deploy-preview-XX--joseingenieros.netlify.app`

Probar:
1. Cargar un juego (ej: Pill Organizer)
2. Ver modal de chat pre-game
3. Jugar
4. Ver selector de intensidad post-game
5. Ver selector de color
6. Ir a Dashboard de métricas
7. Seleccionar un paciente
8. Verificar gráficos

### PASO 7: Merge & Deploy

Si todo funciona:
1. Aprobar PR en GitHub
2. Merge to main
3. Netlify auto-deploy a producción
4. Verificar en https://clinicajoseingenieros.ar

---

## 📊 RESUMEN DE CAMBIOS

### Archivos Nuevos (9)
- `games/shared/mood-modals.html`
- `games/shared/mood-modals.js`
- `sql/01_color_psychology.sql`
- `sql/02_game_sessions.sql`
- `hdd/portal/metrics-dashboard.html`
- `PATIENT_TRACKING_SYSTEM.md`
- `SMTP_FIX_INSTRUCTIONS.md`
- `README_MEGA_FIX.md`
- `DEPLOYMENT_INSTRUCTIONS.md`

### Archivos Modificados (5)
- `netlify/functions/hdd-games.mts`
- `games/play/pill-organizer.html`
- `games/play/lawn-mower.html`
- `games/play/medication-memory.html`
- `hdd/portal/index.html`

### Total: 14 archivos tocados

---

## ⚠️ IMPORTANTE

1. **NO hacer merge sin testing** - Deploy preview primero
2. **Ejecutar SQL migrations ANTES del merge** - Evita errores
3. **Fix SMTP DESPUÉS del deploy** - Variable de entorno
4. **Verificar tracking individual** - NO debe mezclar pacientes

---

## 🎯 CHECKLIST

- [ ] Push branch a GitHub
- [ ] Crear PR (NO merge)
- [ ] Ejecutar SQL migrations en Supabase
- [ ] Deploy preview creado automáticamente
- [ ] Testing en deploy preview
- [ ] Fix SMTP en Netlify
- [ ] Re-test email notifications
- [ ] Aprobar y merge PR
- [ ] Verificar producción

---

**Si algo falla, contactame - tengo todo el código en memoria.**

Gonzalo Pérez Cortizo  
2026-02-13
