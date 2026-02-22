// ================================================================
// biomet.js — Captura biométrica psicomotora universal
// Clínica Psiquiátrica José Ingenieros · HDD Digital
//
// Referencia clínica:
//   Betta (Psiquiatría): semiología psicomotriz, cuanti y cualitativa
//   Goldar: circuitos frontoestriatales, TR como ventana prefrontal
//   Fenomenología (Jaspers, Merleau-Ponty): intencionalidad del acto motor
//
// NO interpreta. Solo captura y estructura.
// La lectura es exclusivamente del profesional tratante.
// ================================================================

(function(global) {
'use strict';

// ================================================================
// CONFIGURACIÓN
// ================================================================
var CFG = {
    REPOSO_MIN_MS:        500,    // cursor estático por este tiempo → medir tremor reposo
    INICIO_VENTANA_MS:    150,    // primeros Nms de cada movimiento = tremor inicio
    TERMINAL_DIST_PX:     80,     // últimos Npx al target = tremor terminal
    HESITACION_MS:        1500,   // pausa activa = hesitación
    IMPULSIVIDAD_PERCENTIL: 0.10, // RT < p10 propio = respuesta impulsiva
    DECAIMIENTO_MITAD:    true,   // comparar primera vs segunda mitad de sesión
    SAMPLE_INTERVAL_MS:   30,     // frecuencia de muestreo de posición (30ms ≈ 33fps)
};

// ================================================================
// ESTADO INTERNO
// ================================================================
var BM = {
    active: false,
    sessionStart: null,
    patientId: null,
    gameSlug: null,

    // --- Muestras de posición ---
    posSamples: [],          // { t, x, y, stationary }
    lastPos: null,
    lastMoveTime: null,
    stationaryStart: null,
    stationaryBuffer: [],    // muestras durante reposo

    // --- Movimientos ---
    movements: [],           // cada movimiento: { t_start, t_end, path:[], targets_near:[] }
    currentMove: null,

    // --- Targets registrados ---
    targets: [],             // { id, el, cx, cy, w, h } — registrar con biomet.registerTarget()
    activeStimulus: null,    // { id, t_shown }

    // --- Clicks y acciones ---
    clicks: [],              // { t, x, y, target_hit, intended_target, dist_to_hit, dist_to_intended }
    actions: [],             // { t, type, target_id, correct, planned_target_id }

    // --- RT por estímulo ---
    stimulusEvents: [],      // { stimulus_id, t_shown, t_response, rt_ms }

    // --- Métricas acumuladas ---
    metrics: {
        // Tremor
        tremor_reposo_samples: [],
        tremor_inicio_samples: [],
        tremor_terminal_samples: [],

        // Praxis
        rectificaciones: 0,
        falsos_clicks: 0,
        errores_omision: 0,
        errores_comision: 0,
        perseveraciones: 0,
        last_action_target: null,
        same_target_streak: 0,
        total_path_px: 0,
        total_straight_px: 0,
        actions_util: 0,
        actions_total: 0,

        // Secuencia
        sequenceCorrect: 0,
        sequenceTotal: 0,

        // Eficacia
        objectives_achieved: 0,
        objectives_total: 0,
        plan_correct_executed: 0,
        plan_correct_total: 0,
        plan_failed_attempts: [],   // { intended, actual, attempts_before }

        // Hesitaciones
        hesitations: [],

        // RT
        rt_list: [],

        // Movimientos abortados (inhibición motora)
        moves_started: 0,
        moves_aborted: 0,
    }
};

// ================================================================
// HELPERS MATEMÁTICOS
// ================================================================
function dist(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

function sd(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function(a,b){ return a+b; }, 0) / arr.length;
    var v = arr.reduce(function(a,b){ return a + Math.pow(b-m,2); }, 0) / (arr.length - 1);
    return Math.sqrt(v);
}

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function(a,b){ return a+b; }, 0) / arr.length;
}

