# Marco Neurocognitivo — Métricas por Dominio y por Juego
Clínica Psiquiátrica José Ingenieros · Hospital de Día Digital

**Versión:** 2.0 · Febrero 2026
**Referencia clínica:** Betta (semiología psicomotriz), Goldar (frontoestriatales), Lezak (Neuropsychological Assessment), Stuss/Knight (funciones ejecutivas), Jaspers/Merleau-Ponty (fenomenología del acto motor)

> **Principio rector:** El sistema NO interpreta clínicamente. Captura, estructura y presenta. La inferencia de deterioro es exclusivamente del profesional tratante.

---

## 1. Dominios neurocognitivos evaluados

### 1.1 Atención y velocidad de procesamiento

La atención se evalúa en sus cuatro modalidades clásicas. Los juegos de plataforma permiten observar la capacidad de mantenerla ante demandas motoras simultáneas.

| Métrica | Símbolo | Descripción clínica |
|---------|---------|---------------------|
| Latencia de inicio | `latencia_inicio_ms` | Tiempo desde aparición del estímulo hasta primera acción. Proxy de velocidad de procesamiento y alerta. |
| RT medio | `rt_mean_ms` | Tiempo de reacción promedio por estímulo. Sensible a disfunción prefrontal, sedación, fatiga. |
| Variabilidad RT | `rt_cv` | Coeficiente de variación del RT (SD/media). ↑ variabilidad = ↓ consistencia atencional. Marcador temprano de TDAH en adultos, deterioro leve. |
| Decaimiento de vigilancia | `decaimiento_vigilancia` | RT segunda mitad / RT primera mitad. > 1.15 sugiere fatiga atencional o falla de sostenimiento. |
| Hesitaciones (count) | `hesitaciones_count` | Pausas activas > 1.5s durante el juego. Pueden reflejar duda, búsqueda en memoria, bloqueo. |
| Duración media hesitación | `hesitacion_duracion_mean_ms` | Duración promedio de cada hesitación. Distingue hesitación estratégica (corta, productiva) de bloqueo (larga, improductiva). |
| Atención selectiva | `atencion_selectiva_score` | Proporción de targets correctamente ignorados vs activados (solo en juegos con distractores). |

**Inferencias tempranas posibles:**
- `rt_cv` > 0.4 + `decaimiento_vigilancia` > 1.2 → patrón compatible con deterioro atencional sostenido
- `hesitaciones_count` alto + duración larga → dificultad de procesamiento, posible falla de evocación

---

### 1.2 Memoria (4 modalidades)

El sistema evalúa las cuatro modalidades mnemésicas que los juegos permiten observar conductualmente, sin necesitar autorrelato.

#### Fijación (encoding)
Capacidad de formar nuevas huellas mnémicas en el acto.

| Métrica | Símbolo | Cómo se mide |
|---------|---------|--------------|
| Tasa de fijación | `memoria_fijacion_score` | En *Memoria de Medicación*: aciertos en primera presentación. En *Supermercado*: uso correcto de ítems sin re-consulta. |
| Errores de primer intento | `primer_intento_errores` | Fallos en el primer intento de cada ítem (falla de encoding inicial). |

#### Evocación espontánea (recall)
Recuperación libre de la memoria de largo plazo.

| Métrica | Símbolo | Cómo se mide |
|---------|---------|--------------|
| Score de evocación | `memoria_evocacion_score` | En *Rutina Diaria*: proporción de hábitos propios seleccionados sin ayuda. En *Medicación*: aciertos sin pistas. |
| Curva de posición serial | `serial_position_curve` | En *Medicación*: errores por posición de ítem. Efecto primacía/recencia diagnostica modalidad afectada. |

#### Memoria de trabajo (working memory)
Capacidad de mantener y manipular información en línea durante la tarea.

| Métrica | Símbolo | Cómo se mide |
|---------|---------|--------------|
| Span de trabajo | `wm_span` | Máximo de ítems manejados correctamente en simultáneo. Directo en *Neuro-Chef*, *Supermercado*. |
| Errores por sobrecarga | `wm_overflow_errors` | Errores que ocurren cuando la demanda supera la capacidad (juegos con múltiples subtareas simultáneas). |
| Interferencia retrograda | `interferencia_retrograda` | En *Medicación*: ¿los nuevos ítems "borran" los anteriores? |

#### Memoria semántica / procedimental (stock previo)
Uso de conocimiento preexistente (lenguaje, cultura, hábitos consolidados).

