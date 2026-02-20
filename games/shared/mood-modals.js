// ====================================================================
// MOOD MODALS v4.0 - Clínica José Ingenieros
// NON-INTRUSIVE OVERLAY SYSTEM (self-contained, no external HTML needed)
// 
// Pre-game:  Conversational chat overlay (doesn't block game init)
// Post-game: Simple color picker overlay (12 Lüscher colors)
// ====================================================================

var MOOD_COLORS = [
    { hex: '#FF0000', family: 'red' },
    { hex: '#FF8C00', family: 'orange' },
    { hex: '#FFD700', family: 'yellow' },
    { hex: '#008000', family: 'green' },
    { hex: '#00CED1', family: 'turquoise' },
    { hex: '#87CEEB', family: 'sky_blue' },
    { hex: '#00008B', family: 'dark_blue' },
    { hex: '#800080', family: 'violet' },
    { hex: '#FF69B4', family: 'pink' },
    { hex: '#8B4513', family: 'brown' },
    { hex: '#808080', family: 'grey' },
    { hex: '#000000', family: 'black' }
];

var _moodState = { step: 0, responses: [], patientId: null };

// ====================================================================
// PRE-GAME CHAT
// ====================================================================

var _moodQuestions = [
    "¡Hola! ¿Cómo estás hoy?",
    "¿Descansaste bien anoche?",
    "¡Bien! ¿Listo/a para jugar?"
];

function showPreGameChat() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') return;

    var today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('hdd_portal_checkin_date') === today) return;
    if (localStorage.getItem('mood_pregame_done_' + today)) return;

    _moodState.patientId = urlParams.get('patient_id') || 
        localStorage.getItem('hdd_patient_id') || urlParams.get('token');
    _moodState.step = 0;
    _moodState.responses = [];

    if (document.getElementById('mood-pre-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'mood-pre-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = 
        '<div style="background:#1a1a2e;border-radius:20px;padding:30px;max-width:420px;width:90%;color:#eee;font-family:system-ui,sans-serif;">' +
            '<div id="mood-chat-area" style="min-height:100px;margin-bottom:16px;"></div>' +
            '<div id="mood-input-area" style="display:none;">' +
                '<input id="mood-input" type="text" placeholder="Escribí acá..." ' +
                    'style="width:100%;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:15px;box-sizing:border-box;" autocomplete="off">' +
                '<div style="display:flex;gap:8px;margin-top:10px;">' +
                    '<button id="mood-send-btn" style="flex:1;padding:10px;border-radius:10px;border:none;background:#4CAF50;color:#fff;font-size:14px;cursor:pointer;">Enviar</button>' +
                    '<button id="mood-skip-btn" style="padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;">Saltar</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('mood-send-btn').addEventListener('click', submitMoodResponse);
    document.getElementById('mood-skip-btn').addEventListener('click', skipPreGame);
    document.getElementById('mood-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitMoodResponse(); });

    showMoodQuestion();
}

function showMoodQuestion() {
    if (_moodState.step >= _moodQuestions.length) {
        finishPreGame();
        return;
    }

    var area = document.getElementById('mood-chat-area');
    if (!area) return;

    var bubble = document.createElement('div');
    bubble.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:16px 16px 16px 4px;padding:12px 16px;margin:8px 0;max-width:85%;';
    bubble.textContent = _moodQuestions[_moodState.step];
    area.appendChild(bubble);
    area.scrollTop = area.scrollHeight;

    // Last question = play button instead of input
    if (_moodState.step === _moodQuestions.length - 1) {
        var btnArea = document.getElementById('mood-input-area');
        if (btnArea) {
            btnArea.style.display = 'block';
            btnArea.innerHTML = '<button id="mood-play-btn" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#4CAF50,#45a049);color:#fff;font-size:16px;cursor:pointer;font-weight:600;">¡Dale, a jugar!</button>';
            document.getElementById('mood-play-btn').addEventListener('click', finishPreGame);
        }
        return;
    }

    setTimeout(function() {
        var inputArea = document.getElementById('mood-input-area');
        var input = document.getElementById('mood-input');
        if (inputArea) inputArea.style.display = 'block';
        if (input) { input.value = ''; input.focus(); }
    }, 400);
}

function submitMoodResponse() {
    var input = document.getElementById('mood-input');
    if (!input || !input.value.trim()) return;

    var response = input.value.trim();
    var area = document.getElementById('mood-chat-area');
    if (area) {
        var bubble = document.createElement('div');
        bubble.style.cssText = 'background:rgba(76,175,80,0.2);border:1px solid rgba(76,175,80,0.3);border-radius:16px 16px 4px 16px;padding:12px 16px;margin:8px 0;max-width:85%;margin-left:auto;text-align:right;';
        bubble.textContent = response;
        area.appendChild(bubble);
        area.scrollTop = area.scrollHeight;
    }

    _moodState.responses.push({ q: _moodQuestions[_moodState.step], a: response });
    var inputArea = document.getElementById('mood-input-area');
    if (inputArea) inputArea.style.display = 'none';
    _moodState.step++;
    setTimeout(showMoodQuestion, 500);
}

function skipPreGame() {
    _moodState.responses = [{ q: 'skipped', a: 'skipped' }];
    finishPreGame();
}

function finishPreGame() {
    var today = new Date().toISOString().split('T')[0];
    localStorage.setItem('mood_pregame_done_' + today, '1');

    if (_moodState.patientId && _moodState.responses.length) {
        fetch('/api/hdd/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mood_checkin', patient_id: _moodState.patientId,
                phase: 'pre', chat_responses: _moodState.responses,
                timestamp: new Date().toISOString()
            })
        }).catch(function() {});
    }

    var overlay = document.getElementById('mood-pre-overlay');
    if (overlay) overlay.remove();
}