function angleDeg(a, b, c) {
    // Ángulo en B formado por A→B→C
    var ab = { x: b.x-a.x, y: b.y-a.y };
    var bc = { x: c.x-b.x, y: c.y-b.y };
    var dot = ab.x*bc.x + ab.y*bc.y;
    var magAB = Math.sqrt(ab.x*ab.x + ab.y*ab.y);
    var magBC = Math.sqrt(bc.x*bc.x + bc.y*bc.y);
    if (magAB < 0.001 || magBC < 0.001) return 0;
    var cosA = Math.max(-1, Math.min(1, dot / (magAB * magBC)));
    return Math.acos(cosA) * 180 / Math.PI;
}

// ================================================================
// TARGET REGISTRY
// ================================================================
function registerTarget(id, el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    BM.targets.push({ id: id, el: el, cx: cx, cy: cy, w: r.width, h: r.height });
}

function refreshTargets() {
    BM.targets.forEach(function(t) {
        if (!t.el) return;
        var r = t.el.getBoundingClientRect();
        t.cx = r.left + r.width / 2;
        t.cy = r.top + r.height / 2;
        t.w = r.width;
        t.h = r.height;
    });
}

function nearestTarget(x, y) {
    var best = null, bestD = Infinity;
    BM.targets.forEach(function(t) {
        var d = dist({x:x,y:y}, {x:t.cx,y:t.cy});
        if (d < bestD) { bestD = d; best = t; }
    });
    return best ? { target: best, dist: bestD } : null;
}

function targetAt(x, y) {
    // Target que contiene el punto (click dentro del área)
    var hits = BM.targets.filter(function(t) {
        return x >= t.cx - t.w/2 && x <= t.cx + t.w/2 &&
               y >= t.cy - t.h/2 && y <= t.cy + t.h/2;
    });
    if (!hits.length) return null;
    return hits.reduce(function(a, b) {
        return dist({x:x,y:y},{x:a.cx,y:a.cy}) < dist({x:x,y:y},{x:b.cx,y:b.cy}) ? a : b;
    });
}

// ================================================================
// REGISTRO DE ESTÍMULOS (para RT)
// ================================================================
function stimulusShown(id) {
    BM.activeStimulus = { id: id, t_shown: Date.now() };
}

function stimulusResponse(id) {
    if (!BM.activeStimulus) return;
    var rt = Date.now() - BM.activeStimulus.t_shown;
    BM.stimulusEvents.push({
        stimulus_id: BM.activeStimulus.id,
        t_shown: BM.activeStimulus.t_shown,
        t_response: Date.now(),
        rt_ms: rt
    });
    BM.metrics.rt_list.push(rt);
    BM.activeStimulus = null;
}

// ================================================================
// REGISTRO DE ACCIONES (por el juego)
// ================================================================
function recordAction(opts) {
    // opts: { type, target_id, correct, planned_target_id, achieved_objective }
    opts = opts || {};
    var t = Date.now();
    BM.metrics.actions_total++;
    if (opts.correct) BM.metrics.actions_util++;

    // Omisión y comisión
    if (opts.is_omission) BM.metrics.errores_omision++;
    if (opts.is_comision) BM.metrics.errores_comision++;

    // Perseveración: misma acción sobre mismo target sin resultado
    if (BM.metrics.last_action_target === opts.target_id) {
        BM.metrics.same_target_streak++;
        if (BM.metrics.same_target_streak >= 2) BM.metrics.perseveraciones++;
    } else {
        BM.metrics.same_target_streak = 0;
    }
    BM.metrics.last_action_target = opts.target_id;

    // Eficacia del objetivo
    if (typeof opts.achieved_objective !== 'undefined') {
        BM.metrics.objectives_total++;
        if (opts.achieved_objective) BM.metrics.objectives_achieved++;
    }

    // Eficacia del plan propio
    if (typeof opts.plan_correct !== 'undefined') {
        BM.metrics.plan_correct_total++;
        if (opts.plan_correct && opts.plan_executed) BM.metrics.plan_correct_executed++;
        if (opts.plan_correct && !opts.plan_executed && opts.attempts_before) {
            BM.metrics.plan_failed_attempts.push({
                intended: opts.planned_target_id,
                actual: opts.target_id,
                attempts: opts.attempts_before
            });
        }
    }

    // Secuencia
    if (typeof opts.in_sequence !== 'undefined') {
        BM.metrics.sequenceTotal++;
        if (opts.in_sequence) BM.metrics.sequenceCorrect++;
    }

    // Respuesta al estímulo activo
    if (BM.activeStimulus) stimulusResponse(BM.activeStimulus.id);

    BM.actions.push({ t: t, ...opts });
}

