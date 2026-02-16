// ====================================================================
// MODAL SYSTEM: MOOD/COLOR TRACKING - Clínica José Ingenieros
// Version: 3.0 - 12 colores proyectivos
// 
// FLUJO:
//   PRE-GAME  → Preguntas: ánimo, sueño, apetito
//   GAME      → Juego normal
//   POST-GAME → "Según cómo te sentís, elegí un color" → 12 colores
//
// FUNDAMENTO: Lüscher Color Test, Heller (Psicología del color),
//   Boyatzis & Varghese (2003), Kaya & Epps (2004)
// 
// IMPORTANTE: El paciente NO ve nombres, etiquetas ni significados.
//   Solo colores puros. La interpretación es clínica y posterior.
// ====================================================================

// ── 12 COLORES PROYECTIVOS ──────────────────────────────────────────
// Criterios de selección:
//   1. Máxima diferenciación perceptual entre los 12
//   2. Cada color mapea a un estado emocional documentado
//   3. Equilibrio entre valencia positiva, negativa y neutra
//   4. Sin pares ambiguos (ej: NO dos verdes, NO dos azules similares)
//
// METADATA CLÍNICA (solo para dashboard/análisis, jamás para el paciente)

const MOOD_COLORS = [
    {
        hex: '#D32F2F',
        family: 'red',
        clinicalTags: ['ira', 'agitación', 'energía_alta', 'activación'],
        clinicalNote: 'Lüscher: activación simpática. Heller: poder, pasión, agresión.'
    },
    {
        hex: '#F57C00',
        family: 'orange',
        clinicalTags: ['optimismo', 'motivación', 'sociabilidad', 'entusiasmo'],
        clinicalNote: 'Heller: calidez social, extroversión. Kaya & Epps: energía positiva.'
    },
    {
        hex: '#FBC02D',
        family: 'yellow',
        clinicalTags: ['alegría', 'esperanza', 'claridad_mental', 'liviandad'],
        clinicalNote: 'Lüscher: expansión, liberación. Boyatzis: asociado a felicidad en adultos.'
    },
    {
        hex: '#388E3C',
        family: 'green',
        clinicalTags: ['calma', 'equilibrio', 'seguridad', 'estabilidad'],
        clinicalNote: 'Lüscher: tensión elástica, autoafirmación. Heller: naturaleza, salud, armonía.'
    },
    {
        hex: '#00897B',
        family: 'teal',
        clinicalTags: ['frescura', 'renovación', 'claridad_emocional', 'apertura'],
        clinicalNote: 'Intermedio verde-azul: combina calma del verde con profundidad del azul.'
    },
    {
        hex: '#1E88E5',
        family: 'blue_light',
        clinicalTags: ['serenidad', 'confianza', 'tranquilidad', 'receptividad'],
        clinicalNote: 'Lüscher: reposo, satisfacción. Heller: simpatía, fidelidad.'
    },
    {
        hex: '#1A237E',
        family: 'blue_dark',
        clinicalTags: ['tristeza', 'melancolía', 'introspección', 'profundidad'],
        clinicalNote: 'Lüscher: profundidad, concentración. Boyatzis: asociado a tristeza.'
    },
    {
        hex: '#7B1FA2',
        family: 'violet',
        clinicalTags: ['confusión', 'ambivalencia', 'transformación', 'inquietud'],
        clinicalNote: 'Lüscher: identificación mágica, deseo de fascinación. Heller: ambigüedad.'
    },
    {
        hex: '#D81B60',
        family: 'pink',
        clinicalTags: ['ternura', 'vulnerabilidad', 'necesidad_afectiva', 'sensibilidad'],
        clinicalNote: 'Heller: suavidad, delicadeza. Asociado a necesidad de contención.'
    },
    {
        hex: '#5D4037',
        family: 'brown',
        clinicalTags: ['cansancio', 'pesadez', 'necesidad_arraigo', 'agotamiento'],
        clinicalNote: 'Lüscher: bienestar corporal, sensorialidad. Heller: lo cotidiano, fatiga.'
    },
    {
        hex: '#78909C',
        family: 'grey',
        clinicalTags: ['apatía', 'neutralidad', 'desconexión', 'anhedonia'],
        clinicalNote: 'Lüscher: frontera, no participación. Heller: indiferencia, vacío afectivo.'
    },
    {
        hex: '#212121',
        family: 'black',
        clinicalTags: ['vacío', 'desesperanza', 'rechazo', 'negación'],
        clinicalNote: 'Lüscher: negación absoluta, extinción. Heller: final, poder, elegancia o muerte.'
    }
];