// ====================================================================
// POST-GAME COLOR
// ====================================================================

function showPostGameColorModal(callback) {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        if (callback) callback();
        return;
    }
    if (document.getElementById('mood-post-overlay')) return;

    if (callback) window._postColorCallback = callback;

    _moodState.patientId = _moodState.patientId || 
        urlParams.get('patient_id') || localStorage.getItem('hdd_patient_id') || urlParams.get('token');

    var colorsHtml = MOOD_COLORS.map(function(c) {
        var border = c.hex === '#000000' ? 'border:2px solid rgba(255,255,255,0.3);' : '';
        return '<div class="mood-color-tile" data-hex="' + c.hex + '" style="width:56px;height:56px;border-radius:50%;background:' + c.hex + ';cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;' + border + '"></div>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.id = 'mood-post-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = 
        '<div style="background:#1a1a2e;border-radius:20px;padding:30px;max-width:420px;width:90%;color:#eee;text-align:center;font-family:system-ui,sans-serif;">' +
            '<p style="font-size:18px;margin:0 0 6px;">¿Querés elegir un color?</p>' +
            '<p style="font-size:13px;color:rgba(255,255,255,0.4);margin:0 0 20px;">Elegí el que más te llame la atención</p>' +
            '<div id="mood-color-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;justify-items:center;margin-bottom:20px;">' + colorsHtml + '</div>' +
            '<p style="font-size:11px;color:rgba(255,255,255,0.25);margin:0 0 12px;">No hay respuestas correctas ni incorrectas</p>' +
            '<button id="mood-post-skip" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;">Saltar</button>' +
        '</div>';
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.mood-color-tile').forEach(function(tile) {
        tile.addEventListener('click', function() { selectMoodColor(this.getAttribute('data-hex'), this); });
        tile.addEventListener('mouseover', function() { this.style.transform = 'scale(1.15)'; });
        tile.addEventListener('mouseout', function() { this.style.transform = 'scale(1)'; });
    });
    document.getElementById('mood-post-skip').addEventListener('click', skipPostGame);
}

function showPostGameIntensityModal() { showPostGameColorModal(); }

function selectMoodColor(hex, el) {
    document.querySelectorAll('.mood-color-tile').forEach(function(t) { t.style.boxShadow = 'none'; t.style.transform = 'scale(1)'; });
    if (el) { el.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.8)'; el.style.transform = 'scale(1.2)'; }

    var colorInfo = MOOD_COLORS.find(function(c) { return c.hex === hex; }) || {};
    if (_moodState.patientId) {
        fetch('/api/hdd/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mood_checkin', patient_id: _moodState.patientId,
                phase: 'post', color_hex: hex, color_family: colorInfo.family || 'unknown',
                timestamp: new Date().toISOString()
            })
        }).catch(function() {});
    }

    setTimeout(function() {
        var overlay = document.getElementById('mood-post-overlay');
        if (overlay) overlay.remove();
        if (typeof window._postColorCallback === 'function') {
            window._postColorCallback();
            window._postColorCallback = null;
        }
    }, 600);
}

function skipPostGame() {
    var overlay = document.getElementById('mood-post-overlay');
    if (overlay) overlay.remove();
    if (typeof window._postColorCallback === 'function') {
        window._postColorCallback();
        window._postColorCallback = null;
    }
}

// ====================================================================
// INIT - non-blocking, self-contained
// ====================================================================
function initMoodModals() {
    setTimeout(showPreGameChat, 300);
}
