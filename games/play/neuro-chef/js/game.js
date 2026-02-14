// ========== GAME ENGINE - NEURO-CHEF ==========

// ========== INITIALIZATION ==========
async function initGame() {
    console.log('[Neuro-Chef] Initializing game...');
    
    // Simular paciente (en producción vendría del auth)
    gameState.patientDni = 'HDD-2026-DEMO';
    gameState.patientId = await getOrCreatePatient(gameState.patientDni);
    
    document.getElementById('patient-display').textContent = `Paciente: Cargando...`;
    
    // Obtener game_id desde Supabase
    const { data: game } = await supabase
        .from('hdd_games')
        .select('id')
        .eq('slug', 'neuro-chef-v2')
        .single();
    
    gameState.gameId = game?.id || null;
    
    if (!gameState.gameId) {
        console.warn('[Neuro-Chef] Game ID not found in Supabase');
    }
    
    // Detectar modo demo
    const urlParams = new URLSearchParams(window.location.search);
    const isDemoMode = urlParams.get('demo') === 'true';
    
    if (isDemoMode) {
        // Modo demo: saltar modal pre-game
        document.getElementById('pre-game-modal').classList.add('hidden');
        startGame();
    } else {
        // Modo normal: mostrar modal pre-game
        setupPreGameModal();
    }
}

async function getOrCreatePatient(dni) {
    const { data: existing } = await supabase
        .from('hdd_patients')
        .select('id')
        .eq('dni', dni)
        .single();
    
    if (existing) return existing.id;
    
    const { data: newPatient } = await supabase
        .from('hdd_patients')
        .insert({ 
            dni: dni,
            full_name: 'Paciente Demo Neuro-Chef',
            admission_date: new Date().toISOString().split('T')[0]
        })
        .select('id')
        .single();
    
    return newPatient?.id;
}

// ========== PRE-GAME MODAL ==========
function setupPreGameModal() {
    const btnSkip = document.getElementById('btn-skip-pre');
    
    btnSkip.addEventListener('click', () => {
        // Guardar respuestas vacías
        gameState.preMood = { q1: '', q2: '', q3: '' };
        
        // Cerrar modal y empezar juego
        document.getElementById('pre-game-modal').classList.add('hidden');
        startGame();
    });
    
    // Auto-submit al completar las 3 preguntas
    const inputs = ['q1', 'q2', 'q3'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('blur', () => {
            checkAllQuestionsAnswered();
        });
    });
}

function checkAllQuestionsAnswered() {
    const q1 = document.getElementById('q1').value.trim();
    const q2 = document.getElementById('q2').value.trim();
    const q3 = document.getElementById('q3').value.trim();
    
    if (q1 && q2 && q3) {
        // Guardar respuestas
        gameState.preMood = { q1, q2, q3 };
        
        // Auto-cerrar modal después de 500ms
        setTimeout(() => {
            document.getElementById('pre-game-modal').classList.add('hidden');
            startGame();
        }, 500);
    }
}

// ========== GAME START ==========
async function startGame() {
    console.log('[Neuro-Chef] Starting game session...');
    
    gameState.startTime = Date.now();
    gameState.currentLevel = 1;
    
    // Crear sesión en Supabase
    const { data: session } = await supabase
        .from('hdd_game_sessions')
        .insert({
            patient_id: gameState.patientId,
            game_id: gameState.gameId,
            level: 1,
            started_at: new Date().toISOString()
        })
        .select('id')
        .single();
    
    gameState.sessionId = session?.id;
    
    // Guardar mood pre-game en Supabase
    if (gameState.preMood.q1) {
        await supabase.from('hdd_mood_checkins').insert({
            patient_id: gameState.patientId,
            context: 'pre_game_neuro_chef',
            mood_level: null,
            notes: JSON.stringify(gameState.preMood)
        });
    }
    
    // Mostrar game container
    document.getElementById('game-container').classList.remove('hidden');
    
    // Cargar nivel 1
    loadLevel(1);
    
    // Iniciar timer
    startTimer();
}

function startTimer() {
    const display = document.getElementById('timer-display');
    setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
    }, 1000);
}

