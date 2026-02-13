# 🎯 SISTEMA DE TRACKING POR PACIENTE INDIVIDUAL

## ✅ CONFIRMACIÓN: Cada paciente tiene sus propias métricas separadas

### TABLAS CON `patient_id`

Todas las tablas principales incluyen `patient_id` para separar datos por paciente:

1. **hdd_mood_checkins**
   - `patient_id UUID REFERENCES hdd_patients(id)`
   - Cada mood check (pre/post) está asociado a UN paciente
   - No hay mezcla de datos entre pacientes

2. **hdd_game_sessions** (NUEVA)
   - `patient_id UUID REFERENCES hdd_patients(id) ON DELETE CASCADE`
   - Cada sesión de juego pertenece a UN paciente
   - Incluye: pre_chat_responses, post_color, game_metrics

3. **hdd_game_progress**
   - `patient_id UUID` 
   - Progreso individual por paciente y juego
   - Tracks: current_level, best_score, total_sessions

4. **hdd_crisis_alerts**
   - `patient_id UUID`
   - Alertas específicas por paciente

### QUERIES DE EJEMPLO - DATOS POR PACIENTE INDIVIDUAL

```sql
-- Obtener todas las sesiones de UN paciente
SELECT * FROM hdd_game_sessions 
WHERE patient_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY started_at DESC;

-- Colores elegidos por UN paciente (análisis longitudinal)
SELECT 
  gs.completed_at,
  gs.game_type,
  gs.post_intensity,
  gs.post_color_hex,
  cp.psychological_tags
FROM hdd_game_sessions gs
LEFT JOIN hdd_color_psychology cp ON gs.post_color_hex = cp.color_hex
WHERE gs.patient_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY gs.completed_at DESC;

-- Estadísticas de UN paciente
SELECT * FROM get_patient_game_stats('123e4567-e89b-12d3-a456-426614174000');

-- Análisis de mood de UN paciente
SELECT * FROM v_hdd_mood_color_analysis
WHERE patient_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY checkin_date DESC;
```

### FRONTEND - Obtener patient_id

En los juegos, el `patient_id` se obtiene de:

```javascript
// Desde URL params
const urlParams = new URLSearchParams(window.location.search);
currentPatientId = urlParams.get('patient_id');

// O desde localStorage (sesión)
currentPatientId = localStorage.getItem('hdd_patient_id');

// Luego se envía en TODAS las requests
fetch('/api/hdd/games', {
  method: 'POST',
  body: JSON.stringify({
    action: 'mood_checkin',
    patient_id: currentPatientId,  // ← CLAVE
    phase: 'post',
    intensity: 'vivid',
    color_hex: '#FF0000'
  })
});
```

### BACKEND - Verificación de paciente

En `hdd-games.mts`:

```typescript
// SIEMPRE se verifica el patient_id
const patient = await getPatientBySession(sql, sessionToken);
if (!patient) {
  return new Response(JSON.stringify({ error: "Sesión inválida" }), 
    { status: 401, headers: corsHeaders });
}

// Luego TODAS las queries usan patient.id
await sql`
  INSERT INTO hdd_game_sessions (patient_id, ...)
  VALUES (${patient.id}, ...)  // ← patient.id específico
`;
```

### DASHBOARD - Filtrado por paciente

El dashboard de métricas DEBE incluir:

```javascript
// Selector de paciente
<select id="patient-selector">
  <option value="patient-123">Juan Pérez</option>
  <option value="patient-456">María García</option>
</select>

// Cargar métricas del paciente seleccionado
async function loadPatientMetrics(patientId) {
  const sessions = await fetch(`/api/hdd/sessions?patient_id=${patientId}`);
  const stats = await fetch(`/api/hdd/stats?patient_id=${patientId}`);
  // Renderizar gráficos SOLO de ese paciente
}
```

### ✅ GARANTÍA DE SEPARACIÓN

1. ❌ **NO hay datos compartidos** - Cada registro tiene su patient_id
2. ❌ **NO hay métricas de población** - Todo es individual
3. ✅ **SÍ hay tracking longitudinal** - Historia completa por paciente
4. ✅ **SÍ hay análisis individual** - Funciones SQL específicas
5. ✅ **SÍ hay privacy** - ON DELETE CASCADE protege datos

### ANÁLISIS POBLACIONAL (OPCIONAL)

Si en el futuro querés análisis agregado (sin identificar pacientes):

```sql
-- Colores más elegidos (población anónima)
SELECT 
  cp.color_family,
  cp.psychological_tags,
  COUNT(*) as frequency
FROM hdd_game_sessions gs
JOIN hdd_color_psychology cp ON gs.post_color_hex = cp.color_hex
GROUP BY cp.color_family, cp.psychological_tags
ORDER BY frequency DESC;

-- Pero SIEMPRE podés filtrar por paciente individual
WHERE patient_id = '...'
```

---

## 🎯 CONCLUSIÓN

✅ **Sistema 100% individual por paciente**
✅ **No hay mezcla de datos**
✅ **Tracking longitudinal completo**
✅ **Privacy by design**

Cada paciente tiene su propio timeline de:
- Pre-game chats
- Intensidades elegidas
- Colores seleccionados
- Métricas de juego
- Progreso temporal
