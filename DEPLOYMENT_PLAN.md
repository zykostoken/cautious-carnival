# 🚀 PLAN DE DEPLOYMENT - MEGA FIX HDD

## Archivos Creados (Nuevos)

1. `/games/shared/mood-modals.html` - Modales compartidos 3 fases
2. `/games/shared/mood-modals.js` - Lógica JavaScript compartida
3. `/sql/color-psychology.sql` - Tabla psicología de colores
4. `/sql/game-sessions.sql` - Sistema de sesiones

## Archivos a Modificar

### JUEGOS (3 archivos)
1. `/games/play/pill-organizer.html`
   - Incluir mood-modals.html
   - Reemplazar modal viejo
   - Paleta 12 colores

2. `/games/play/lawn-mower.html`
   - Incluir mood-modals.html
   - Reemplazar modal viejo
   - Paleta 12 colores

3. `/games/play/medication-memory.html`
   - Incluir mood-modals.html
   - Reemplazar modal viejo
   - Paleta 12 colores
   - FIX deployment issues

### BACKEND (1 archivo)
4. `/netlify/functions/hdd-games.mts`
   - Soporte para phase: 'pre' y 'post'
   - Guardar chat_responses
   - Guardar intensity + color_hex

### PORTAL HDD (1 archivo)
5. `/hdd/portal/index.html` o `/games/portal/index.html`
   - Nueva pestaña "Métricas"
   - Dashboard con gráficos
   - Historial por paciente

### HOMEPAGE (1 archivo)
6. `/index.html`
   - Nueva sección "Hospital de Día Digital"
   - Info sobre gamificación terapéutica

## Variables de Entorno (Netlify)

- `ZOHO_SMTP_PASS` = `Npemb5ZNuFA8`

## Orden de Implementación

1. ✅ Crear archivos compartidos (mood-modals.html + .js)
2. ⏳ Actualizar backend (hdd-games.mts)
3. ⏳ Actualizar 3 juegos
4. ⏳ Crear migrations SQL
5. ⏳ Dashboard métricas
6. ⏳ Sección homepage
7. ⏳ Actualizar variable SMTP
8. ⏳ Commit + Push + Deploy

## Estado Actual

- [x] Modal 3 fases - Componentes creados
- [ ] Backend actualizado
- [ ] Juegos actualizados
- [ ] SQL migrations
- [ ] Dashboard métricas
- [ ] Sección homepage
- [ ] SMTP fix
- [ ] Deploy final

---

**Próximo paso:** Actualizar backend para soportar nuevos campos
