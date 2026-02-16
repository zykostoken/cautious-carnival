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
    const btnContinue = document.getElementById('btn-continue-pre');
    
    btnSkip.addEventListener('click', () => {
        // Guardar respuestas vacías
        gameState.preMood = { q1: '', q2: '', q3: '', skipped: true };
        
        // Cerrar modal y empezar juego
        document.getElementById('pre-game-modal').classList.add('hidden');
        startGame();
    });
    
    btnContinue.addEventListener('click', () => {
        // Guardar respuestas (aunque estén vacías)
        const q1 = document.getElementById('q1').value.trim();
        const q2 = document.getElementById('q2').value.trim();
        const q3 = document.getElementById('q3').value.trim();
        
        gameState.preMood = { q1, q2, q3, skipped: false };
        
        // Cerrar modal y empezar juego
        document.getElementById('pre-game-modal').classList.add('hidden');
        startGame();
    });
    
    // Botón SIEMPRE habilitado - pueden continuar con respuestas vacías
    btnContinue.disabled = false;
    btnContinue.style.opacity = '1';
}
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
    
    // Escena fotográfica inmersiva por nivel
    const gameArea = document.getElementById('game-area');
    gameArea.className = ''; // limpiar
    const scenes = { 1:'scene-super', 2:'scene-heladera', 3:'scene-cocina', 4:'scene-licuadora', 5:'scene-mesa', 6:'scene-habitacion' };
    if (scenes[levelNum]) gameArea.classList.add(scenes[levelNum]);
    
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
    
    // Elegir receta aleatoria
    const recetaKeys = Object.keys(RECETAS);
    const recetaKey = recetaKeys[Math.floor(Math.random() * recetaKeys.length)];
    const receta = RECETAS[recetaKey];
    
    document.getElementById('level-description').innerHTML = 
        `Elegí los ingredientes para hacer <strong>${receta.nombre}</strong>`;
    
    const gameArea = document.getElementById('game-area');
    
    // Mezclar ingredientes correctos + distractores + random extras
    const allFoods = Object.values(ALIMENTOS);
    const needed = [...receta.ingredientes_base, ...(receta.ingredientes_opcionales || [])];
    const distractorIds = receta.distractores || [];
    
    // Asegurar que todos los necesarios estén + distractores + extras random
    const foodPool = new Set([...needed, ...distractorIds]);
    const extras = shuffleArray(allFoods.filter(f => !foodPool.has(f.id))).slice(0, 12);
    extras.forEach(f => foodPool.add(f.id));
    
    const shuffled = shuffleArray([...foodPool].map(id => ALIMENTOS[id]).filter(Boolean));
    
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
            <h3>Tu Carrito</h3>
            <div class="cart-grid" id="cart">
                ${Array(8).fill(0).map((_, i) => `
                    <div class="cart-slot" data-slot="${i}"></div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Store current recipe for verification
    gameArea.dataset.recetaKey = recetaKey;
    
    setupDragAndDrop();
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
    
    const recetaKey = document.getElementById('game-area').dataset.recetaKey || 'pastel_papas';
    const receta = RECETAS[recetaKey];
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
                <h3>Bolsa de Compras</h3>
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
                    <h4>FREEZER (-18°C)</h4>
                    <div class="zone-grid" id="zone-freezer" data-zone="freezer">
                        ${Array(4).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>ZONA FRÍA (2-4°C)</h4>
                    <div class="zone-grid" id="zone-fria" data-zone="fria">
                        ${Array(8).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>CAJÓN VERDURAS (5-8°C)</h4>
                    <div class="zone-grid" id="zone-verduras" data-zone="verduras">
                        ${Array(6).fill(0).map((_, i) => `
                            <div class="zone-slot" data-slot="${i}"></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="heladera-zone">
                    <h4>ALACENA (no va en heladera)</h4>
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
    
    // Setup botones
    const btnSkip = document.getElementById('btn-skip-post');
    const btnContinue = document.getElementById('btn-continue-post');
    
    btnSkip.addEventListener('click', () => {
        gameState.postMood.color = null;
        gameState.postMood.skipped = true;
        savePostMoodAndFinish();
    });
    
    btnContinue.addEventListener('click', () => {
        savePostMoodAndFinish();
    });
    
    // Mostrar directamente 12 colores fijos
    showColorSelectorDirect(btnContinue);
}

function showColorSelectorDirect(btnContinue) {
    const colorSelector = document.getElementById('color-selector');
    const colorGrid = colorSelector.querySelector('.color-grid');
    
    // 12 colores PASTEL suaves (no intensos, no apagados)
    const colors = [
        '#f8b4b4', '#ffc9a3', '#ffe4a3',  // rojos/naranjas/amarillos pastel
        '#fff9a3', '#d4f4a3', '#b8e6b8',  // amarillos/verdes pastel
        '#a3e4f1', '#a3c9f1', '#c4b5fd',  // cielos/azules/violetas pastel
        '#d8b4fe', '#f5b4d8', '#c8c8c8'   // violetas/rosas/gris pastel
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
            gameState.postMood.skipped = false;
            
            // Visual feedback
            colorBtns.forEach(b => {
                b.style.borderColor = 'transparent';
                b.style.transform = 'scale(1)';
            });
            btn.style.borderColor = '#fff';
            btn.style.boxShadow = '0 0 0 3px #fff, 0 0 0 5px ' + btn.dataset.color;
            btn.style.transform = 'scale(1.1)';
            
            // Habilitar botón Listo
            btnContinue.disabled = false;
            btnContinue.style.opacity = '1';
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
        color_selected: gameState.postMood.color,
        skipped: gameState.postMood.skipped || false
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
// ========== NIVEL 3: COCINA (Secuenciar pasos) ==========
function loadLevel3_Cocina() {
    document.getElementById('level-title').textContent = 'Nivel 3: Cocina';
    
    // Elegir receta aleatoria que tenga pasos
    const recetasConPasos = Object.values(RECETAS).filter(r => r.pasos && r.pasos.length > 0);
    const receta = recetasConPasos[Math.floor(Math.random() * recetasConPasos.length)];
    
    document.getElementById('level-description').innerHTML = 
        `Ordená los pasos para preparar <strong>${receta.nombre}</strong>`;
    
    const gameArea = document.getElementById('game-area');
    const shuffledPasos = shuffleArray([...receta.pasos]);
    
    gameArea.innerHTML = `
        <div class="cocina-container">
            <div class="pasos-desordenados" id="pasos-source">
                <h3>Pasos disponibles</h3>
                ${shuffledPasos.map((paso, i) => `
                    <div class="paso-card" draggable="true" data-paso="${paso}" data-original-index="${receta.pasos.indexOf(paso)}">
                        <span class="paso-grip">⠿</span>
                        <span class="paso-text">${paso}</span>
                    </div>
                `).join('')}
            </div>
            <div class="pasos-ordenados">
                <h3>Orden de preparación</h3>
                <div id="pasos-target">
                    ${receta.pasos.map((_, i) => `
                        <div class="paso-slot" data-order="${i}">
                            <span class="slot-number">${i + 1}.</span>
                            <span class="slot-placeholder">Soltar paso aquí</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Store correct order for verification
    gameArea.dataset.correctOrder = JSON.stringify(receta.pasos);
    gameArea.dataset.recetaNombre = receta.nombre;
    
    setupPasosDragDrop();
    document.getElementById('btn-verify').onclick = verifyLevel3;
}

function setupPasosDragDrop() {
    const cards = document.querySelectorAll('.paso-card');
    const slots = document.querySelectorAll('.paso-slot');
    
    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.dataset.paso);
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        
        // Touch support
        card.addEventListener('click', () => {
            if (card.classList.contains('placed')) return;
            // Find first empty slot
            const emptySlot = document.querySelector('.paso-slot:not(.filled)');
            if (emptySlot) {
                emptySlot.innerHTML = `<span class="slot-number">${parseInt(emptySlot.dataset.order) + 1}.</span><span class="paso-text">${card.dataset.paso}</span>`;
                emptySlot.dataset.paso = card.dataset.paso;
                emptySlot.classList.add('filled');
                card.classList.add('placed');
                card.style.opacity = '0.3';
            }
        });
    });
    
    slots.forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            slot.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');
            const pasoText = e.dataTransfer.getData('text/plain');
            
            slot.innerHTML = `<span class="slot-number">${parseInt(slot.dataset.order) + 1}.</span><span class="paso-text">${pasoText}</span>`;
            slot.dataset.paso = pasoText;
            slot.classList.add('filled');
            
            // Ocultar card original
            const origCard = document.querySelector(`.paso-card[data-paso="${CSS.escape(pasoText)}"]`) || 
                             [...document.querySelectorAll('.paso-card')].find(c => c.dataset.paso === pasoText);
            if (origCard) {
                origCard.classList.add('placed');
                origCard.style.opacity = '0.3';
            }
        });
        
        // Click para vaciar slot
        slot.addEventListener('dblclick', () => {
            if (slot.classList.contains('filled')) {
                const pasoText = slot.dataset.paso;
                const origCard = [...document.querySelectorAll('.paso-card')].find(c => c.dataset.paso === pasoText);
                if (origCard) {
                    origCard.classList.remove('placed');
                    origCard.style.opacity = '1';
                }
                slot.innerHTML = `<span class="slot-number">${parseInt(slot.dataset.order) + 1}.</span><span class="slot-placeholder">Soltar paso aquí</span>`;
                slot.classList.remove('filled');
                delete slot.dataset.paso;
            }
        });
    });
}

