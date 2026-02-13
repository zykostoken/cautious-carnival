# 🎯 PASOS FINALES - MEGA FIX HDD
**Estado:** 70% completo

---

## ✅ COMPLETADO

1. ✅ Sistema de modales 3 fases (mood-modals.html + .js)
2. ✅ Paleta de 60 colores con psicología
3. ✅ SQL migrations (color_psychology + game_sessions)
4. ✅ Backend actualizado (hdd-games.mts)

---

## ⏳ FALTA (30%)

### A. INTEGRAR MODALES A JUEGOS (15% - 30 min)

**En cada juego (pill-organizer, lawn-mower, medication-memory):**

1. Agregar en `<head>`:
```html
<script src="/games/shared/mood-modals.js"></script>
```

2. Agregar antes de `</body>`:
```html
<!-- Include shared modals -->
<div id="mood-modals-container"></div>
<script>
  fetch('/games/shared/mood-modals.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('mood-modals-container').innerHTML = html;
    });
</script>
```

3. Al terminar juego, llamar:
```javascript
// Antes de mostrar métricas
updateGameMetrics({
  score: finalScore,
  tremor_index: tremorData,
  duration_seconds: elapsedSeconds
});
showPostGameIntensityModal();
```

4. Eliminar modales viejos (buscar y borrar divs con id "mood-modal", "color-intensity-modal", "color-palette-modal" antiguos)

### B. DASHBOARD DE MÉTRICAS (10% - 45 min)

Crear `/hdd/portal/metrics-dashboard.html` con:
- Chart.js para gráficos
- Gráfico de línea: Mood pre vs post temporal
- Heatmap: Colores elegidos
- Tabla: Historial de sesiones
- Botón: Exportar CSV

### C. HOMEPAGE INSTITUCIONAL (3% - 15 min)

Agregar en `/index.html` sección:
```html
<section id="hdd-digital">
  <h2>Hospital de Día Digital</h2>
  <p>Gamificación terapéutica basada en evidencia...</p>
  <a href="/games/portal">Acceder al Portal HDD</a>
</section>
```

### D. FIX EMAIL SMTP (2% - 5 min)

Via Netlify Connector MCP:
```
ZOHO_SMTP_PASS = Npemb5ZNuFA8
```

---

## 🚀 ESTRATEGIA DE DEPLOYMENT

**OPCIÓN 1: Todo junto ahora**
- Integrar los 3 juegos
- Dashboard
- Homepage
- Deploy completo
Tiempo: ~1.5 horas

**OPCIÓN 2: Deploy incremental (RECOMENDADO)**
- Ahora: Push lo que tenemos (modales + backend)
- Deploy y testing
- Luego: Integrar juegos uno por uno
- Luego: Dashboard + homepage
Ventaja: Menos riesgo, testing incremental

**OPCIÓN 3: Mínimo viable**
- Solo integrar 1 juego (Pill Organizer)
- Deploy y test
- Replicar a otros después
Tiempo: 30 min + deploy

---

## 📊 ESTADO ACTUAL DEL BRANCH

```
mega-fix-hdd-complete
├── Commit 1: Modales + SQL (60%)
├── Commit 2: Backend (70%)
└── Falta: Integración + UI (30%)
```

**Archivo listo para:**
- Push a GitHub
- Create PR
- Testing en staging

**NO listo todavía:**
- Merge a main
- Deploy a producción

---

## ❓ DECISIÓN NECESARIA

¿Qué preferís?

A) Sigo a full - termino todo - deploy completo (1.5h más)
B) Push ahora - testeo - continuo después
C) Integro solo Pill Organizer - deploy mínimo - expando después

**Decime A, B o C y sigo.**
