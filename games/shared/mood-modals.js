// ====================================================================
// MODAL SYSTEM: MOOD/COLOR TRACKING - Clínica José Ingenieros
// Version: 3.1 - 12 colores proyectivos (fixed loading)
// 
// FLUJO:
//   PRE-GAME  → Preguntas: ánimo, sueño, apetito
//   GAME      → Juego normal
//   POST-GAME → "Según cómo te sentís, elegí un color" → 12 colores
//
// FUNDAMENTO: Lüscher Color Test (psicología funcional),
//   Heller (Psicología del color), Berlin & Kay,
//   Teoría de procesos oponentes
// ====================================================================

// ── 12 COLORES PROYECTIVOS ──────────────────────────────────────────
var MOOD_COLORS = [
    { hex: '#FF0000', family: 'red', clinicalTags: ['impulso', 'acción', 'energía_vital', 'irritabilidad', 'urgencia'] },
    { hex: '#FF8C00', family: 'orange', clinicalTags: ['sociabilidad', 'estímulo', 'apetito', 'energía_extrovertida'] },
    { hex: '#FFD700', family: 'yellow', clinicalTags: ['optimismo', 'futuro', 'esperanza', 'ansiedad_por_solución'] },
    { hex: '#008000', family: 'green', clinicalTags: ['autoafirmación', 'control', 'tenacidad', 'resistencia_cambio'] },
    { hex: '#00CED1', family: 'turquoise', clinicalTags: ['claridad_mental', 'distancia', 'barrera_defensiva', 'purificación'] },
    { hex: '#87CEEB', family: 'sky_blue', clinicalTags: ['despreocupación', 'relajación', 'fantasía_ligera', 'regresión'] },
    { hex: '#00008B', family: 'dark_blue', clinicalTags: ['paz', 'pertenencia', 'calma_profunda', 'vínculo_seguro'] },
    { hex: '#800080', family: 'violet', clinicalTags: ['sensibilidad', 'transformación', 'intuición', 'inmadurez_emocional'] },
    { hex: '#FF69B4', family: 'pink', clinicalTags: ['necesidad_afectiva', 'protección', 'ternura', 'vulnerabilidad'] },
    { hex: '#8B4513', family: 'brown', clinicalTags: ['somático', 'corporal', 'dolor_físico', 'agotamiento'] },
    { hex: '#808080', family: 'grey', clinicalTags: ['neutralidad', 'barrera', 'indiferencia', 'cansancio'] },
    { hex: '#000000', family: 'black', clinicalTags: ['negación', 'bloqueo', 'rechazo', 'protesta'] }
];

var PALETTE_COLORS = MOOD_COLORS.map(function(c) { return c.hex; });

var chatStep = 0;
var chatResponses = [];
var currentPatientId = null;
var gameMetrics = {};

// ====================================================================
// PHASE A: PRE-GAME - Preguntas ánimo, sueño, apetito
// ====================================================================

var chatQuestions = [
    "¿Cómo te sentís hoy?",
    "¿Cómo dormiste anoche?",
    "¿Cómo está tu apetito hoy?"
];

function initPreGameChat() {
    chatStep = 0;
    chatResponses = [];

    var urlParams = new URLSearchParams(window.location.search);
    currentPatientId = urlParams.get('patient_id') || localStorage.getItem('hdd_patient_id');

    // Show the modal (starts hidden in HTML)
    var modal = document.getElementById('pre-game-chat-modal');
    if (modal) modal.style.display = 'flex';

    showNextChatQuestion();
}

function showNextChatQuestion() {
    if (chatStep >= chatQuestions.length) {
        savePreGameData();
        startGame();
        return;
    }

    var question = chatQuestions[chatStep];
    appendMessage('bot', question);

    setTimeout(function() {
        var inputArea = document.getElementById('chat-input-area');
        var input = document.getElementById('chat-user-input');
        if (inputArea) inputArea.style.display = 'block';
        if (input) input.focus();
    }, 500);
}

function appendMessage(sender, text) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (sender === 'bot' ? 'bot-bubble' : 'user-bubble');
    bubble.innerHTML = '<p>' + text + '</p>';
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function submitChatResponse() {
    var input = document.getElementById('chat-user-input');
    if (!input) return;

    var response = input.value.trim();
    if (!response) return;

    appendMessage('user', response);
    chatResponses.push({ question: chatQuestions[chatStep], answer: response });

    input.value = '';
    var inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'none';

    chatStep++;
    setTimeout(showNextChatQuestion, 600);
}