| Métrica | Símbolo | Cómo se mide |
|---------|---------|--------------|
| Activación semántica | `mem_semantica_score` | En *Rutina Diaria*: coherencia de categorías elegidas con perfil etario/cultural. |
| Uso de heurísticas | `uso_heuristicas` | En *Heladera* y *Supermercado*: velocidad de clasificación de ítems familiares vs novedosos. |

---

### 1.3 Funciones ejecutivas

#### Planificación
Capacidad de anticipar una secuencia de acciones antes de ejecutarlas.

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Eficacia del plan propio | `eficacia_plan_propio` | ¿El plan que el paciente tenía era correcto para ese nivel? (independiente de la ejecución motora). Detecta apraxia ideacional. |
| Plan vs ideal | `plan_vs_ideal_ratio` | Comparación entre la secuencia ejecutada y la secuencia óptima para ese nivel. 1.0 = perfecto. < 0.7 = planificación deficitaria. |
| Latencia de planificación | `latencia_planificacion_ms` | Tiempo en "quietud activa" al inicio del nivel antes de comenzar (tiempo de planificación prospectiva). |
| Secuencia correcta | `secuencia_correcta_pct` | Porcentaje de pasos ejecutados en el orden correcto. |

#### Flexibilidad cognitiva
Capacidad de modificar la estrategia ante el error o ante obstáculos novedosos.

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Flexibilidad post-error | `flexibilidad_adaptativa` | ¿Cambia de estrategia después de un error? 0 = sin cambio, 1 = cambio inmediato. Marcador de flexibilidad vs rigidez. |
| Perseveración | `perseveracion_count` | Número de veces que repite la misma acción errónea sin corregir. ↑ en deterioro frontal. |
| Rectificaciones | `rectificaciones_count` | Cambios de dirección > 45° durante un movimiento. Pueden ser señal de re-planificación in-situ o de tremore/ataxia. |
| Adaptación ante obstáculo nuevo | `adaptacion_obstaculo_ms` | Tiempo hasta cambiar conducta ante un obstáculo no visto antes. |

#### Inhibición y control de impulsos

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Impulsividad motora | `impulsividad_ratio` | Acciones con RT < p10 propio (anticipadas). Marcador de control inhibitorio prefrontal. |
| Inhibición motora | `inhibicion_motor` | Movimientos iniciados y abortados / movimientos totales. Capacidad de frenar una respuesta en curso. |
| Errores de comisión | `errores_comision` | Acciones sobre elementos que no debían tocarse (flores, pileta en *Cortadora*). |
| Falsos clicks | `falsos_clicks` | Clicks en zonas vacías. Índice de impulsividad espacial. |

#### Monitoreo y corrección

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Economía cognitiva | `economia_cognitiva` | acciones_útiles / acciones_totales. Eficiencia en el uso de recursos cognitivos. |
| Autocorrecciones | `autocorrecciones_count` | Número de veces que deshace una acción antes de confirmarla. Señal de metamonitoreo activo. |
| Errores de omisión | `errores_omision` | Elementos que debían procesarse y fueron ignorados. Déficit de vigilancia o planificación. |

#### Razonamiento abstracto y lógico

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Score de abstracción | `abstraccion_score` | En *Heladera*: capacidad de categorizar por propiedad abstracta (no perceptual). Distingue pensamiento concreto. |
| Estrategia de exploración | `patron_exploracion` | `'sistematica'` / `'aleatoria'` / `'mixta'`. La exploración sistemática refleja pensamiento organizado. |
| Resolución de analogías | `analogias_score` | En niveles donde se requiere trasladar una regla a un caso nuevo. |

---

### 1.4 Psicomotricidad — Tremor (3 tipos)

Los tres tipos de tremor tienen substrato neurológico diferente y permiten inferir sistemas afectados.

| Tipo | Métrica | Cuándo | Substrato |
|------|---------|--------|-----------|
| **Reposo** | `tremor_reposo_px` | Cursor estático ≥ 500ms | Nigroestriatal. ↑ en Parkinson, fármacos antipsicóticos, Haloperidol. |
| **Acción (kinético)** | `tremor_accion_px` | Primeros 150ms de cada movimiento | Cerebeloso / esencial. ↑ en fatiga, ansiedad, temblor esencial. |
| **Distal (terminal)** | `tremor_distal_px` | Últimos 80px al target | Intención cerebelosa, dismetría. ↑ en lesiones cerebelosas, esclerosis múltiple. |