// Solo los hex para renderizar (el paciente ve SOLO esto)
const PALETTE_COLORS = MOOD_COLORS.map(c => c.hex);

let chatStep = 0;
let chatResponses = [];
let currentPatientId = null;
let gameMetrics = {};

// ====================================================================
// PHASE A: PRE-GAME - Preguntas ánimo, sueño, apetito
// ====================================================================

const chatQuestions = [
    "¿Cómo te sentís hoy?",
    "¿Cómo dormiste anoche?",
    "¿Cómo está tu apetito hoy?"
];

function initPreGameChat() {
    chatStep = 0;
    chatResponses = [];

    const urlParams = new URLSearchParams(window.location.search);
    currentPatientId = urlParams.get('patient_id') || localStorage.getItem('hdd_patient_id');

    showNextChatQuestion();
}

function showNextChatQuestion() {
    if (chatStep >= chatQuestions.length) {
        savePreGameData();
        startGame();
        return;
    }

    const question = chatQuestions[chatStep];
    appendMessage('bot', question);

    setTimeout(() => {
        const inputArea = document.getElementById('chat-input-area');
        const input = document.getElementById('chat-user-input');
        if (inputArea) inputArea.classList.remove('hidden');
        if (input) input.focus();
    }, 500);
}

function appendMessage(sender, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (sender === 'bot' ? 'bot-bubble' : 'user-bubble');
    bubble.innerHTML = '<p>' + text + '</p>';
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function submitChatResponse() {
    const input = document.getElementById('chat-user-input');
    if (!input) return;

    const response = input.value.trim();
    if (!response) return;

    appendMessage('user', response);

    chatResponses.push({
        question: chatQuestions[chatStep],
        answer: response
    });

    input.value = '';
    document.getElementById('chat-input-area').classList.add('hidden');

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
    const modal = document.getElementById('pre-game-chat-modal');
    if (modal) modal.classList.add('hidden');

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('hidden');

    if (typeof initGameLogic === 'function') {
        initGameLogic();
    } else if (typeof startGameTimer === 'function') {
        startGameTimer();
    }
}

// ====================================================================
// PHASE C: POST-GAME - 12 colores proyectivos (SIN paso de intensidad)
// ====================================================================

function showPostGameColorModal() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        alert('¡Juego completado! En modo demo no se registran métricas.');
        return;
    }

    renderColorPalette();
    document.getElementById('post-game-color-modal').classList.remove('hidden');
}

// Alias backward-compatible
function showPostGameIntensityModal() {
    showPostGameColorModal();
}

function renderColorPalette() {
    const grid = document.getElementById('color-palette-grid');
    if (!grid) return;

    grid.innerHTML = '';

    PALETTE_COLORS.forEach(function(hex) {
        const tile = document.createElement('div');
        tile.className = 'color-tile';
        tile.style.backgroundColor = hex;
        tile.addEventListener('click', function() {
            selectColor(hex, this);
        });
        grid.appendChild(tile);
    });
}

async function selectColor(colorHex, element) {
    // Visual feedback
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

    // Cerrar modal y mostrar métricas del juego
    setTimeout(function() {
        document.getElementById('post-game-color-modal').classList.add('hidden');
        if (typeof showMetricsModal === 'function') {
            showMetricsModal();
        } else if (typeof displayFinalMetrics === 'function') {
            displayFinalMetrics();
        }
    }, 800);
}

// ====================================================================
// HELPER: Actualizar métricas del juego (llamado por cada juego)
// ====================================================================

function updateGameMetrics(metrics) {
    gameMetrics = Object.assign({}, gameMetrics, metrics);
}

// ====================================================================
// INIT
// ====================================================================

window.addEventListener('DOMContentLoaded', function() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') !== 'true') {
        initPreGameChat();
    }
});