// ================================================================
// TRACKING DE MOUSE / TOUCH
// ================================================================
var _sampleInterval = null;

function _onMouseMove(e) {
    var x = e.clientX, y = e.clientY;
    var t = Date.now();
    var moved = !BM.lastPos || dist({x,y}, BM.lastPos) > 1.5;

    if (moved) {
        // Inicio de movimiento nuevo
        if (!BM.currentMove || !BM.lastMoveTime || t - BM.lastMoveTime > 200) {
            if (BM.currentMove && BM.currentMove.path.length > 3) {
                _finalizeMove(BM.currentMove, t);
            }
            BM.currentMove = { t_start: t, path: [], intended_target: null };
            BM.metrics.moves_started++;

            // Tremor de inicio: capturar primeras muestras
            BM.currentMove._onset_start = t;
        }
        BM.lastMoveTime = t;
        BM.stationaryStart = null;
        BM.stationaryBuffer = [];

        if (BM.currentMove) {
            BM.currentMove.path.push({ x, y, t });

            // Tremor de inicio: primeros CFG.INICIO_VENTANA_MS ms
            if (t - BM.currentMove.t_start <= CFG.INICIO_VENTANA_MS) {
                BM.currentMove._onset_pts = BM.currentMove._onset_pts || [];
                BM.currentMove._onset_pts.push({ x, y });
            }

            // Inferir target intendido: target más cercano durante movimiento
            refreshTargets();
            var near = nearestTarget(x, y);
            if (near && near.dist < 200) {
                BM.currentMove.intended_target = near.target.id;
            }

            // Calcular path total
            if (BM.currentMove.path.length >= 2) {
                var pp = BM.currentMove.path;
                BM.metrics.total_path_px += dist(pp[pp.length-2], pp[pp.length-1]);
            }
        }
    } else {
        // Cursor estacionario
        if (!BM.stationaryStart) BM.stationaryStart = t;
        BM.stationaryBuffer.push({ x, y, t });

        // Medir tremor reposo cuando estático por CFG.REPOSO_MIN_MS
        if (t - BM.stationaryStart >= CFG.REPOSO_MIN_MS && BM.stationaryBuffer.length >= 5) {
            var xs = BM.stationaryBuffer.map(function(p){ return p.x; });
            var ys = BM.stationaryBuffer.map(function(p){ return p.y; });
            var tremor = (sd(xs) + sd(ys)) / 2;
            BM.metrics.tremor_reposo_samples.push(tremor);
            BM.stationaryBuffer = []; // reset para siguiente ventana
            BM.stationaryStart = t;
        }

        // Hesitación: cursor estacionario durante tarea activa
        if (BM.currentMove && t - BM.stationaryStart >= CFG.HESITACION_MS) {
            var lastHes = BM.metrics.hesitations;
            var alreadyRegistered = lastHes.length > 0 &&
                t - lastHes[lastHes.length-1].t_start < CFG.HESITACION_MS * 1.5;
            if (!alreadyRegistered) {
                BM.metrics.hesitations.push({ t_start: BM.stationaryStart, dur_ms: t - BM.stationaryStart, x, y });
            }
        }
    }

    BM.lastPos = { x, y };
}