**Métricas adicionales de coordinación:**

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Dismetría | `dismetria_px` | Distancia click / centro del target. Combina tremor terminal + error espacial. |
| Hipermetría | `hipermetria_ratio` | Proporción de sobrepasamiento del target (> centro). |
| Hipometría | `hipometria_ratio` | Proporción de quedarse corto. |
| Eficiencia de trayectoria | `eficiencia_trayectoria` | distancia_recta / camino_real. 1.0 = línea recta perfecta. ↓ en ataxia, temblor, rigidez. |
| Velocidad media | `velocidad_media_px_s` | Velocidad promedio de movimiento. ↓ en bradicinesia (parkinsonismo, depresión psicomotriz). |
| Movimientos totales | `movimientos_totales` | Cantidad de movimientos realizados. |
| Movimientos útiles | `movimientos_utiles` | Movimientos que contribuyeron al objetivo. |

---

### 1.5 Planificación visuoespacial

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Área explorada | `area_explorada_pct` | Proporción del espacio de juego recorrido. ↓ = exploración restringida (posible negligencia, ansiedad espacial). |
| Errores posicionales | `errores_posicionales` | Items colocados en posición incorrecta sin error de contenido. Disociación espacial/conceptual. |
| Organización espacial | `organizacion_espacial_score` | Medida de clustering geográfico de acciones correctas. |
| Planificación de ruta | `ruta_eficiencia` | En *Cortadora*: proporción del campo cubierto vs redundancias de ruta. |

---

### 1.6 Subjetividad y auto-proyección (*Rutina Diaria*)

Este juego tiene una dimensión única: el paciente configura SU propia rutina ideal. Lo que elige revela proyección de sí mismo, valores y estado anímico.

| Métrica | Símbolo | Descripción |
|---------|---------|-------------|
| Proporción salud/placer | `habitos_salud_ratio` | Hábitos de salud elegidos / total. ↓ puede reflejar anhedonia, abandono. |
| Hábitos sociales | `habitos_sociales_count` | Actividades sociales incluidas. ↓ = retirada social. |
| Hábitos culturales | `habitos_culturales_count` | Lectura, arte, aprendizaje. Proxy de nivel cultural y curiosidad cognitiva. |
| Autoexigencia | `autoexigencia_score` | Cantidad de hábitos elegidos / máximo posible. ↑ = voluntad o perfeccionismo. ↓ = abulia/apatía. |
| Diversidad de categorías | `diversidad_habitos` | Número de categorías distintas elegidas. ↑ = vida rica. ↓ = monotonía, empobrecimiento. |
| Tiempo de elección | `tiempo_por_habito_ms` | Tiempo promedio antes de confirmar cada hábito. Largo = ambivalencia, deliberación. |
| Indecisión | `habitos_cambiados` | Hábitos seleccionados y luego removidos. Señal de conflicto valorativo. |
| Orden de selección | `orden_categorias` | Qué elige primero. Refleja jerarquía de valores implícita. |
| Estado ánimo inferido | `estado_animo_inferido` | Algoritmo basado en balance hábitos positivos/neutros/negativos. **Sin interpretación clínica directa — solo señal.** |
| Proyección cultural | `proyeccion_cultural` | Hábitos que requieren nivel educativo / habilidades específicas. Proxy de estimación de capacidades propias. |

---

## 2. Matriz juego × dominio

```
                       Aten Mem  Ejec Psico VisuEsp Subj
Cortadora de Césped     ●●   ○    ●●   ●●●   ●●      ○
Memoria de Medicación   ●●   ●●●  ●    ●     ○       ○
Organizador Pastillas   ●    ●●   ●●   ●●    ●●      ○
Rutina Diaria           ●    ●●   ●●   ○     ●       ●●●
Heladera Inteligente    ●    ●    ●●●  ○     ●●      ○
Supermercado            ●●   ●●   ●●●  ●     ●●      ●
Neuro-Chef              ●●   ●●●  ●●   ●●    ●●      ●

●●● = dominio principal   ●● = dominio secundario   ● = dominio terciario   ○ = no evaluado
```

---

## 3. Métricas por juego (detalle)

### Cortadora de Césped (`lawn-mower`)

**Dominio principal:** Psicomotricidad, Atención sostenida, Control de impulsos
**Dominio secundario:** Planificación visuoespacial, Flexibilidad

