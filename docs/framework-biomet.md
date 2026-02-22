# Marco Semiológico — Métricas Biométricas HDD
Clínica Psiquiátrica José Ingenieros

## Dimensiones de captura

### 1. Psicomotor / Tremor
tremor_reposo_px — oscilación estacionaria (circuito nigroestriatal)
tremor_inicio_px — inestabilidad al iniciar movimiento (cerebeloso / ET)
tremor_terminal_px — oscilación en aproximación al target (dismetría terminal)
dismetria_px — distancia click / centro target
hipermetria_ratio / hipometria_ratio

### 2. Praxis
rectificaciones_count — cambios de dirección >45° (correcciones de curso)
eficiencia_trayectoria — distancia_recta / camino_real
eficacia_objetivo — ¿se logró el resultado externo? (bool)
eficacia_plan_propio — ¿el plan era correcto y se ejecutó? (bool + intentos_previos)
errores_omision / errores_comision / falsos_clicks
perseveracion_count — misma acción repetida sin cambio de estrategia
secuencia_correcta_pct

### 3. Atención / RT
latencia_inicio_ms — t(primera_acción) - t(inicio_estimulo)
rt_mean_ms / rt_sd_ms / rt_cv (SD/media)
latencia_inter_estimulo_ms
decaimiento_vigilancia_ratio — RT segunda_mitad / primera_mitad
hesitaciones_count / hesitacion_duracion_mean_ms

### 4. Facultades ejecutivas superiores
impulsividad_ratio — respuestas anticipadas (<p10 RT propio)
flexibilidad_adaptativa — cambio de estrategia post-error
inhibicion_motor — movimientos abortados / iniciados
economia_cognitiva — acciones_útiles / acciones_totales

## Eficacia del plan propio (Goldar / Merleau-Ponty)
El sistema registra el target que el cursor "apunta" (target más cercano durante el movimiento de aproximación).
Si se dirige 300ms hacia X y luego yerra 3 veces → plan correcto, falla motora.
Si explora sin dirección → posible apraxia ideacional.