function _finalizeMove(move, t_end) {
    var path = move.path;
    if (path.length < 3) return;

    // Rectificaciones: contar cambios de dirección > 45°
    for (var i = 1; i < path.length - 1; i++) {
        var ang = angleDeg(path[i-1], path[i], path[i+1]);
        if (ang > 45) BM.metrics.rectificaciones++;
    }

    // Tremor de inicio (SD de primeros puntos)
    if (move._onset_pts && move._onset_pts.length >= 3) {
        var oxs = move._onset_pts.map(function(p){ return p.x; });
        var oys = move._onset_pts.map(function(p){ return p.y; });
        BM.metrics.tremor_inicio_samples.push((sd(oxs) + sd(oys)) / 2);
    }

    // Distancia recta (para eficiencia)
    var straight = dist(path[0], path[path.length-1]);
    BM.metrics.total_straight_px += straight;
}

function _onMouseDown(e) {
    var x = e.clientX, y = e.clientY;
    var t = Date.now();

    refreshTargets();
    var hit = targetAt(x, y);
    var intended = BM.currentMove ? BM.currentMove.intended_target : null;
    var near = nearestTarget(x, y);

    // Tremor terminal: SD de los últimos puntos antes del click
    if (BM.currentMove && BM.currentMove.path.length >= 4) {
        var path = BM.currentMove.path;
        var endPts = [];
        for (var i = path.length - 1; i >= 0; i--) {
            if (dist(path[i], path[path.length-1]) <= CFG.TERMINAL_DIST_PX) {
                endPts.push(path[i]);
            } else break;
        }
        if (endPts.length >= 3) {
            var txs = endPts.map(function(p){ return p.x; });
            var tys = endPts.map(function(p){ return p.y; });
            BM.metrics.tremor_terminal_samples.push((sd(txs) + sd(tys)) / 2);
        }
    }

    // Falso click: click fuera de cualquier target
    if (!hit) BM.metrics.falsos_clicks++;

    // Dismetría: distancia al target más cercano
    var dima = near ? near.dist : 9999;

    BM.clicks.push({
        t: t, x: x, y: y,
        target_hit: hit ? hit.id : null,
        intended_target: intended,
        dist_to_hit: hit ? dist({x,y},{x:hit.cx,y:hit.cy}) : null,
        dist_to_intended: null,   // calculado abajo
        dismettia_px: dima
    });

    // Distancia al target intencionado (si difiere del clickeado)
    if (intended && near) {
        var intTarget = BM.targets.find(function(t){ return t.id === intended; });
        if (intTarget) {
            BM.clicks[BM.clicks.length-1].dist_to_intended = dist({x,y},{x:intTarget.cx,y:intTarget.cy});
        }
    }

    // Impulsividad: RT muy bajo
    if (BM.metrics.rt_list.length >= 5) {
        var sorted = BM.metrics.rt_list.slice().sort(function(a,b){return a-b;});
        var p10 = sorted[Math.floor(sorted.length * CFG.IMPULSIVIDAD_PERCENTIL)];
        if (BM.activeStimulus && (Date.now() - BM.activeStimulus.t_shown) < p10) {
            BM.clicks[BM.clicks.length-1].impulsivo = true;
        }
    }
}

function _onTouchStart(e) {
    var touch = e.touches[0];
    _onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
}
function _onTouchMove(e) {
    var touch = e.touches[0];
    _onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
}