**Qué capta que otros no:**
- **Ruta de cobertura**: la secuencia de filas/columnas revela planificación espacial global (¿sistematiza o va al azar?)
- **Tolerancia al error**: ¿cuánto le afecta tocar una flor? → flexibilidad vs rigidez emocional
- **Diferimiento de recompensa**: avanza metódicamente vs busca áreas fáciles primero
- **Los tres tremores** en estado puro: juego de movimiento continuo con pausas medibles

**Métricas específicas:**
```json
{
  "cobertura_campo_pct": 0.87,
  "redundancia_ruta_pct": 0.12,
  "estrategia_ruta": "sistematica | aleatoria | mixta",
  "flores_evitadas_pct": 0.95,
  "pileta_evitada_pct": 1.0,
  "tiempo_recuperacion_post_error_ms": 2400
}
```

---

### Memoria de Medicación (`medication-memory`)

**Dominio principal:** Memoria (fijación + evocación + trabajo)
**Dominio secundario:** Atención, Inhibición

**Qué capta que otros no:**
- **Curva de posición serial**: los errores por posición (primero / medio / último) distinguen:
  - Muchos errores en últimos ítems → falla de memoria de trabajo (sobrecarga)
  - Muchos errores en primeros → falla de fijación (encoding)
  - Muchos errores en ítems del medio → interferencia retroactiva
- **Tiempo de lectura**: ¿cuánto mira la receta antes de cerrarla? → estrategia de estudio
- **Autocorrecciones**: deshace una pastilla ya colocada → metamemoria activa

**Métricas específicas:**
```json
{
  "tiempo_lectura_receta_ms": 8400,
  "reinspecciones_receta": 2,
  "serial_position_errors": [0, 1, 0, 2, 1],
  "efecto_primacia": 0.9,
  "efecto_recencia": 0.7,
  "autocorrecciones_count": 3,
  "wm_span_estimado": 4,
  "interferencia_score": 0.2
}
```

---

### Organizador de Pastillas (`pill-organizer`)

**Dominio principal:** Planificación + secuenciación, Psicomotricidad (drag & drop)
**Dominio secundario:** Memoria de trabajo, Visuoespacial

**Qué capta que otros no:**
- **Presión de touch**: en tablet/móvil, la presión y duración del drag revela coordinación fina
- **Estrategia de organización**: ¿agrupa primero por tipo o por horario? → planificación conceptual vs perceptual
- **Errores de categoría vs posición**: ¿pone el ítem correcto en lugar incorrecto, o ítem incorrecto en lugar correcto?

**Métricas específicas:**
```json
{
  "errores_categoria": 2,
  "errores_posicion": 1,
  "drag_duration_mean_ms": 850,
  "estrategia": "por_tipo | por_horario | mixta",
  "reubicaciones": 3
}
```

---

### Rutina Diaria (`daily-routine`)

**Dominio principal:** Subjetividad / auto-proyección
**Dominio secundario:** Memoria semántica (stock de vida), Planificación temporal

**Qué capta que otros no:**
- **Proyección de sí mismo**: lo que elige como "mi rutina" es una ventana directa a la autopercepción y valores
- **Voluntad**: la densidad y variedad de hábitos elegidos refleja la capacidad de proyectar un yo activo
- **Cultura y nivel educativo**: hábitos de lectura, aprendizaje, arte
- **Estado anímico indirecto**: un paciente deprimido tiende a elegir menos hábitos sociales, más de supervivencia
- **Bagaje autobiográfico**: ¿aparecen hábitos de su vida anterior al episodio? → preservación del yo premórbido

**Métricas específicas:**
```json
{
  "habitos_salud_ratio": 0.35,
  "habitos_sociales_count": 2,
  "habitos_culturales_count": 3,
  "habitos_ocio_count": 4,
  "autoexigencia_score": 0.72,
  "diversidad_habitos": 5,
  "tiempo_por_habito_ms": 1200,
  "habitos_cambiados": 1,
  "orden_primera_categoria": "salud | social | ocio | cultural",
  "total_habitos_elegidos": 8,
  "total_habitos_disponibles": 15,
  "estado_animo_proxy": "positivo | neutro | bajo",
  "proyeccion_cultural": "alta | media | baja"
}
```

---

### Heladera Inteligente (`fridge-logic`)

**Dominio principal:** Razonamiento abstracto, Categorización
**Dominio secundario:** Planificación visuoespacial, Atención selectiva