function verifyLevel3() {
    const correctOrder = JSON.parse(document.getElementById('game-area').dataset.correctOrder);
    const slots = document.querySelectorAll('.paso-slot');
    
    let correct = 0;
    let errors = 0;
    
    slots.forEach((slot, i) => {
        if (slot.dataset.paso === correctOrder[i]) {
            correct++;
            slot.classList.add('filled');
            slot.classList.remove('error');
        } else if (slot.dataset.paso) {
            errors++;
            slot.classList.add('error');
        } else {
            errors++;
        }
    });
    
    const score = Math.round((correct / correctOrder.length) * 100);
    const levelMetric = {
        level: 3, level_name: 'cocina', score, correct, errors,
        receta: document.getElementById('game-area').dataset.recetaNombre,
        timestamp: new Date().toISOString()
    };
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    saveLevelMetrics(levelMetric);
    showEducationalModal('nivel_3_cocina', score, { receta: levelMetric.receta });
}

// ========== NIVEL 4: LICUADORA ==========
function loadLevel4_Licuadora() {
    document.getElementById('level-title').textContent = 'Nivel 4: Licuadora';
    
    const licuadoKeys = Object.keys(LICUADOS);
    const licuadoKey = licuadoKeys[Math.floor(Math.random() * licuadoKeys.length)];
    const licuado = LICUADOS[licuadoKey];
    
    document.getElementById('level-description').innerHTML = 
        `Poné los ingredientes en la licuadora <strong>en el orden correcto</strong> para hacer un ${licuado.nombre}`;
    
    const gameArea = document.getElementById('game-area');
    const shuffled = shuffleArray([...licuado.secuencia_correcta]);
    
    // Agregar distractores
    const distractores = ['sal', 'aceite', 'arroz'];
    const allItems = shuffleArray([...shuffled, ...distractores]);
    
    gameArea.innerHTML = `
        <div class="licuadora-container">
            <div class="ingredientes-disponibles">
                <h3>Ingredientes disponibles</h3>
                <div class="ingredientes-grid" id="lic-source">
                    ${allItems.map(item => {
                        const food = ALIMENTOS[item];
                        const nombre = food ? food.nombre : item;
                        const emoji = food ? '' : '?';
                        return `
                            <div class="lic-item" data-id="${item}" onclick="addToLicuadora(this)">
                                ${food ? `<img src="${food.imagen}" alt="${nombre}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">` : `<span style="font-size:2rem">${emoji}</span>`}
                                <div class="label">${nombre}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="licuadora-visual">
                <h3>Orden de carga</h3>
                <div id="lic-target" class="lic-sequence">
                    ${licuado.secuencia_correcta.map((_, i) => `
                        <div class="lic-slot" data-order="${i}">
                            <span>${i + 1}°</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    gameArea.dataset.correctSeq = JSON.stringify(licuado.secuencia_correcta);
    gameArea.dataset.explicacion = licuado.explicacion;
    
    document.getElementById('btn-verify').onclick = verifyLevel4;
}

function addToLicuadora(el) {
    if (el.classList.contains('used')) return;
    const id = el.dataset.id;
    const emptySlot = document.querySelector('.lic-slot:not(.filled)');
    if (!emptySlot) return;
    
    const food = ALIMENTOS[id];
    emptySlot.innerHTML = `<span>${parseInt(emptySlot.dataset.order) + 1}° ${food ? food.nombre : id}</span>`;
    emptySlot.dataset.id = id;
    emptySlot.classList.add('filled');
    el.classList.add('used');
    el.style.opacity = '0.3';
}

function verifyLevel4() {
    const correctSeq = JSON.parse(document.getElementById('game-area').dataset.correctSeq);
    const slots = document.querySelectorAll('.lic-slot');
    let correct = 0, errors = 0;
    
    slots.forEach((slot, i) => {
        if (slot.dataset.id === correctSeq[i]) {
            correct++;
            slot.classList.add('filled');
        } else {
            errors++;
            slot.classList.add('error');
        }
    });
    
    const score = Math.round((correct / correctSeq.length) * 100);
    const levelMetric = {
        level: 4, level_name: 'licuadora', score, correct, errors,
        timestamp: new Date().toISOString()
    };
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    saveLevelMetrics(levelMetric);
    showEducationalModal('nivel_4_licuadora', score, { explicacion: document.getElementById('game-area').dataset.explicacion });
}

// ========== NIVEL 5: MESA ==========
function loadLevel5_Mesa() {
    document.getElementById('level-title').textContent = 'Nivel 5: Mesa';
    document.getElementById('level-description').innerHTML = 
        'Poné la mesa correctamente seleccionando los elementos que van y ubicándolos donde corresponde';
    
    const gameArea = document.getElementById('game-area');
    const allItems = shuffleArray(Object.values(ELEMENTOS_MESA));
    
    gameArea.innerHTML = `
        <div class="mesa-container">
            <div class="despensa">
                <h3>Despensa</h3>
                <div class="despensa-grid" id="mesa-source">
                    ${allItems.map(item => `
                        <div class="mesa-item" draggable="true" data-id="${item.id}" data-zona="${item.zona}">
                            <span class="mesa-emoji">${item.emoji}</span>
                            <div class="label">${item.nombre}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="mesa-visual">
                <h3>La Mesa</h3>
                <div class="mesa-grid">
                    <div class="mesa-zone" data-zone="izquierda" id="zone-izquierda">
                        <small>Izquierda</small>
                    </div>
                    <div class="mesa-zone" data-zone="centro" id="zone-centro">
                        <small>Centro</small>
                    </div>
                    <div class="mesa-zone" data-zone="derecha" id="zone-derecha">
                        <small>Derecha</small>
                    </div>
                    <div class="mesa-zone" data-zone="derecha_arriba" id="zone-derecha_arriba">
                        <small>Arriba derecha</small>
                    </div>
                    <div class="mesa-zone" data-zone="base" id="zone-base">
                        <small>Base</small>
                    </div>
                </div>
                <div class="mesa-zone mesa-descarte" data-zone="NO_VA" id="zone-NO_VA">
                    <small>No va en la mesa</small>
                </div>
            </div>
        </div>
    `;
    
    setupMesaDragDrop();
    document.getElementById('btn-verify').onclick = verifyLevel5;
}

function setupMesaDragDrop() {
    const items = document.querySelectorAll('.mesa-item');
    const zones = document.querySelectorAll('.mesa-zone');
    
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.id);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
    });
    
    zones.forEach(zone => {
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const itemId = e.dataTransfer.getData('text/plain');
            const item = ELEMENTOS_MESA[itemId];
            if (!item) return;
            
            const badge = document.createElement('div');
            badge.className = 'mesa-placed';
            badge.dataset.id = itemId;
            badge.innerHTML = `${item.emoji} ${item.nombre}`;
            zone.appendChild(badge);
            
            const origEl = document.querySelector(`.mesa-item[data-id="${itemId}"]`);
            if (origEl) origEl.style.display = 'none';
        });
    });
}