// ================================================================
// INICIO / PAUSA / FIN
// ================================================================
function start(opts) {
    opts = opts || {};
    if (BM.active) return;
    BM.active = true;
    BM.sessionStart = Date.now();
    BM.patientId = opts.patientId || 'DEMO';
    BM.gameSlug = opts.gameSlug || 'unknown';

    // Reset
    BM.clicks = []; BM.actions = []; BM.stimulusEvents = []; BM.movements = [];
    BM.posSamples = []; BM.stationaryBuffer = [];
    BM.currentMove = null; BM.lastPos = null;
    Object.assign(BM.metrics, {
        tremor_reposo_samples: [], tremor_inicio_samples: [], tremor_terminal_samples: [],
        rectificaciones: 0, falsos_clicks: 0, errores_omision: 0, errores_comision: 0,
        perseveraciones: 0, last_action_target: null, same_target_streak: 0,
        total_path_px: 0, total_straight_px: 0, actions_util: 0, actions_total: 0,
        sequenceCorrect: 0, sequenceTotal: 0, objectives_achieved: 0, objectives_total: 0,
        plan_correct_executed: 0, plan_correct_total: 0, plan_failed_attempts: [],
        hesitations: [], rt_list: [], moves_started: 0, moves_aborted: 0,
    });

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mousedown', _onMouseDown);
    document.addEventListener('touchstart', _onTouchStart);
    document.addEventListener('touchmove', _onTouchMove);
}

function stop() {
    if (!BM.active) return;
    BM.active = false;
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mousedown', _onMouseDown);
    document.removeEventListener('touchstart', _onTouchStart);
    document.removeEventListener('touchmove', _onTouchMove);
    if (BM.currentMove) _finalizeMove(BM.currentMove, Date.now());
}

// ================================================================
// CÓMPUTO FINAL — producir objeto de métricas consolidado
// ================================================================
function compute() {
    var m = BM.metrics;
    var duration_ms = BM.sessionStart ? Date.now() - BM.sessionStart : 0;
    var clicks = BM.clicks;
    var n_clicks = clicks.length;

    // ---- TREMOR ----
    var tremor_reposo      = mean(m.tremor_reposo_samples);
    var tremor_inicio      = mean(m.tremor_inicio_samples);
    var tremor_terminal    = mean(m.tremor_terminal_samples);
    var dismetria_mean_px  = n_clicks > 0
        ? mean(clicks.filter(function(c){ return c.dismettia_px != null; }).map(function(c){ return c.dismettia_px; }))
        : 0;

    // ---- TRAYECTORIA ----
    var eficiencia_trayectoria = m.total_path_px > 0
        ? Math.min(1, m.total_straight_px / m.total_path_px)
        : 1;

    // ---- RT ----
    var rt_list = m.rt_list;
    var rt_mean = mean(rt_list);
    var rt_sd   = sd(rt_list);
    var rt_cv   = rt_mean > 0 ? rt_sd / rt_mean : 0;

    // Decaimiento de vigilancia
    var decaimiento_ratio = 1;
    if (rt_list.length >= 6) {
        var mid = Math.floor(rt_list.length / 2);
        var rt_first  = mean(rt_list.slice(0, mid));
        var rt_second = mean(rt_list.slice(mid));
        decaimiento_ratio = rt_first > 0 ? rt_second / rt_first : 1;
    }

    // ---- HESITACIONES ----
    var hes = m.hesitations;
    var hesitaciones_count = hes.length;
    var hesitacion_duracion_mean_ms = hes.length > 0
        ? mean(hes.map(function(h){ return h.dur_ms; }))
        : 0;

    // ---- IMPULSIVIDAD ----
    var n_impulsivos = clicks.filter(function(c){ return c.impulsivo; }).length;
    var impulsividad_ratio = n_clicks > 0 ? n_impulsivos / n_clicks : 0;

    // ---- ECONOMÍA COGNITIVA ----
    var economia_cognitiva = m.actions_total > 0 ? m.actions_util / m.actions_total : 1;

    // ---- EFICACIA OBJETIVO ----
    var eficacia_objetivo = m.objectives_total > 0
        ? m.objectives_achieved / m.objectives_total
        : null;

    // ---- EFICACIA PLAN PROPIO ----
    var eficacia_plan_propio = m.plan_correct_total > 0
        ? m.plan_correct_executed / m.plan_correct_total
        : null;

    // ---- SECUENCIA ----
    var secuencia_correcta_pct = m.sequenceTotal > 0
        ? m.sequenceCorrect / m.sequenceTotal
        : null;

    // ---- INHIBICIÓN MOTORA ----
    var inhibicion_motor = m.moves_started > 0
        ? m.moves_aborted / m.moves_started
        : 0;

    return {
        // Meta
        game_slug:      BM.gameSlug,
        patient_id:     BM.patientId,
        duration_ms:    duration_ms,
        n_clicks:       n_clicks,
        n_actions:      m.actions_total,

        // Tremor
        tremor_reposo_px:     +tremor_reposo.toFixed(2),
        tremor_inicio_px:     +tremor_inicio.toFixed(2),
        tremor_terminal_px:   +tremor_terminal.toFixed(2),
        dismetria_mean_px:    +dismetria_mean_px.toFixed(2),

        // Trayectoria / Praxis
        rectificaciones_count:    m.rectificaciones,
        eficiencia_trayectoria:   +eficiencia_trayectoria.toFixed(3),
        falsos_clicks:            m.falsos_clicks,
        errores_omision:          m.errores_omision,
        errores_comision:         m.errores_comision,
        perseveracion_count:      m.perseveraciones,
        secuencia_correcta_pct:   secuencia_correcta_pct !== null ? +secuencia_correcta_pct.toFixed(3) : null,

        // Eficacia
        eficacia_objetivo:        eficacia_objetivo !== null ? +eficacia_objetivo.toFixed(3) : null,
        eficacia_plan_propio:     eficacia_plan_propio !== null ? +eficacia_plan_propio.toFixed(3) : null,
        plan_failed_attempts:     m.plan_failed_attempts,

        // RT / Atención
        rt_mean_ms:               rt_list.length ? +rt_mean.toFixed(1) : null,
        rt_sd_ms:                 rt_list.length ? +rt_sd.toFixed(1) : null,
        rt_cv:                    rt_list.length ? +rt_cv.toFixed(3) : null,
        decaimiento_vigilancia:   +decaimiento_ratio.toFixed(3),
        hesitaciones_count:       hesitaciones_count,
        hesitacion_duracion_mean_ms: hesitacion_duracion_mean_ms ? +hesitacion_duracion_mean_ms.toFixed(0) : null,

        // Ejecutivo
        impulsividad_ratio:       +impulsividad_ratio.toFixed(3),
        inhibicion_motor:         +inhibicion_motor.toFixed(3),
        economia_cognitiva:       +economia_cognitiva.toFixed(3),
    };
}

