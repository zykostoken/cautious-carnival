// ====================================================================
// MOOD MODALS v7.0 - Clínica José Ingenieros
// v7: NO auto-trigger - cada juego llama showPreGameChat() manualmente
//     despues de que el usuario hace click en COMENZAR.
//     Así el modal nunca bloquea la pantalla de inicio.
// ====================================================================

var MOOD_COLORS = [
    { hex: '#FF0000', name: 'Rojo' }, { hex: '#FF8C00', name: 'Naranja' },
    { hex: '#FFD700', name: 'Amarillo' }, { hex: '#008000', name: 'Verde' },
    { hex: '#00CED1', name: 'Turquesa' }, { hex: '#87CEEB', name: 'Celeste' },
    { hex: '#00008B', name: 'Azul' }, { hex: '#800080', name: 'Violeta' },
    { hex: '#FF69B4', name: 'Rosa' }, { hex: '#8B4513', name: 'Marrón' },
    { hex: '#808080', name: 'Gris' }, { hex: '#000000', name: 'Negro' }
];

var _moodState = { step: 0, responses: [], patientId: null, gameSlug: null };

// ====================================================================
// STORAGE HELPER - localStorage + sessionStorage fallback (incognito)
// ====================================================================
function _moodStorageGet(key) {
    try { var v = localStorage.getItem(key); if (v) return v; } catch(e) {}
    try { return sessionStorage.getItem(key); } catch(e) {}
    return null;
}
function _moodStorageSet(key, val) {
    try { localStorage.setItem(key, val); } catch(e) {}
    try { sessionStorage.setItem(key, val); } catch(e) {}
}

// ====================================================================
// SUPABASE SAVE
// ====================================================================
function _moodSaveToSupabase(type, data, context) {
    try {
        var sb = window.supabase;
        if (!sb) return;
        var client = sb.createClient(
            'https://yqpqfzvgcmvxvqzvtajx.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHFmenZnY212eHZxenZ0YWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1OTMzODksImV4cCI6MjA2NTE2OTM4OX0.jM2YEBXQ0YFwFOBu3mGbU3NxCez29x8RKYYDV2d8snk'
        );
        var ctx = context || 'game';
        var gameSlug = _moodState.gameSlug || window.location.pathname.split('/').pop().replace('.html','');
        var now = new Date().toISOString();

        // Guardar en hdd_mood_entries (tabla original de estados)
        client.from('hdd_mood_entries').insert({
            patient_id: _moodState.patientId || 'DEMO',
            game_slug: gameSlug,
            context_type: ctx,
            entry_type: type,
            data: data,
            created_at: now
        }).then(function(){}).catch(function(){});

        // También guardar en hdd_game_metrics como eje longitudinal de satisfacción
        // (solo cuando hay color elegido — no en skips)
        if (data && data.color && !data.skipped) {
            // Mapeamos color a valor numérico de valencia afectiva (valence 1-10)
            // Para poder graficar tendencia en el tiempo
            var colorValence = {
                '#FF0000': 3,  // Rojo — alta activación negativa
                '#FF8C00': 5,  // Naranja — activación media
                '#FFD700': 7,  // Amarillo — positivo/energético
                '#008000': 8,  // Verde — calma positiva
                '#00CED1': 7,  // Turquesa — calma activa
                '#87CEEB': 7,  // Celeste — tranquilidad
                '#00008B': 5,  // Azul oscuro — neutro
                '#800080': 4,  // Violeta — introspectivo
                '#FF69B4': 7,  // Rosa — afecto positivo
                '#8B4513': 4,  // Marrón — neutro-bajo
                '#808080': 4,  // Gris — aplanamiento
                '#000000': 2   // Negro — alta valencia negativa
            };
            var valence = colorValence[data.color] || 5;

            client.from('hdd_game_metrics').insert({
                patient_id: _moodState.patientId || 'DEMO',
                game_slug: ctx === 'game' ? (gameSlug + '_mood') : (ctx + '_mood'),
                metric_type: 'satisfaction_color',
                metric_value: valence,
                metric_data: {
                    color: data.color,
                    color_name: data.color_name,
                    context_type: ctx,
                    valence: valence,
                    source_activity: gameSlug
                },
                created_at: now
            }).then(function(){}).catch(function(){});
        }
    } catch(e) {}
}