function verifyLevel5() {
    const zones = document.querySelectorAll('.mesa-zone');
    let correct = 0, errors = 0;
    
    zones.forEach(zone => {
        const zoneName = zone.dataset.zone;
        const placed = zone.querySelectorAll('.mesa-placed');
        placed.forEach(p => {
            const item = ELEMENTOS_MESA[p.dataset.id];
            if (item && item.zona === zoneName) {
                correct++;
                p.classList.add('correct');
            } else {
                errors++;
                p.classList.add('wrong');
            }
        });
    });
    
    const score = correct + errors > 0 ? Math.round((correct / (correct + errors)) * 100) : 0;
    const levelMetric = {
        level: 5, level_name: 'mesa', score, correct, errors,
        timestamp: new Date().toISOString()
    };
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    saveLevelMetrics(levelMetric);
    showEducationalModal('nivel_5_mesa', score, {});
}

// ========== NIVEL 6: HABITACIÓN ==========
function loadLevel6_Habitacion() {
    document.getElementById('level-title').textContent = 'Nivel 6: Habitación';
    document.getElementById('level-description').innerHTML = 
        'Guardá la ropa limpia en el lugar correcto: <strong>placard, cajón o zapatera</strong>';
    
    const gameArea = document.getElementById('game-area');
    const allRopa = shuffleArray(Object.values(ROPA));
    
    gameArea.innerHTML = `
        <div class="habitacion-container">
            <div class="canasto-ropa">
                <h3>Canasto de Ropa Limpia</h3>
                <div class="canasto-grid" id="ropa-source">
                    ${allRopa.map(item => `
                        <div class="ropa-item" draggable="true" data-id="${item.id}" data-destino="${item.destino}">
                            <span class="ropa-emoji">${item.emoji}</span>
                            <div class="label">${item.nombre}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="muebles">
                <div class="mueble" data-destino="placard" id="dest-placard">
                    <h4>Placard (colgar)</h4>
                    <div class="mueble-slots"></div>
                </div>
                <div class="mueble" data-destino="cajon" id="dest-cajon">
                    <h4>Cajón (doblar)</h4>
                    <div class="mueble-slots"></div>
                </div>
                <div class="mueble" data-destino="zapatera" id="dest-zapatera">
                    <h4>Zapatera</h4>
                    <div class="mueble-slots"></div>
                </div>
                <div class="mueble mueble-descarte" data-destino="NO_VA" id="dest-NO_VA">
                    <h4>No va acá</h4>
                    <div class="mueble-slots"></div>
                </div>
            </div>
        </div>
    `;
    
    setupRopaDragDrop();
    document.getElementById('btn-verify').onclick = verifyLevel6;
}

function setupRopaDragDrop() {
    const items = document.querySelectorAll('.ropa-item');
    const muebles = document.querySelectorAll('.mueble');
    
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.id);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        
        // Click alternativo para mobile
        item.addEventListener('click', () => {
            item.classList.toggle('selected');
            document.querySelectorAll('.ropa-item').forEach(r => {
                if (r !== item) r.classList.remove('selected');
            });
        });
    });
    
    muebles.forEach(mueble => {
        mueble.addEventListener('dragover', (e) => { e.preventDefault(); mueble.classList.add('drag-over'); });
        mueble.addEventListener('dragleave', () => mueble.classList.remove('drag-over'));
        mueble.addEventListener('drop', (e) => {
            e.preventDefault();
            mueble.classList.remove('drag-over');
            const itemId = e.dataTransfer.getData('text/plain');
            const item = ROPA[itemId];
            if (!item) return;
            
            const badge = document.createElement('div');
            badge.className = 'ropa-placed';
            badge.dataset.id = itemId;
            badge.innerHTML = `${item.emoji} ${item.nombre}`;
            mueble.querySelector('.mueble-slots').appendChild(badge);
            
            const origEl = document.querySelector(`.ropa-item[data-id="${itemId}"]`);
            if (origEl) origEl.style.display = 'none';
        });
        
        // Click para recibir item seleccionado (mobile)
        mueble.addEventListener('click', () => {
            const selected = document.querySelector('.ropa-item.selected');
            if (!selected) return;
            const itemId = selected.dataset.id;
            const item = ROPA[itemId];
            if (!item) return;
            
            const badge = document.createElement('div');
            badge.className = 'ropa-placed';
            badge.dataset.id = itemId;
            badge.innerHTML = `${item.emoji} ${item.nombre}`;
            mueble.querySelector('.mueble-slots').appendChild(badge);
            selected.style.display = 'none';
            selected.classList.remove('selected');
        });
    });
}

function verifyLevel6() {
    const muebles = document.querySelectorAll('.mueble');
    let correct = 0, errors = 0;
    
    muebles.forEach(mueble => {
        const destino = mueble.dataset.destino;
        const placed = mueble.querySelectorAll('.ropa-placed');
        placed.forEach(p => {
            const item = ROPA[p.dataset.id];
            if (item && item.destino === destino) {
                correct++;
                p.classList.add('correct');
            } else {
                errors++;
                p.classList.add('wrong');
            }
        });
    });
    
    const score = correct + errors > 0 ? Math.round((correct / (correct + errors)) * 100) : 0;
    const levelMetric = {
        level: 6, level_name: 'habitacion', score, correct, errors,
        timestamp: new Date().toISOString()
    };
    gameState.levelMetrics.push(levelMetric);
    updateMetrics(correct, errors);
    saveLevelMetrics(levelMetric);
    showEducationalModal('nivel_6_habitacion', score, {});
}

// ========== INIT ON LOAD ==========
window.addEventListener('DOMContentLoaded', initGame);