// ================================================================
// GUARDAR EN SUPABASE
// ================================================================
function save(extra_data) {
    stop();
    var result = compute();
    if (extra_data) Object.assign(result, extra_data);

    try {
        var sb = window.supabase;
        if (!sb) return result;
        var client = sb.createClient(
            'https://yqpqfzvgcmvxvqzvtajx.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHFmenZnY212eHZxenZ0YWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1OTMzODksImV4cCI6MjA2NTE2OTM4OX0.jM2YEBXQ0YFwFOBu3mGbU3NxCez29x8RKYYDV2d8snk'
        );

        // Guardar en hdd_game_metrics con metric_type = 'session_complete'
        client.from('hdd_game_metrics').insert({
            patient_id:   result.patient_id,
            game_slug:    result.game_slug,
            metric_type:  'session_biomet',
            metric_value: result.economia_cognitiva,   // índice de síntesis (0-1)
            metric_data:  result,
            created_at:   new Date().toISOString()
        }).then(function(){}).catch(function(e){ console.warn('biomet save:', e); });

    } catch(e) { console.warn('biomet.save:', e); }

    return result;
}

// ================================================================
// API PÚBLICA
// ================================================================
global.biomet = {
    start:           start,
    stop:            stop,
    save:            save,
    compute:         compute,
    registerTarget:  registerTarget,
    refreshTargets:  refreshTargets,
    stimulusShown:   stimulusShown,
    stimulusResponse:stimulusResponse,
    recordAction:    recordAction,
    // Acceso directo a métricas acumuladas (para debug / live)
    get state() { return BM; }
};

})(window);