function skipPreGameChat() {
    chatResponses = [{ question: 'skipped', answer: 'skipped' }];
    savePreGameData();
    startGame();
}

async function savePreGameData() {
    try {
        await fetch('/api/hdd/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mood_checkin',
                patient_id: currentPatientId,
                phase: 'pre',
                chat_responses: chatResponses,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Error saving pre-game data:', error);
    }
}

function startGame() {
    // Hide pre-game modal (style.display overrides inline style)
    var modal = document.getElementById('pre-game-chat-modal');
    if (modal) modal.style.display = 'none';

    // Show game container
    var gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('hidden');

    // Call game-specific init
    if (typeof initGameLogic === 'function') {
        initGameLogic();
    } else if (typeof startGameTimer === 'function') {
        startGameTimer();
    }
}

// ====================================================================
// PHASE C: POST-GAME - 12 colores proyectivos
// ====================================================================

function showPostGameColorModal() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        alert('¡Juego completado! En modo demo no se registran métricas.');
        return;
    }

    renderColorPalette();
    var modal = document.getElementById('post-game-color-modal');
    if (modal) modal.style.display = 'flex';
}

// Alias backward-compatible
function showPostGameIntensityModal() {
    showPostGameColorModal();
}

function renderColorPalette() {
    var grid = document.getElementById('color-palette-grid');
    if (!grid) return;

    grid.innerHTML = '';
    PALETTE_COLORS.forEach(function(hex) {
        var tile = document.createElement('div');
        tile.className = 'color-tile';
        tile.style.backgroundColor = hex;
        tile.addEventListener('click', function() {
            selectColor(hex, this);
        });
        grid.appendChild(tile);
    });
}

async function selectColor(colorHex, element) {
    document.querySelectorAll('.color-tile').forEach(function(t) {
        t.classList.remove('selected');
    });
    if (element) element.classList.add('selected');

    try {
        await fetch('/api/hdd/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mood_checkin',
                patient_id: currentPatientId,
                phase: 'post',
                color_hex: colorHex,
                color_family: (MOOD_COLORS.find(function(c) { return c.hex === colorHex; }) || {}).family || 'unknown',
                game_metrics: gameMetrics,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Error saving post-game color:', error);
    }

    setTimeout(function() {
        var modal = document.getElementById('post-game-color-modal');
        if (modal) modal.style.display = 'none';
        // Execute callback if set (e.g., redirect after color selection)
        if (typeof window._postColorCallback === 'function') {
            window._postColorCallback();
            window._postColorCallback = null;
        } else if (typeof showMetricsModal === 'function') {
            showMetricsModal();
        } else if (typeof displayFinalMetrics === 'function') {
            displayFinalMetrics();
        }
    }, 800);
}

// ====================================================================
// HELPER
// ====================================================================

function updateGameMetrics(metrics) {
    gameMetrics = Object.assign({}, gameMetrics, metrics);
}

// ====================================================================
// INIT - Works whether loaded statically or dynamically
// ====================================================================

function initMoodModals() {
    var urlParams = new URLSearchParams(window.location.search);
    var isDemo = urlParams.get('demo') === 'true';

    // Skip pre-game chat if portal already did daily checkin today
    var today = new Date().toISOString().split('T')[0];
    var portalCheckinDone = localStorage.getItem('hdd_portal_checkin_date') === today;

    if (isDemo || portalCheckinDone) {
        // Demo mode or already checked in today: skip chat, show game directly
        var preModal = document.getElementById('pre-game-chat-modal');
        if (preModal) preModal.style.display = 'none';
        var gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.classList.remove('hidden');
        // Call game-specific init
        if (typeof initGameLogic === 'function') {
            initGameLogic();
        } else if (typeof startGameTimer === 'function') {
            startGameTimer();
        }
    } else {
        var modal = document.getElementById('pre-game-chat-modal');
        if (modal) {
            initPreGameChat();
        } else {
            // HTML might still be loading, retry once
            setTimeout(function() {
                if (document.getElementById('pre-game-chat-modal')) {
                    initPreGameChat();
                }
            }, 150);
        }
    }
}

// Handle both static and dynamic script loading
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMoodModals);
} else {
    initMoodModals();
}
