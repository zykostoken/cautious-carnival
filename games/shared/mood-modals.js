// ====================================================================
// MOOD MODALS v5.0 - Clínica José Ingenieros
// Self-contained overlays. No external HTML. Supabase persistence.
// Pre-game: conversational chat. Post-game: Lüscher 12-color picker.
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
// SUPABASE SAVE
// ====================================================================
function _moodSaveToSupabase(type, data) {
    try {
        var sb = window.supabase;
        if (!sb) return;
        var client = sb.createClient(
            'https://yqpqfzvgcmvxvqzvtajx.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHFmenZnY212eHZxenZ0YWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1OTMzODksImV4cCI6MjA2NTE2OTM4OX0.jM2YEBXQ0YFwFOBu3mGbU3NxCez29x8RKYYDV2d8snk'
        );
        client.from('hdd_mood_entries').insert({
            patient_id: _moodState.patientId || 'DEMO',
            game_slug: _moodState.gameSlug || window.location.pathname.split('/').pop().replace('.html',''),
            entry_type: type,
            data: data,
            created_at: new Date().toISOString()
        }).then(function(){}).catch(function(){});
    } catch(e) {}
}

// ====================================================================
// PRE-GAME CHAT
// ====================================================================
function showPreGameChat() {
    // Never skip — mood check is clinically required
    var today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('mood_pregame_done_' + today)) return;

    var urlParams = new URLSearchParams(window.location.search);
    _moodState.patientId = urlParams.get('patient_id') || localStorage.getItem('hdd_patient_id') || 'DEMO';
    _moodState.gameSlug = window.location.pathname.split('/').pop().replace('.html','');
    _moodState.step = 0;
    _moodState.responses = [];

    if (document.getElementById('mood-pre-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'mood-pre-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:mfadeIn .3s ease';

    var card = document.createElement('div');
    card.style.cssText = 'background:#1e293b;border-radius:20px;padding:28px 24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);text-align:center;color:#e2e8f0;font-family:system-ui,sans-serif';

    var questions = [
        { q: '¡Hola! ¿Cómo estás hoy? 😊', placeholder: 'Bien, más o menos, cansado/a...', input: true },
        { q: '¿Descansaste bien anoche? 😴', placeholder: 'Sí, no mucho, regular...', input: true },
        { q: '¡Genial! ¿Listo/a para jugar? 🎮', placeholder: null, input: false }
    ];

    function renderStep() {
        var s = questions[_moodState.step];
        card.innerHTML = '';

        var qEl = document.createElement('p');
        qEl.style.cssText = 'font-size:1.15rem;font-weight:600;margin:0 0 16px;line-height:1.4';
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
            // Final step — play button
            var playBtn = document.createElement('button');
            playBtn.textContent = '¡Dale, a jugar! 🚀';
            playBtn.style.cssText = 'padding:14px 36px;border-radius:14px;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;cursor:pointer;font-size:1.05rem;font-weight:700;margin-top:8px';
            playBtn.onclick = function() {
                localStorage.setItem('mood_pregame_done_' + today, 'true');
                _moodSaveToSupabase('pre_game', { responses: _moodState.responses, questions: questions.map(function(q){return q.q;}) });
                overlay.style.animation = 'mfadeOut .25s ease forwards';
                setTimeout(function() { overlay.remove(); }, 300);
            };
            card.appendChild(playBtn);
        }
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    renderStep();

    // CSS animations
    if (!document.getElementById('mood-css')) {
        var css = document.createElement('style');
        css.id = 'mood-css';
        css.textContent = '@keyframes mfadeIn{from{opacity:0}to{opacity:1}}@keyframes mfadeOut{from{opacity:1}to{opacity:0}}';
        document.head.appendChild(css);
    }
}

// ====================================================================
// POST-GAME COLOR PICKER
// ====================================================================
function showPostGameColorModal() {
    if (document.getElementById('mood-color-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'mood-color-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:mfadeIn .3s ease';

    var card = document.createElement('div');
    card.style.cssText = 'background:#1e293b;border-radius:20px;padding:28px 24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);text-align:center;color:#e2e8f0;font-family:system-ui,sans-serif';

    card.innerHTML = '<p style="font-size:1.1rem;font-weight:600;margin:0 0 18px;">¿Querés elegir un color? 🎨</p>' +
        '<div id="mood-color-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;"></div>' +
        '<button id="mood-color-skip" style="padding:8px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.82rem;">No, gracias</button>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var grid = document.getElementById('mood-color-grid');
    MOOD_COLORS.forEach(function(c) {
        var swatch = document.createElement('div');
        swatch.style.cssText = 'width:52px;height:52px;border-radius:14px;cursor:pointer;border:3px solid transparent;transition:all .2s;margin:0 auto;background:' + c.hex;
        swatch.title = c.name;
        swatch.onmouseover = function() { swatch.style.transform = 'scale(1.15)'; };
        swatch.onmouseout = function() { swatch.style.transform = 'scale(1)'; };
        swatch.onclick = function() {
            _moodSaveToSupabase('post_game_color', { color: c.hex, color_name: c.name });
            closeColorModal();
        };
        grid.appendChild(swatch);
    });

    document.getElementById('mood-color-skip').onclick = function() {
        _moodSaveToSupabase('post_game_color', { color: null, skipped: true });
        closeColorModal();
    };

    function closeColorModal() {
        overlay.style.animation = 'mfadeOut .25s ease forwards';
        setTimeout(function() { overlay.remove(); }, 300);
    }
}

// ====================================================================
// AUTO-INIT
// ====================================================================
function initMoodModals() {
    setTimeout(function() { showPreGameChat(); }, 400);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMoodModals);
} else {
    initMoodModals();
}
