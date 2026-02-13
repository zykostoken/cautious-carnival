// ====================================================================
// MODAL SYSTEM: 3-PHASE MOOD/COLOR TRACKING
// Version: 2.0 - Mega Fix HDD
// Shared across all games: Pill Organizer, Lawn Mower, Medication Memory
// ====================================================================

const COLOR_PALETTES = {
    vivid: [
        '#FF0000', // Rojo intenso
        '#DC143C', // Carmesí
        '#FF8C00', // Naranja
        '#FFD700', // Amarillo dorado
        '#00FF00', // Verde brillante
        '#32CD32', // Verde lima
        '#0000FF', // Azul puro
        '#1E90FF', // Azul dodger
        '#8B00FF', // Violeta
        '#FF00FF', // Magenta
        '#8B4513', // Marrón
        '#696969'  // Gris oscuro
    ],
    soft: [
        '#FFB6C1', // Rosa suave
        '#FF69B4', // Rosa medio
        '#FFA07A', // Salmón
        '#FFDAB9', // Durazno
        '#90EE90', // Verde suave
        '#98FB98', // Verde pálido
        '#87CEEB', // Azul cielo
        '#87CEFA', // Azul cielo claro
        '#DDA0DD', // Ciruela
        '#FF69B4', // Rosa hot
        '#CD853F', // Marrón claro
        '#A9A9A9'  // Gris medio
    ],
    pastel: [
        '#FFE4E1', // Rosa neblina
        '#F08080', // Coral claro
        '#FFDEAD', // Blanco navajo
        '#F0E68C', // Khaki
        '#E0FFE0', // Verde menta
        '#F0FFF0', // Rocío de miel
        '#E6E6FA', // Lavanda
        '#B0E0E6', // Azul polvo
        '#DDA0DD', // Ciruela claro
        '#FFB6C1', // Rosa claro
        '#D2B48C', // Tan
        '#D3D3D3'  // Gris claro
    ],
    dark: [
        '#8B0000', // Rojo oscuro
        '#800020', // Burgundy
        '#FF4500', // Rojo naranja
        '#B8860B', // Oro oscuro
        '#006400', // Verde oscuro
        '#2F4F4F', // Gris pizarra oscuro
        '#00008B', // Azul oscuro
        '#191970', // Azul medianoche
        '#4B0082', // Índigo
        '#8B008B', // Magenta oscuro
        '#654321', // Marrón oscuro
        '#2F4F4F'  // Gris pizarra
    ],
    muted: [
        '#BC8F8F', // Rosa marrón
        '#CD5C5C', // Rojo indio
        '#D2691E', // Chocolate
        '#DAA520', // Vara de oro
        '#8FBC8F', // Verde mar oscuro
        '#66CDAA', // Aguamarina medio
        '#4682B4', // Azul acero
        '#5F9EA0', // Cadet blue
        '#9370DB', // Púrpura medio
        '#BA55D3', // Orquídea medio
        '#A0522D', // Siena
        '#808080'  // Gris
    ]
};

let chatStep = 0;
let chatResponses = [];
let selectedIntensity = null;
let currentPatientId = null;
let gameMetrics = {};

// ====================================================================
// PHASE A: PRE-GAME CONVERSATIONAL CHAT
// ====================================================================

const chatQuestions = [
    "¿Cómo estás hoy?",
    "¿Qué desayunaste o almorzaste?",
    "¿Cómo dormiste anoche?"
];

function initPreGameChat() {
    chatStep = 0;
    chatResponses = [];
    
    // Get patient ID from URL or session
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
        document.getElementById('chat-input-area').classList.remove('hidden');
        document.getElementById('chat-user-input').focus();
    }, 500);
}

function appendMessage(sender, text) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) {
        console.error('❌ chat-messages container not found');
        return;
    }
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender === 'bot' ? 'bg-purple-600/20' : 'bg-emerald-600/20'}`;
    bubble.innerHTML = `<p class="text-white text-lg">${sender === 'bot' ? '🤖' : '👤'} ${text}</p>`;
    messagesContainer.appendChild(bubble);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
    setTimeout(showNextChatQuestion, 800);
}

function skipPreGameChat() {
    chatResponses = [{ question: 'skipped', answer: 'skipped' }];
    savePreGameData();
    startGame();
}

async function savePreGameData() {
    try {
        const response = await fetch('/api/hdd/games', {
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
        
        const data = await response.json();
        console.log('✅ Pre-game data saved:', data);
    } catch (error) {
        console.error('❌ Error saving pre-game data:', error);
    }
}

function startGame() {
    const modal = document.getElementById('pre-game-chat-modal');
    if (modal) modal.classList.add('hidden');
    
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) gameContainer.classList.remove('hidden');
    
    // Call game-specific initialization
    if (typeof initGameLogic === 'function') {
        initGameLogic();
    } else if (typeof startGameTimer === 'function') {
        startGameTimer();
    }
}

// ====================================================================
// PHASE C: POST-GAME INTENSITY + COLOR SELECTION
// ====================================================================

function showPostGameIntensityModal() {
    document.getElementById('post-game-intensity-modal').classList.remove('hidden');
}

function selectPostIntensity(intensity) {
    selectedIntensity = intensity;
    
    // Visual feedback
    document.querySelectorAll('.intensity-circle').forEach(circle => {
        circle.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Proceed to color palette after short delay
    setTimeout(() => {
        document.getElementById('post-game-intensity-modal').classList.add('hidden');
        showColorPaletteModal(intensity);
    }, 600);
}

function showColorPaletteModal(intensity) {
    const paletteGrid = document.getElementById('color-palette-grid');
    if (!paletteGrid) {
        console.error('❌ color-palette-grid not found');
        return;
    }
    
    paletteGrid.innerHTML = '';

    const colors = COLOR_PALETTES[intensity];
    
    colors.forEach(color => {
        const tile = document.createElement('div');
        tile.className = 'color-tile';
        tile.style.backgroundColor = color;
        tile.onclick = () => selectColor(color);
        paletteGrid.appendChild(tile);
    });

    document.getElementById('post-game-color-modal').classList.remove('hidden');
}

async function selectColor(colorHex) {
    // Visual feedback
    event.currentTarget.classList.add('selected');

    // Save to backend
    try {
        const response = await fetch('/api/hdd/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'mood_checkin',
                patient_id: currentPatientId,
                phase: 'post',
                intensity: selectedIntensity,
                color_hex: colorHex,
                game_metrics: gameMetrics,
                timestamp: new Date().toISOString()
            })
        });

        const data = await response.json();
        console.log('✅ Post-game data saved:', data);

        // Close modal and show metrics
        setTimeout(() => {
            document.getElementById('post-game-color-modal').classList.add('hidden');
            
            // Call game-specific metrics display
            if (typeof showMetricsModal === 'function') {
                showMetricsModal();
            } else if (typeof displayFinalMetrics === 'function') {
                displayFinalMetrics();
            }
        }, 800);

    } catch (error) {
        console.error('❌ Error saving post-game data:', error);
    }
}

// ====================================================================
// HELPER: Update Game Metrics (called by individual games)
// ====================================================================

function updateGameMetrics(metrics) {
    gameMetrics = { ...gameMetrics, ...metrics };
}

// ====================================================================
// INITIALIZATION
// ====================================================================

window.addEventListener('DOMContentLoaded', () => {
    // Only show pre-game chat if NOT in demo mode
    const urlParams = new URLSearchParams(window.location.search);
    const isDemoMode = urlParams.get('demo') === 'true';
    
    if (!isDemoMode) {
        initPreGameChat();
    }
});