**Qué capta que otros no:**
- **Pensamiento concreto vs abstracto**: ¿categoriza por apariencia (color, tamaño) o por propiedad abstracta (temperatura de conservación, grupo alimenticio)?
- **Exploración sistemática**: ¿revisa todo antes de decidir o actúa por ensayo y error?
- **Reglas de organización**: ¿hay un principio organizador o es aleatorio?

**Métricas específicas:**
```json
{
  "estrategia_exploracion": "sistematica | aleatoria",
  "nivel_abstraccion": "concreto | funcional | abstracto",
  "items_inspeccionados_antes_mover": 3.5,
  "errores_categoria_abstracta": 2,
  "regla_organizacion_detectada": true,
  "cambios_de_regla": 1
}
```

---

### Supermercado (`super-market`)

**Dominio principal:** Planificación, Memoria de trabajo, Razonamiento práctico
**Dominio secundario:** Cultura/habilidades previas, Atención sostenida

**Qué capta que otros no:**
- **Gestión de recursos limitados** (presupuesto): economía real de la vida cotidiana
- **Decisiones bajo restricción**: priorización entre necesidades y deseos revela jerarquía de valores
- **Cálculo mental**: sumas y restas durante la compra → integridad aritmética cotidiana
- **Habilidades previas**: ¿sabe el precio aproximado de los ítems? → memoria semántica de la vida diaria

**Métricas específicas:**
```json
{
  "presupuesto_respetado": true,
  "diferencia_presupuesto": -1200,
  "items_necesarios_elegidos_pct": 0.88,
  "items_innecesarios_elegidos": 2,
  "recalculos_realizados": 3,
  "estrategia_compra": "lista_mental | exploratoria",
  "conocimiento_precios_score": 0.75
}
```

---

### Neuro-Chef (`neuro-chef`)

**Dominio principal:** Memoria de trabajo (span máximo), Planificación temporal
**Dominio secundario:** Flexibilidad, Atención dividida, Psicomotricidad

**Qué capta que otros no:**
- **Span de memoria de trabajo**: manejar múltiples preparaciones simultáneas con tiempos distintos
- **Priorización dinámica**: ¿atiende lo urgente primero?
- **Interferencia entre subtareas**: ¿olvidar una tarea porque apareció otra? → memoria de trabajo vs interferencia
- **Estimación temporal**: ¿sabe cuánto falta para cada preparación sin mirar el reloj?

**Métricas específicas:**
```json
{
  "max_subtareas_simultaneas": 3,
  "subtareas_olvidadas": 1,
  "subtareas_completadas_pct": 0.88,
  "errores_temporales": 2,
  "prioridad_correcta_pct": 0.75,
  "estimacion_tiempo_error_ms": 800,
  "interferencia_count": 3
}
```

---

## 4. Estructura JSONB unificada en `hdd_biometric_timeline`

Todos los juegos guardan su payload biométrico con esta estructura por dominio:

```json
{
  "game_slug": "lawn-mower",
  "session_duration_s": 145,

  "atencion": {
    "latencia_inicio_ms": 850,
    "rt_mean_ms": 380,
    "rt_sd_ms": 145,
    "rt_cv": 0.38,
    "decaimiento_vigilancia": 1.08,
    "hesitaciones_count": 2,
    "hesitacion_duracion_mean_ms": 1800
  },

  "memoria": {
    "fijacion_score": null,
    "evocacion_score": null,
    "wm_span": null,
    "serial_position_errors": null,
    "autocorrecciones_count": 0
  },

  "ejecutivas": {
    "eficacia_plan_propio": 0.9,
    "plan_vs_ideal_ratio": 0.82,
    "secuencia_correcta_pct": 0.91,
    "flexibilidad_adaptativa": 0.75,
    "perseveracion_count": 0,
    "rectificaciones_count": 6,
    "impulsividad_ratio": 0.08,
    "inhibicion_motor": 0.15,
    "economia_cognitiva": 0.78,
    "errores_omision": 1,
    "errores_comision": 2
  },

  "psicomotriz": {
    "tremor_reposo_px": 1.8,
    "tremor_accion_px": 2.9,
    "tremor_distal_px": 4.6,
    "dismetria_px": 7.2,
    "hipermetria_ratio": 0.3,
    "hipometria_ratio": 0.15,
    "eficiencia_trayectoria": 0.88,
    "velocidad_media_px_s": 185,
    "movimientos_totales": 132,
    "movimientos_utiles": 105
  },

  "visuoespacial": {
    "area_explorada_pct": 0.83,
    "cobertura_campo_pct": 0.87,
    "estrategia_ruta": "sistematica",
    "errores_posicionales": 1
  },

  "subjetividad": null
}
```

