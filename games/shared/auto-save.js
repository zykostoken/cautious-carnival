// ============================================================
// auto-save.js — Captura TOTAL de eventos de sesión de juego
// TODO a Supabase. Cada evento es una métrica clínica.
// ============================================================
// Eventos capturados:
// - tab_close (beforeunload) — cerró pestaña/browser
// - tab_hidden (visibilitychange) — cambió de pestaña
// - page_hide (pagehide) — navegó a otra página
// - connection_lost (offline event) — perdió internet
// - connection_restored (online event)
// - game_reset (manual) — el paciente reinició la partida
// - session_timeout — inactividad prolongada
// - error_crash — error JS no capturado
//
// Uso: window.registerAutoSave(getStateCallback)
//   callback() debe retornar { patient_id, patient_dni, game_slug, partial_data }
// Llamar window.gameEvent(type, extra) para eventos manuales (reset, etc)
// Llamar window.markAutoSaveComplete() después de save exitoso completo

(function() {
  'use strict';
  var _cb = null;
  var _savedFull = false;
  var _eventQueue = [];
  var _flushTimer = null;
  var _inactivityTimer = null;
  var INACTIVITY_MS = 5 * 60 * 1000; // 5 min sin actividad = timeout

  function getPatientInfo() {
    var dni = null;
    try { dni = new URLSearchParams(window.location.search).get('dni'); } catch(e) {}
    if (!dni) try { dni = localStorage.getItem('hdd_patient_dni'); } catch(e) {}
    return { dni: dni || null };
  }

  function saveEvent(eventType, extraData) {
    var info = getPatientInfo();
    if (!info.dni) return; // sin DNI no guardamos

    var state = _cb ? _cb() : {};
    var payload = {
      patient_id: null,
      patient_dni: info.dni,
      game_slug: state.game_slug || window.location.pathname.split('/').pop().replace('.html',''),
      metric_type: 'event_' + eventType,
      metric_value: state.partial_data ? (state.partial_data.score || 0) : 0,
      metric_data: Object.assign({}, state.partial_data || {}, extraData || {}, {
        event_type: eventType,
        timestamp: new Date().toISOString(),
        time_on_page_ms: performance.now ? Math.round(performance.now()) : 0,
        user_agent: navigator.userAgent,
        screen: window.innerWidth + 'x' + window.innerHeight
      }),
      session_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString()
    };

    // sendBeacon para eventos de cierre (más confiable que fetch)
    if (eventType === 'tab_close' || eventType === 'page_hide') {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify({ table: 'hdd_game_metrics', data: payload })], { type: 'application/json' });
        navigator.sendBeacon('/api/beacon-save', blob);
      }
    }

    // También insert directo vía Supabase client (para eventos en vida)
    try {
      var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
      if (client) {
        client.from('hdd_game_metrics').insert(payload)
          .then(function() { /* saved */ })
          .catch(function(e) { console.warn('[auto-save] ' + eventType + ':', e.message); });
      }
    } catch(e) {}
  }

  // === PUBLIC API ===

  window.registerAutoSave = function(callback) {
    _cb = callback;
    _savedFull = false;
    resetInactivityTimer();
  };

  window.markAutoSaveComplete = function() {
    _savedFull = true;
  };

  // Llamar para eventos manuales: gameEvent('reset'), gameEvent('level_skip'), etc.
  window.gameEvent = function(type, extra) {
    saveEvent(type, extra);
  };

  // === INACTIVITY TIMEOUT ===

  function resetInactivityTimer() {
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(function() {
      saveEvent('session_timeout', { inactivity_ms: INACTIVITY_MS });
    }, INACTIVITY_MS);
  }

  // Reset on any user interaction
  ['click','keydown','touchstart','mousemove','scroll'].forEach(function(evt) {
    document.addEventListener(evt, resetInactivityTimer, { passive: true, capture: true });
  });

  // === BROWSER EVENTS ===

  window.addEventListener('beforeunload', function() {
    if (!_savedFull) saveEvent('tab_close');
  });

  window.addEventListener('pagehide', function() {
    if (!_savedFull) saveEvent('page_hide');
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && !_savedFull) {
      saveEvent('tab_hidden');
    }
  });

  window.addEventListener('offline', function() {
    saveEvent('connection_lost');
  });

  window.addEventListener('online', function() {
    saveEvent('connection_restored');
  });

  // Capturar errores JS no manejados
  window.addEventListener('error', function(e) {
    saveEvent('error_crash', {
      error_message: e.message,
      error_file: e.filename,
      error_line: e.lineno
    });
  });

})();