// ========== LEVEL MANAGEMENT ==========
function loadLevel(levelNum) {
    console.log(`[Neuro-Chef] Loading level ${levelNum}`);
    
    gameState.currentLevel = levelNum;
    document.getElementById('current-level').textContent = `${levelNum}/6`;
    
    // Cargar nivel específico
    switch(levelNum) {
        case 1:
            loadLevel1_Supermercado();
            break;
        case 2:
            loadLevel2_Heladera();
            break;
        case 3:
            loadLevel3_Cocina();
            break;
        case 4:
            loadLevel4_Licuadora();
            break;
        case 5:
            loadLevel5_Mesa();
            break;
        case 6:
            loadLevel6_Habitacion();
            break;
        default:
            finishGame();
    }
}

function updateMetrics(correct = 0, errors = 0) {
    gameState.totalCorrect += correct;
    gameState.totalErrors += errors;
    
    document.getElementById('correct-count').textContent = gameState.totalCorrect;
    document.getElementById('error-count').textContent = gameState.totalErrors;
}

// ========== NIVEL 1: SUPERMERCADO ==========
function loadLevel1_Supermercado() {
    document.getElementById('level-title').textContent = 'Nivel 1: Supermercado';
    document.getElementById('level-description').innerHTML = 
        'Elegí los ingredientes para hacer un <strong>Pastel de Papas</strong>';
    
    const gameArea = document.getElementById('game-area');
    
    // Crear góndola con TODOS los alimentos mezclados
    const allFoods = Object.values(ALIMENTOS);
    const shuffled = shuffleArray(allFoods).slice(0, 24); // 24 productos
    
    gameArea.innerHTML = `
        <div class="gondola-container" id="gondola">
            ${shuffled.map(food => `
                <div class="food-item" draggable="true" data-id="${food.id}">
                    <img src="${food.imagen}" alt="${food.nombre}" loading="lazy">
                    <div class="label">${food.nombre}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="cart-container">
            <h3>🛒 Tu Carrito</h3>
            <div class="cart-grid" id="cart">
                ${Array(8).fill(0).map((_, i) => `
                    <div class="cart-slot" data-slot="${i}"></div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Setup drag & drop
    setupDragAndDrop();
    
    // Setup verify button
    document.getElementById('btn-verify').onclick = verifyLevel1;
    document.getElementById('btn-next').classList.add('hidden');
}

function verifyLevel1() {
    const cart = document.getElementById('cart');
    const slots = cart.querySelectorAll('.cart-slot');
    
    const selectedItems = [];
    slots.forEach(slot => {
        const item = slot.querySelector('.food-item');
        if (item) {
            selectedItems.push(item.dataset.id);
        }
    });
    
    const receta = RECETAS.pastel_papas;
    const required = receta.ingredientes_base;
    const optional = receta.ingredientes_opcionales;
    
    let correct = 0;
    let errors = 0;
    let missing = [];
    let wrong = [];
    
    // Verificar ingredientes requeridos
    required.forEach(ing => {
        if (selectedItems.includes(ing)) {
            correct++;
        } else {
            missing.push(ALIMENTOS[ing].nombre);
        }
    });
    
    // Verificar ingredientes incorrectos
    selectedItems.forEach(ing => {
        if (!required.includes(ing) && !optional.includes(ing)) {
            errors++;
            wrong.push(ALIMENTOS[ing].nombre);
        }
    });
    
    // Calcular score
    const score = Math.round((correct / (correct + errors + missing.length)) * 100);
    
    // Guardar métricas
    const levelMetric = {
        level: 1,
        level_name: 'supermercado',
        score: score,
        correct: correct,
        errors: errors,
        missing: missing,
        wrong: wrong,
        timestamp: new Date().toISOString()
    };
    
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    
    // Guardar en Supabase
    saveLevelMetrics(levelMetric);
    
    // Mostrar modal educativo
    showEducationalModal('nivel_1_supermercado', score, { 
        missing_ingredients: missing,
        wrong_items: wrong 
    });
}

// ========== NIVEL 2: HELADERA ==========
function loadLevel2_Heladera() {
    document.getElementById('level-title').textContent = 'Nivel 2: Heladera';
    document.getElementById('level-description').innerHTML = 
        'Guardá las compras en la heladera organizando por <strong>tipo y temperatura</strong>';
    
    const gameArea = document.getElementById('game-area');
    
    // Seleccionar 20 alimentos aleatorios
    const allFoods = Object.values(ALIMENTOS);
    const selected = shuffleArray(allFoods).slice(0, 20);
    
    gameArea.innerHTML = `
        <div class="heladera-container">
            <div class="bolsa-compras">
                <h3>🛍️ Bolsa de Compras</h3>
                <div class="bolsa-grid" id="bolsa">
                    ${selected.map(food => `
                        <div class="food-item" draggable="true" data-id="${food.id}">
                            <img src="${food.imagen}" alt="${food.nombre}" loading="lazy">
                            <div class="label">${food.nombre}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="heladera">
                <div class="heladera-zone">
                    <h4>🧊 FREEZER (-18°C)</h4>
                    <div class="zone-grid" id="zone-freezer" data-zone="freezer">
                        ${Array(4).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>❄️ ZONA FRÍA (2-4°C)</h4>
                    <div class="zone-grid" id="zone-fria" data-zone="fria">
                        ${Array(8).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>🌡️ CAJÓN VERDURAS (5-8°C)</h4>
                    <div class="zone-grid" id="zone-verduras" data-zone="verduras">
                        ${Array(6).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>📦 ALACENA (no va en heladera)</h4>
                    <div class="zone-grid" id="zone-afuera" data-zone="afuera">
                        ${Array(4).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setupDragAndDrop();
    
    document.getElementById('btn-verify').onclick = verifyLevel2;
}

function verifyLevel2() {
    const zones = ['freezer', 'fria', 'verduras', 'afuera'];
    let correct = 0;
    let errors = 0;
    const errorDetails = {};
    
    zones.forEach(zoneName => {
        const zone = document.getElementById(`zone-${zoneName}`);
        const slots = zone.querySelectorAll('.zone-slot');
        
        slots.forEach(slot => {
            const item = slot.querySelector('.food-item');
            if (item) {
                const foodId = item.dataset.id;
                const food = ALIMENTOS[foodId];
                
                if (food.zona_heladera === zoneName) {
                    correct++;
                    slot.classList.add('filled');
                    slot.classList.remove('error');
                } else {
                    errors++;
                    slot.classList.add('error');
                    
                    if (!errorDetails.wrong_zone) errorDetails.wrong_zone = [];
                    errorDetails.wrong_zone.push({
                        item: food.nombre,
                        zone: zoneName,
                        correct_zone: food.zona_heladera
                    });
                }
            }
        });
    });
    
    const score = Math.round((correct / (correct + errors)) * 100);
    
    const levelMetric = {
        level: 2,
        level_name: 'heladera',
        score: score,
        correct: correct,
        errors: errors,
        timestamp: new Date().toISOString()
    };
    
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    saveLevelMetrics(levelMetric);
    
    showEducationalModal('nivel_2_heladera', score, errorDetails);
}

// ========== DRAG & DROP ==========
function setupDragAndDrop() {
    const draggables = document.querySelectorAll('.food-item[draggable="true"]');
    const dropZones = document.querySelectorAll('.cart-slot, .zone-slot');
    
    draggables.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.outerHTML);
            e.target.style.opacity = '0.4';
        });
        
        item.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
        });
    });
    
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            // Solo permitir 1 item por slot
            if (zone.querySelector('.food-item')) return;
            
            const data = e.dataTransfer.getData('text/html');
            const temp = document.createElement('div');
            temp.innerHTML = data;
            const draggedItem = temp.firstChild;
            
            // Remover del origen
            const originalItem = document.querySelector(`.food-item[data-id="${draggedItem.dataset.id}"]`);
            if (originalItem) {
                originalItem.remove();
            }
            
            // Agregar al destino
            zone.appendChild(draggedItem);
            zone.classList.add('filled');
            
            // Re-setup drag para el nuevo elemento
            draggedItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.outerHTML);
                e.target.style.opacity = '0.4';
            });
        });
    });
}

// ========== EDUCATIONAL MODAL ==========
function showEducationalModal(levelId, score, errors = {}) {
    const modal = document.getElementById('educational-modal');
    const content = document.getElementById('educational-content');
    const scoreDisplay = document.getElementById('score-value');
    
    scoreDisplay.textContent = score;
    content.innerHTML = generateEducationalHTML(levelId, score, errors);
    
    modal.classList.remove('hidden');
    
    // Setup continue button
    document.getElementById('btn-continue').onclick = () => {
        modal.classList.add('hidden');
        
        // Siguiente nivel o post-game modal
        if (gameState.currentLevel < gameState.totalLevels) {
            loadLevel(gameState.currentLevel + 1);
        } else {
            showPostGameModal();
        }
    };
}

// ========== POST-GAME MODAL ==========
function showPostGameModal() {
    const modal = document.getElementById('post-game-modal');
    modal.classList.remove('hidden');
    
    // Mostrar directamente 12 colores fijos
    showColorSelectorDirect();
}

function showColorSelectorDirect() {
    const colorSelector = document.getElementById('color-selector');
    const colorGrid = colorSelector.querySelector('.color-grid');
    
    // 12 colores fijos sin intensidades
    const colors = [
        '#dc2626', '#ea580c', '#f59e0b', 
        '#eab308', '#84cc16', '#22c55e',
        '#06b6d4', '#3b82f6', '#6366f1',
        '#8b5cf6', '#ec4899', '#64748b'
    ];
    
    colorGrid.innerHTML = colors.map(hex => `
        <button class="color-btn" 
                data-color="${hex}" 
                style="width: 100%; aspect-ratio: 1; background: ${hex}; border: 3px solid transparent; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
        </button>
    `).join('');
    
    colorSelector.classList.remove('hidden');
    
    // Setup color selection
    const colorBtns = colorGrid.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            gameState.postMood.color = btn.dataset.color;
            gameState.postMood.intensity = null; // No intensity
            
            // Visual feedback
            colorBtns.forEach(b => {
                b.style.borderColor = 'transparent';
                b.style.transform = 'scale(1)';
            });
            btn.style.borderColor = '#fff';
            btn.style.boxShadow = '0 0 0 3px #fff, 0 0 0 5px ' + btn.dataset.color;
            btn.style.transform = 'scale(1.1)';
            
            // Guardar y finalizar después de 500ms
            setTimeout(() => {
                savePostMoodAndFinish();
            }, 500);
        });
    });
}

async function savePostMoodAndFinish() {
    // Guardar mood post-game
    await supabase.from('hdd_mood_checkins').insert({
        patient_id: gameState.patientId,
        context: 'post_game_neuro_chef',
        mood_level: null,
        color_intensity: null, // No intensity
        color_selected: gameState.postMood.color
    });
    
    // Cerrar modal
    document.getElementById('post-game-modal').classList.add('hidden');
    
    // Finalizar juego
    finishGame();
}

async function finishGame() {
    console.log('[Neuro-Chef] Game finished!');
    
    // Actualizar sesión en Supabase
    await supabase
        .from('hdd_game_sessions')
        .update({
            completed_at: new Date().toISOString(),
            final_score: gameState.totalCorrect - gameState.totalErrors
        })
        .eq('id', gameState.sessionId);
    
    // Mostrar pantalla final
    alert(`¡Juego completado!\n\nAciertos: ${gameState.totalCorrect}\nErrores: ${gameState.totalErrors}`);
    
    // Redirigir al portal
    window.location.href = '/hdd/portal/';
}

// ========== SUPABASE HELPERS ==========
async function saveLevelMetrics(metric) {
    await supabase.from('hdd_game_metrics').insert({
        patient_id: gameState.patientId,
        game_session_id: gameState.sessionId,
        game_slug: 'neuro-chef-v2',
        metric_type: `level_${metric.level}`,
        metric_value: metric.score,
        metric_data: metric
    });
}

// ========== UTILITIES ==========
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ========== NIVELES PLACEHOLDERS ==========
// (Los otros niveles se implementarán en levels.js)
function loadLevel3_Cocina() {
    alert('Nivel 3: Cocina - En desarrollo');
    loadLevel(4);
}

function loadLevel4_Licuadora() {
    alert('Nivel 4: Licuadora - En desarrollo');
    loadLevel(5);
}

function loadLevel5_Mesa() {
    alert('Nivel 5: Mesa - En desarrollo');
    loadLevel(6);
}

function loadLevel6_Habitacion() {
    alert('Nivel 6: Habitación - En desarrollo');
    showPostGameModal();
}

// ========== INIT ON LOAD ==========
window.addEventListener('DOMContentLoaded', initGame);