---

## 5. Señales de alerta para deterioro neurocognitivo temprano

> El sistema puede destacar combinaciones de señales. El profesional valida.

### Patrón atencional (MCI leve / TDAH adulto)
- `rt_cv` > 0.45 en ≥ 2 sesiones consecutivas
- `decaimiento_vigilancia` > 1.25
- `hesitaciones_count` progresivamente en aumento

### Patrón mnésico (deterioro de tipo Alzheimer temprano)
- `serial_position_errors` concentrados en ítems del medio → falla de consolidación
- `efecto_primacia` < 0.6 + `efecto_recencia` normal → posible disfunción hipocampal
- `wm_span` < 3 en adultos sin TDAH

### Patrón ejecutivo (disfunción frontal)
- `perseveracion_count` > 3 por sesión + `flexibilidad_adaptativa` < 0.3
- `plan_vs_ideal_ratio` < 0.5 con `eficacia_plan_propio` > 0.8 → sabe el plan pero no puede ejecutarlo
- `impulsividad_ratio` > 0.25 de forma sostenida

### Patrón psicomotriz (parkinsonismo por fármacos / EP temprano)
- `tremor_reposo_px` > 8px en reposo + `velocidad_media_px_s` < 100 → bradicinesia + tremor reposo
- `tremor_distal_px` > 12px → posible dismetría cerebelosa
- `eficiencia_trayectoria` < 0.65 en 3+ sesiones

### Patrón subjetivo (depresión / abulia)
- `autoexigencia_score` < 0.4 (elige muy pocos hábitos)
- `habitos_sociales_count` = 0 en ≥ 2 sesiones
- `diversidad_habitos` < 3

---

## 6. Login biométrico como marcador longitudinal

Las **dinámicas de teclado en login** son el marcador más ecológico y libre de sesgo de demanda:

| Métrica | Símbolo | Interpretación clínica |
|---------|---------|------------------------|
| CV inter-tecla | `ik_cv` | Variabilidad de la velocidad de escritura. ↑ = variabilidad motora fina. En tremor esencial y Parkinson temprano puede aparecer antes que el tremor clínico. Sensible a ansiedad aguda. |
| Tiempo total | `total_ms` | Velocidad global de interacción con el sistema. ↓ progresivo puede indicar bradicinesia. |
| Teclas por segundo | `keypress_rate` | Velocidad neta. Sensible a sedación farmacológica. |

El `ik_cv` medido en cada login, sin contexto de evaluación, refleja el estado motor fine del día. Correlacionar con estado clínico anotado por el profesional.

---

## 7. Protocolo de captura por juego (para desarrolladores)

### ¿Qué debe emitir cada juego al llamar a `biomet.save()`?

```javascript
// Estructura esperada en el campo extra_data de biomet.save()
biomet.save({
    // Métricas de dominio "ejecutivas" — específicas del juego
    eficacia_plan_propio:     0.88,   // ¿El plan era correcto?
    plan_vs_ideal_ratio:      0.81,   // Plan ejecutado vs óptimo
    secuencia_correcta_pct:   0.92,
    errores_omision:          1,
    errores_comision:         2,
    autocorrecciones_count:   1,

    // Métricas de dominio "memoria" — solo si el juego las evalúa
    fijacion_score:           null,   // null si no aplica
    evocacion_score:          null,
    wm_span:                  null,

    // Métricas de dominio "visuoespacial" — solo si el juego las evalúa
    area_explorada_pct:       0.84,
    estrategia_ruta:         'sistematica',

    // Métricas de dominio "subjetividad" — solo Rutina Diaria
    habitos_salud_ratio:      null,
    autoexigencia_score:      null,
    estado_animo_proxy:       null,

    // Score de síntesis del juego
    final_score:              78,
    nivel:                    2,
    completado:               true
});
```

El objeto retornado por `biomet.save()` contiene todos los campos psicomotores universales (tremores, RT, praxis). El `extra_data` agrega los dominios específicos del juego.

---

*Marco semiológico — Clínica Psiquiátrica José Ingenieros · Uso interno exclusivo del equipo clínico.*