// ====================================================================
// PRE-GAME CHAT — llamar manualmente desde startGame()/beginGame()
// ====================================================================
function showPreGameChat() {
    var today = new Date().toISOString().split('T')[0];
    if (_moodStorageGet('mood_pregame_done_' + today)) return;
    if (document.getElementById('mood-pre-overlay')) return;

    var urlParams = new URLSearchParams(window.location.search);
    _moodState.patientId = urlParams.get('patient_id') || _moodStorageGet('hdd_patient_id') || 'DEMO';
    _moodState.gameSlug = window.location.pathname.split('/').pop().replace('.html','');
    _moodState.step = 0;
    _moodState.responses = [];

    var overlay = document.createElement('div');
    overlay.id = 'mood-pre-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:mfadeIn .3s ease';

    var card = document.createElement('div');
    card.style.cssText = 'position:relative;background:#1e293b;border-radius:20px;padding:28px 24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);text-align:center;color:#e2e8f0;font-family:system-ui,sans-serif';

    var questions = [
        { q: '¡Hola! ¿Cómo estás hoy?', placeholder: 'Bien, más o menos, cansado/a...', input: true },
        { q: '¿Descansaste bien anoche?', placeholder: 'Sí, no mucho, regular...', input: true },
        { q: '¡Genial! ¿Listo/a para empezar?', placeholder: null, input: false }
    ];

    function dismiss() {
        _moodStorageSet('mood_pregame_done_' + today, 'done');
        overlay.style.animation = 'mfadeOut .25s ease forwards';
        setTimeout(function() { overlay.remove(); }, 300);
    }

    function renderStep() {
        var s = questions[_moodState.step];
        card.innerHTML = '';

        // X button siempre presente
        var xBtn = document.createElement('button');
        xBtn.innerHTML = '✕';
        xBtn.title = 'Saltar';
        xBtn.style.cssText = 'position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.9rem;line-height:1;display:flex;align-items:center;justify-content:center;';
        xBtn.onclick = function() {
            _moodSaveToSupabase('pre_game', { responses: _moodState.responses, skipped: true });
            dismiss();
        };
        card.appendChild(xBtn);

        var qEl = document.createElement('p');
        qEl.style.cssText = 'font-size:1.1rem;font-weight:600;margin:0 0 16px;line-height:1.4;padding-top:8px';
        qEl.textContent = s.q;
        card.appendChild(qEl);

        if (s.input) {
            var inp = document.createElement('input');
            inp.type = 'text';
            inp.placeholder = s.placeholder;
            inp.style.cssText = 'width:100%;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#e2e8f0;font-size:0.95rem;outline:none;box-sizing:border-box;margin-bottom:14px';
            inp.id = 'mood-input';
            card.appendChild(inp);

            var row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;justify-content:center';

            var skipBtn = document.createElement('button');
            skipBtn.textContent = 'Saltar';
            skipBtn.style.cssText = 'padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.85rem';
            skipBtn.onclick = function() { _moodState.responses.push('(saltado)'); _moodState.step++; renderStep(); };

            var nextBtn = document.createElement('button');
            nextBtn.textContent = 'Siguiente →';
            nextBtn.style.cssText = 'padding:10px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600';
            nextBtn.onclick = function() {
                var val = document.getElementById('mood-input').value.trim() || '(sin respuesta)';
                _moodState.responses.push(val);
                _moodState.step++;
                renderStep();
            };

            row.appendChild(skipBtn);
            row.appendChild(nextBtn);
            card.appendChild(row);
            setTimeout(function() { inp.focus(); }, 100);
        } else {
            var playBtn = document.createElement('button');
            playBtn.textContent = '¡Empezar!';
            playBtn.style.cssText = 'padding:14px 36px;border-radius:14px;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;cursor:pointer;font-size:1.05rem;font-weight:700;margin-top:8px';
            playBtn.onclick = function() {
                _moodSaveToSupabase('pre_game', { responses: _moodState.responses });
                dismiss();
            };
            card.appendChild(playBtn);
        }
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    renderStep();

    if (!document.getElementById('mood-css')) {
        var css = document.createElement('style');
        css.id = 'mood-css';
        css.textContent = '@keyframes mfadeIn{from{opacity:0}to{opacity:1}}@keyframes mfadeOut{from{opacity:1}to{opacity:0}}';
        document.head.appendChild(css);
    }
}

// ====================================================================
// POST-ACTIVIDAD COLOR PICKER — medida de satisfacción universal
// Funciona para: juego, chat clínico, telemedicina, taller grupal, etc.
//
// Uso desde juego:
//   showPostGameColorModal()                             // contexto auto-detectado
//
// Uso desde telemedicina / chat / taller:
//   showSatisfactionColor({ context: 'telemedicina', session_id: '...' })
//   showSatisfactionColor({ context: 'taller_grupal', room: 'Sala B' })
//   showSatisfactionColor({ context: 'chat_clinico' })
// ====================================================================

/**
 * Muestra el selector de color post-actividad.
 * @param {object} opts  - context: string ('game'|'telemedicina'|'taller_grupal'|'chat_clinico'|otro)
 *                       - cualquier campo extra se guarda en metric_data
 * @param {function} onDone - callback opcional cuando el paciente elige
 */
function showSatisfactionColor(opts, onDone) {
    opts = opts || {};
    if (document.getElementById('mood-color-overlay')) return;

    var context = opts.context || 'game';
    var contextLabels = {
        'game':          'la actividad',
        'telemedicina':  'la teleconsulta',
        'taller_grupal': 'el taller',
        'chat_clinico':  'la conversación',
        'consulta':      'la consulta'
    };
    var actLabel = contextLabels[context] || 'la actividad';

    var overlay = document.createElement('div');
    overlay.id = 'mood-color-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:mfadeIn .3s ease';

    var card = document.createElement('div');
    card.style.cssText = 'background:#1e293b;border-radius:20px;padding:28px 24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);text-align:center;color:#e2e8f0;font-family:system-ui,sans-serif';

    card.innerHTML =
        '<p style="font-size:0.78rem;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.35);margin:0 0 6px;">¿Cómo te sentiste en ' + actLabel + '?</p>' +
        '<p style="font-size:1.05rem;font-weight:600;margin:0 0 18px;">Elegí un color que lo represente</p>' +
        '<div id="mood-color-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;"></div>' +
        '<button id="mood-color-skip" style="padding:8px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.38);cursor:pointer;font-size:0.8rem;">Omitir</button>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var grid = document.getElementById('mood-color-grid');
    MOOD_COLORS.forEach(function(c) {
        var swatch = document.createElement('div');
        swatch.style.cssText = 'width:52px;height:52px;border-radius:14px;cursor:pointer;border:3px solid transparent;transition:all .18s;margin:0 auto;background:' + c.hex;
        swatch.title = c.name;
        swatch.onmouseover = function() { swatch.style.transform = 'scale(1.18)'; swatch.style.borderColor = 'rgba(255,255,255,0.4)'; };
        swatch.onmouseout  = function() { swatch.style.transform = 'scale(1)';    swatch.style.borderColor = 'transparent'; };
        swatch.onclick = function() {
            var payload = Object.assign({}, opts, { color: c.hex, color_name: c.name, skipped: false });
            _moodSaveToSupabase('satisfaction_color', payload, context);
            closeColorModal();
            if (typeof onDone === 'function') onDone({ color: c.hex, color_name: c.name, context: context });
        };
        grid.appendChild(swatch);
    });

    document.getElementById('mood-color-skip').onclick = function() {
        var payload = Object.assign({}, opts, { color: null, skipped: true });
        _moodSaveToSupabase('satisfaction_color', payload, context);
        closeColorModal();
        if (typeof onDone === 'function') onDone({ skipped: true, context: context });
    };

    function closeColorModal() {
        overlay.style.animation = 'mfadeOut .25s ease forwards';
        setTimeout(function() { overlay.remove(); }, 300);
    }
}

// Alias para compatibilidad con llamadas existentes desde los juegos
function showPostGameColorModal() { showSatisfactionColor({ context: 'game' }); }

// ====================================================================
// initMoodModals — ya no hace nada automatico. 
// Compatible con llamadas existentes pero no dispara el modal.
// ====================================================================
function initMoodModals() {
    // v7: no-op. Los juegos llaman showPreGameChat() manualmente.
}
