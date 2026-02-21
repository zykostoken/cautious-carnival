// ========== GAME ENGINE - NEURO-CHEF v3 ==========
// Integra: Biometrics, Player ID, Longitudinal tracking

// ========== INITIALIZATION ==========
async function initGame() {
    console.log('[Neuro-Chef] Initializing...');
    const urlParams = new URLSearchParams(window.location.search);
    const isDemoMode = urlParams.get('demo') === 'true';
    const playerDni = urlParams.get('dni') || urlParams.get('patient_id') || localStorage.getItem('hdd_patient_id');
    
    if (isDemoMode && !playerDni) {
        gameState.patientDni = 'HDD-DEMO-' + Date.now();
        gameState.patientId = await getOrCreatePatient(gameState.patientDni, 'Demo');
        document.getElementById('player-login-modal').classList.add('hidden');
        setupPreGameModal();
    } else if (playerDni) {
        gameState.patientDni = playerDni;
        document.getElementById('player-login-modal').classList.add('hidden');
        document.getElementById('patient-display').textContent = 'Pac: ' + playerDni;
        setupPreGameModal();
        // Supabase calls in background - don't block game start
        getOrCreatePatient(playerDni).then(id => { gameState.patientId = id; }).catch(() => {});
        loadPlayerHistory().catch(() => {});
    } else {
        setupPlayerLogin();
    }
}

// ========== PLAYER LOGIN ==========
function setupPlayerLogin() {
    const modal = document.getElementById('player-login-modal');
    const form = document.getElementById('player-login-form');
    const dniInput = document.getElementById('player-dni');
    const nameInput = document.getElementById('player-name');
    const errorEl = document.getElementById('login-error-msg');
    const historyList = document.getElementById('recent-players');
    
    const recent = JSON.parse(localStorage.getItem('neurochef_recent_players') || '[]');
    if (recent.length > 0) {
        document.getElementById('recent-players-section').classList.remove('hidden');
        historyList.innerHTML = recent.slice(0, 5).map(p => `
            <button class="recent-player-btn" data-dni="${p.dni}" data-name="${p.name}">
                <span class="rp-name">${p.name || 'Sin nombre'}</span>
                <span class="rp-dni">${p.dni}</span>
                <span class="rp-date">${p.lastPlayed ? new Date(p.lastPlayed).toLocaleDateString('es-AR') : ''}</span>
            </button>
        `).join('');
        historyList.querySelectorAll('.recent-player-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dniInput.value = btn.dataset.dni;
                nameInput.value = btn.dataset.name || '';
                form.dispatchEvent(new Event('submit'));
            });
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dni = dniInput.value.trim();
        if (!dni) { errorEl.textContent = 'Ingresá un DNI o identificador'; errorEl.classList.remove('hidden'); return; }
        errorEl.classList.add('hidden');
        const name = nameInput.value.trim();
        gameState.patientDni = dni;
        gameState.patientId = await getOrCreatePatient(dni, name);
        if (!gameState.patientId) { errorEl.textContent = 'Error conectando. Intentá de nuevo.'; errorEl.classList.remove('hidden'); return; }
        saveRecentPlayer(dni, name);
        document.getElementById('patient-display').textContent = name || `Pac: ${dni}`;
        modal.classList.add('hidden');
        await loadPlayerHistory();
        setupPreGameModal();
    });
}

function saveRecentPlayer(dni, name) {
    let recent = JSON.parse(localStorage.getItem('neurochef_recent_players') || '[]');
    recent = recent.filter(p => p.dni !== dni);
    recent.unshift({ dni, name, lastPlayed: new Date().toISOString() });
    localStorage.setItem('neurochef_recent_players', JSON.stringify(recent.slice(0, 10)));
}

async function loadPlayerHistory() {
    if (!gameState.patientId || !supabase) return;
    try {
        const { data } = await supabase.from('hdd_game_sessions').select('id, started_at, completed_at, final_score')
            .eq('patient_id', gameState.patientId).order('started_at', { ascending: false }).limit(10);
        gameState.playerHistory = data || [];
        console.log(`[Neuro-Chef] ${(data||[]).length} previous sessions`);
    } catch(e) { gameState.playerHistory = []; }
}

async function getOrCreatePatient(dni, name) {
    if (!supabase) { console.warn('[neuro-chef] Offline, usando ID local'); return 'offline-' + dni; }
    try {
        const { data: existing } = await supabase.from('hdd_patients').select('id, full_name').eq('dni', dni).single();
        if (existing) { document.getElementById('patient-display').textContent = existing.full_name || `Pac: ${dni}`; return existing.id; }
        const { data: np } = await supabase.from('hdd_patients').insert({ dni, full_name: name || `Paciente ${dni}`, admission_date: new Date().toISOString().split('T')[0] }).select('id').single();
        return np?.id || 'offline-' + dni;
    } catch(e) { console.error('[Neuro-Chef] Patient error:', e); return 'offline-' + dni; }
}

// ========== PRE-GAME MODAL ==========
function setupPreGameModal() {
    const modal = document.getElementById('pre-game-modal');
    modal.classList.remove('hidden');
    const chatBox = document.getElementById('chat-messages');
    let chatInput = document.getElementById('chat-input');
    let chatSend = document.getElementById('chat-send');
    let btnSkip = document.getElementById('btn-skip-pre');
    
    // Reset on re-entry
    chatBox.innerHTML = '';
    chatInput.value = '';
    chatInput.disabled = false;
    document.getElementById('chat-input-area').style.display = 'flex';
    btnSkip.style.display = '';
    
    const playerName = gameState.patientName?.split(' ')[0] || 'Chef';
    const chatQuestions = [
        { key: 'q1', greet: `¡Hola ${playerName}! 👋`, ask: '¿Cómo estás hoy?', react: ['Bien ahí 💪', 'Entendido 👍', 'Ok, anotado ✍️'] },
        { key: 'q2', ask: '¿Qué comiste hoy?', react: ['Interesante 🍽️', 'Anotado 📝', 'Ok ok 👌'] },
        { key: 'q3', ask: '¿Cómo dormiste anoche?', react: ['Perfecto, gracias por contarme', 'Entendido, gracias', 'Ok, todo registrado'] }
    ];
    let currentQ = 0;
    const answers = { q1: '', q2: '', q3: '' };
    
    function addBubble(text, isChef, animate = true) {
        const bubble = document.createElement('div');
        bubble.style.cssText = `max-width: 80%; padding: 0.55rem 0.9rem; border-radius: ${isChef ? '12px 12px 12px 4px' : '12px 12px 4px 12px'}; font-size: 0.88rem; line-height: 1.4; align-self: ${isChef ? 'flex-start' : 'flex-end'}; background: ${isChef ? '#1e1e1e' : '#D4A574'}; color: ${isChef ? '#ddd' : '#1a1a1a'}; ${isChef ? 'border: 1px solid #333;' : ''} opacity: ${animate ? 0 : 1}; transform: translateY(${animate ? '8px' : '0'}); transition: all 0.3s ease;`;
        bubble.textContent = text;
        chatBox.appendChild(bubble);
        if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { bubble.style.opacity = '1'; bubble.style.transform = 'translateY(0)'; }));
        chatBox.scrollTop = chatBox.scrollHeight;
        return bubble;
    }
    
    function addTyping() {
        const t = document.createElement('div');
        t.id = 'typing-indicator';
        t.style.cssText = 'align-self: flex-start; padding: 0.5rem 0.9rem; background: #1e1e1e; border: 1px solid #333; border-radius: 12px 12px 12px 4px; font-size: 0.85rem; color: #888;';
        t.innerHTML = '<span style="animation: blink 1s infinite">•</span><span style="animation: blink 1s 0.2s infinite">•</span><span style="animation: blink 1s 0.4s infinite">•</span>';
        chatBox.appendChild(t);
        chatBox.scrollTop = chatBox.scrollHeight;
        // inject blink anim if not present
        if (!document.getElementById('chat-blink-css')) {
            const s = document.createElement('style'); s.id = 'chat-blink-css';
            s.textContent = '@keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}';
            document.head.appendChild(s);
        }
        return t;
    }
    
    function removeTyping() { document.getElementById('typing-indicator')?.remove(); }
    
    async function chefSays(text, delay = 600) {
        const typing = addTyping();
        await new Promise(r => setTimeout(r, delay));
        typing.remove();
        return addBubble(text, true);
    }
    
    async function askNext() {
        const q = chatQuestions[currentQ];
        if (q.greet) await chefSays(q.greet, 400);
        await chefSays(q.ask, q.greet ? 500 : 600);
        chatInput.focus();
    }
    
    async function handleAnswer() {
        const val = chatInput.value.trim();
        if (!val) return;
        const q = chatQuestions[currentQ];
        answers[q.key] = val;
        addBubble(val, false);
        chatInput.value = '';
        chatInput.disabled = true;
        
        const react = q.react[Math.floor(Math.random() * q.react.length)];
        await chefSays(react, 500);
        
        currentQ++;
        if (currentQ < chatQuestions.length) {
            chatInput.disabled = false;
            await askNext();
        } else {
            await chefSays('¡Vamos a cocinar! 🔥', 600);
            chatInput.disabled = true;
            document.getElementById('chat-input-area').style.display = 'none';
            btnSkip.style.display = 'none';
            setTimeout(() => {
                gameState.preMood = { ...answers, skipped: false };
                modal.classList.add('hidden');
                startGame();
            }, 900);
        }
    }
    
    const newSend = chatSend.cloneNode(true);
    chatSend.replaceWith(newSend); chatSend = newSend;
    const newInput = chatInput.cloneNode(true);
    chatInput.replaceWith(newInput); chatInput = newInput;
    
    chatSend.addEventListener('click', handleAnswer);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAnswer(); });
    
    // Clone skip to remove old listeners
    const newSkip = btnSkip.cloneNode(true);
    btnSkip.replaceWith(newSkip); btnSkip = newSkip;
    btnSkip.addEventListener('click', () => {
        gameState.preMood = { q1: '', q2: '', q3: '', skipped: true };
        modal.classList.add('hidden');
        startGame();
    });
    
    // Start chat flow
    setTimeout(() => askNext(), 300);
}

// ========== GAME START ==========
async function startGame() {
    console.log('[Neuro-Chef] Starting session...');
    gameState.startTime = Date.now(); gameState.currentLevel = 1;
    gameState.totalCorrect = 0; gameState.totalErrors = 0;
    gameState.levelMetrics = []; gameState.biometricData = [];
    Biometrics.resetCount = 0;
    
    try { const { data: g } = await supabase.from('hdd_games').select('id').eq('slug', 'neuro-chef-v2').single(); gameState.gameId = g?.id; } catch(e) {}
    try {
        const { data: s } = await supabase.from('hdd_game_sessions').insert({ patient_id: gameState.patientId, game_id: gameState.gameId, level: 1, started_at: new Date().toISOString() }).select('id').single();
        gameState.sessionId = s?.id;
    } catch(e) { console.warn('[Neuro-Chef] Session fail:', e); }
    
    if (gameState.preMood && !gameState.preMood.skipped) {
        await supabase.from('hdd_mood_checkins').insert({ patient_id: gameState.patientId, context: 'pre_game_neuro_chef', mood_level: null, notes: JSON.stringify(gameState.preMood) }).catch(()=>{});
    }
    
    document.getElementById('game-container').classList.remove('hidden');
    setupResetButton(); loadLevel(1); startTimer();
}

function setupResetButton() {
    const btn = document.getElementById('btn-reset');
    if (!btn) return; btn.classList.remove('hidden');
    btn.onclick = () => { Biometrics.logReset(); loadLevel(gameState.currentLevel); };
}

function startTimer() {
    if (gameState._timerInterval) clearInterval(gameState._timerInterval);
    const display = document.getElementById('timer-display');
    gameState._timerInterval = setInterval(() => {
        const e = Math.floor((Date.now() - gameState.startTime) / 1000);
        display.textContent = `${Math.floor(e/60).toString().padStart(2,'0')}:${(e%60).toString().padStart(2,'0')}`;
    }, 1000);
}

// ========== LEVEL MANAGEMENT ==========
function loadLevel(levelNum) {
    console.log(`[Neuro-Chef] Level ${levelNum}`);
    gameState.currentLevel = levelNum;
    document.getElementById('current-level').textContent = `${levelNum}/6`;
    Biometrics.startLevel();
    
    const gameArea = document.getElementById('game-area');
    gameArea.className = '';
    const scenes = {1:'scene-super',2:'scene-heladera',3:'scene-cocina',4:'scene-licuadora',5:'scene-mesa',6:'scene-habitacion'};
    if (scenes[levelNum]) gameArea.classList.add(scenes[levelNum]);
    
    switch(levelNum) {
        case 1: loadLevel1_Supermercado(); break;
        case 2: loadLevel2_Heladera(); break;
        case 3: loadLevel3_Cocina(); break;
        case 4: loadLevel4_Licuadora(); break;
        case 5: loadLevel5_Mesa(); break;
        case 6: loadLevel6_Habitacion(); break;
        default: finishGame();
    }
    const bv = document.getElementById('btn-verify'); if(bv) bv.classList.remove('hidden');
    const bn = document.getElementById('btn-next'); if(bn) bn.classList.add('hidden');
}

function updateMetrics(correct=0, errors=0) {
    gameState.totalCorrect += correct; gameState.totalErrors += errors;
    document.getElementById('correct-count').textContent = gameState.totalCorrect;
    document.getElementById('error-count').textContent = gameState.totalErrors;
}

// ========== NIVEL 1: SUPERMERCADO ==========
function loadLevel1_Supermercado() {
    document.getElementById('level-title').textContent = 'Nivel 1: Supermercado';
    const recetaKeys = Object.keys(RECETAS);
    const recetaKey = recetaKeys[Math.floor(Math.random() * recetaKeys.length)];
    const receta = RECETAS[recetaKey];
    document.getElementById('level-description').innerHTML = `Elegí los ingredientes para hacer <strong>${receta.nombre}</strong>`;
    
    const gameArea = document.getElementById('game-area');
    const allFoods = Object.values(ALIMENTOS);
    const needed = [...receta.ingredientes_base, ...(receta.ingredientes_opcionales || [])];
    const distractorIds = receta.distractores || [];
    const foodPool = new Set([...needed, ...distractorIds]);
    shuffleArray(allFoods.filter(f => !foodPool.has(f.id))).slice(0, 12).forEach(f => foodPool.add(f.id));
    const shuffled = shuffleArray([...foodPool].map(id => ALIMENTOS[id]).filter(Boolean));
    
    gameArea.dataset.recetaKey = recetaKey;
    gameArea.dataset.totalCorrectItems = needed.length.toString();
    gameArea.dataset.totalDistractors = (shuffled.length - needed.length).toString();
    
    gameArea.innerHTML = `
        <div class="gondola-container" id="gondola">
            ${shuffled.map(food => `<div class="food-item" draggable="true" data-id="${food.id}"><img src="${food.imagen}" alt="${food.nombre}" loading="lazy"><div class="label">${food.nombre}</div></div>`).join('')}
        </div>
        <div class="cart-container"><h3>Tu Carrito</h3>
            <div class="cart-grid" id="cart">${Array(8).fill(0).map((_,i)=>`<div class="cart-slot" data-slot="${i}"></div>`).join('')}</div>
        </div>`;
    
    setupDragAndDrop();
    document.getElementById('btn-verify').onclick = () => { Biometrics.logVerify(); verifyLevel1(); };
}

function verifyLevel1() {
    const cart = document.getElementById('cart');
    const selectedItems = [];
    cart.querySelectorAll('.cart-slot').forEach(slot => { const item = slot.querySelector('.food-item'); if(item) selectedItems.push(item.dataset.id); });
    
    const recetaKey = document.getElementById('game-area').dataset.recetaKey || 'pastel_papas';
    const receta = RECETAS[recetaKey];
    const required = receta.ingredientes_base;
    const optional = receta.ingredientes_opcionales || [];
    const totalDistractors = parseInt(document.getElementById('game-area').dataset.totalDistractors) || 0;
    
    let hits=0, misses=0, falseAlarms=0, missing=[], wrong=[];
    required.forEach(ing => { if(selectedItems.includes(ing)){hits++} else{misses++; missing.push(ALIMENTOS[ing]?.nombre||ing)} });
    selectedItems.forEach(ing => { if(!required.includes(ing) && !optional.includes(ing)){falseAlarms++; wrong.push(ALIMENTOS[ing]?.nombre||ing)} });
    const correctRejects = totalDistractors - falseAlarms;
    const score = Math.round((hits / (hits + misses + falseAlarms)) * 100) || 0;
    
    const bio = Biometrics.getLevelBiometrics(1, { correct:hits, omissions:misses, commissions:falseAlarms, correct_rejects:correctRejects });
    const m = { level:1, level_name:'supermercado', score, correct:hits, errors:misses+falseAlarms, missing, wrong, biometrics:bio, timestamp:new Date().toISOString() };
    gameState.levelMetrics.push(m); gameState.biometricData.push(bio);
    updateMetrics(hits, misses+falseAlarms); saveLevelMetrics(m); saveBiometrics(bio);
    showEducationalModal('nivel_1_supermercado', score, { missing_ingredients:missing, wrong_items:wrong });
}

// ========== NIVEL 2: HELADERA ==========
function loadLevel2_Heladera() {
    document.getElementById('level-title').textContent = 'Nivel 2: Heladera';
    document.getElementById('level-description').innerHTML = 'Guardá las compras organizando por <strong>tipo y temperatura</strong>';
    const gameArea = document.getElementById('game-area');
    const selected = shuffleArray(Object.values(ALIMENTOS)).slice(0, 20);
    
    gameArea.innerHTML = `<div class="heladera-container">
        <div class="bolsa-compras"><h3>Bolsa de Compras</h3><div class="bolsa-grid" id="bolsa">
            ${selected.map(f=>`<div class="food-item" draggable="true" data-id="${f.id}"><img src="${f.imagen}" alt="${f.nombre}" loading="lazy"><div class="label">${f.nombre}</div></div>`).join('')}
        </div></div>
        <div class="heladera">
            <div class="heladera-zone"><h4>FREEZER (-18°C)</h4><div class="zone-grid" id="zone-freezer" data-zone="freezer">${Array(4).fill(0).map((_,i)=>`<div class="zone-slot" data-slot="${i}"></div>`).join('')}</div></div>
            <div class="heladera-zone"><h4>ZONA FRÍA (2-4°C)</h4><div class="zone-grid" id="zone-fria" data-zone="fria">${Array(8).fill(0).map((_,i)=>`<div class="zone-slot" data-slot="${i}"></div>`).join('')}</div></div>
            <div class="heladera-zone"><h4>CAJÓN VERDURAS (5-8°C)</h4><div class="zone-grid" id="zone-verduras" data-zone="verduras">${Array(6).fill(0).map((_,i)=>`<div class="zone-slot" data-slot="${i}"></div>`).join('')}</div></div>
            <div class="heladera-zone"><h4>ALACENA (no heladera)</h4><div class="zone-grid" id="zone-afuera" data-zone="afuera">${Array(4).fill(0).map((_,i)=>`<div class="zone-slot" data-slot="${i}"></div>`).join('')}</div></div>
        </div></div>`;
    setupDragAndDrop();
    document.getElementById('btn-verify').onclick = () => { Biometrics.logVerify(); verifyLevel2(); };
}

function verifyLevel2() {
    let hits=0, falseAlarms=0, totalPlaced=0; const errorDetails = {};
    ['freezer','fria','verduras','afuera'].forEach(zn => {
        document.getElementById(`zone-${zn}`).querySelectorAll('.zone-slot').forEach(slot => {
            const item = slot.querySelector('.food-item');
            if(item){ totalPlaced++; const food = ALIMENTOS[item.dataset.id];
                if(food.zona_heladera===zn){hits++;slot.classList.add('filled');slot.classList.remove('error')}
                else{falseAlarms++;slot.classList.add('error');if(!errorDetails.wrong_zone)errorDetails.wrong_zone=[];errorDetails.wrong_zone.push({item:food.nombre,zone:zn,correct_zone:food.zona_heladera})}
            }
        });
    });
    const remaining = document.getElementById('bolsa')?.querySelectorAll('.food-item').length || 0;
    const score = totalPlaced > 0 ? Math.round((hits/totalPlaced)*100) : 0;
    const bio = Biometrics.getLevelBiometrics(2, {correct:hits,omissions:remaining,commissions:falseAlarms,correct_rejects:0});
    const m = {level:2,level_name:'heladera',score,correct:hits,errors:falseAlarms,omissions:remaining,biometrics:bio,timestamp:new Date().toISOString()};
    gameState.levelMetrics.push(m);gameState.biometricData.push(bio);updateMetrics(hits,falseAlarms);saveLevelMetrics(m);saveBiometrics(bio);
    showEducationalModal('nivel_2_heladera',score,errorDetails);
}

// ========== NIVEL 3: COCINA ==========
function loadLevel3_Cocina() {
    document.getElementById('level-title').textContent = 'Nivel 3: Cocina';
    const recetasConPasos = Object.values(RECETAS).filter(r=>r.pasos&&r.pasos.length>0);
    const receta = recetasConPasos[Math.floor(Math.random()*recetasConPasos.length)];
    document.getElementById('level-description').innerHTML = `Ordená los pasos para preparar <strong>${receta.nombre}</strong>`;
    const gameArea = document.getElementById('game-area');
    const shuffledPasos = shuffleArray([...receta.pasos]);
    gameArea.innerHTML = `<div class="cocina-container">
        <div class="pasos-desordenados" id="pasos-source"><h3>Pasos disponibles</h3>
            ${shuffledPasos.map((p,i)=>`<div class="paso-card" draggable="true" data-paso="${p}" data-original-index="${receta.pasos.indexOf(p)}"><span class="paso-grip">⠿</span><span class="paso-text">${p}</span></div>`).join('')}
        </div>
        <div class="pasos-ordenados"><h3>Orden de preparación</h3><div id="pasos-target">
            ${receta.pasos.map((_,i)=>`<div class="paso-slot" data-order="${i}"><span class="slot-number">${i+1}.</span><span class="slot-placeholder">Soltar paso aquí</span></div>`).join('')}
        </div></div></div>`;
    gameArea.dataset.correctOrder = JSON.stringify(receta.pasos);
    gameArea.dataset.recetaNombre = receta.nombre;
    setupPasosDragDrop();
    document.getElementById('btn-verify').onclick = () => { Biometrics.logVerify(); verifyLevel3(); };
}

function setupPasosDragDrop() {
    document.querySelectorAll('.paso-card').forEach(card => {
        card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain',card.dataset.paso); card.classList.add('dragging'); Biometrics.logDragStart('paso_'+card.dataset.originalIndex); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('click', () => {
            if(card.classList.contains('placed'))return;
            const s = document.querySelector('.paso-slot:not(.filled)'); if(!s)return;
            s.innerHTML=`<span class="slot-number">${parseInt(s.dataset.order)+1}.</span><span class="paso-text">${card.dataset.paso}</span>`;
            s.dataset.paso=card.dataset.paso;s.classList.add('filled');card.classList.add('placed');card.style.opacity='0.3';
            Biometrics.logClick('paso_'+card.dataset.originalIndex,'slot_'+s.dataset.order);
        });
    });
    document.querySelectorAll('.paso-slot').forEach(slot => {
        slot.addEventListener('dragover', e=>{e.preventDefault();slot.classList.add('drag-over')});
        slot.addEventListener('dragleave', ()=>slot.classList.remove('drag-over'));
        slot.addEventListener('drop', e => {
            e.preventDefault();slot.classList.remove('drag-over');const pt=e.dataTransfer.getData('text/plain');
            slot.innerHTML=`<span class="slot-number">${parseInt(slot.dataset.order)+1}.</span><span class="paso-text">${pt}</span>`;
            slot.dataset.paso=pt;slot.classList.add('filled');
            const oc=[...document.querySelectorAll('.paso-card')].find(c=>c.dataset.paso===pt);
            if(oc){oc.classList.add('placed');oc.style.opacity='0.3'}
            Biometrics.logDrop('paso','slot_'+slot.dataset.order,null);
        });
        slot.addEventListener('dblclick', ()=>{
            if(slot.classList.contains('filled')){
                const pt=slot.dataset.paso; Biometrics.logUndo('paso_slot_'+slot.dataset.order);
                const oc=[...document.querySelectorAll('.paso-card')].find(c=>c.dataset.paso===pt);
                if(oc){oc.classList.remove('placed');oc.style.opacity='1'}
                slot.innerHTML=`<span class="slot-number">${parseInt(slot.dataset.order)+1}.</span><span class="slot-placeholder">Soltar paso aquí</span>`;
                slot.classList.remove('filled');delete slot.dataset.paso;
            }
        });
    });
}

function verifyLevel3() {
    const co = JSON.parse(document.getElementById('game-area').dataset.correctOrder);
    let hits=0,errors=0,omissions=0;
    document.querySelectorAll('.paso-slot').forEach((s,i)=>{
        if(s.dataset.paso===co[i]){hits++;s.classList.add('filled');s.classList.remove('error')}
        else if(s.dataset.paso){errors++;s.classList.add('error')}else{omissions++}
    });
    const score=Math.round((hits/co.length)*100);
    const bio=Biometrics.getLevelBiometrics(3,{correct:hits,omissions,commissions:errors,correct_rejects:0});
    const m={level:3,level_name:'cocina',score,correct:hits,errors,omissions,receta:document.getElementById('game-area').dataset.recetaNombre,biometrics:bio,timestamp:new Date().toISOString()};
    gameState.levelMetrics.push(m);gameState.biometricData.push(bio);updateMetrics(hits,errors);saveLevelMetrics(m);saveBiometrics(bio);
    showEducationalModal('nivel_3_cocina',score,{receta:m.receta});
}

// ========== NIVEL 4: LICUADORA ==========
function loadLevel4_Licuadora() {
    document.getElementById('level-title').textContent='Nivel 4: Licuadora';
    const lk=Object.keys(LICUADOS);const lkey=lk[Math.floor(Math.random()*lk.length)];const lic=LICUADOS[lkey];
    document.getElementById('level-description').innerHTML=`Poné los ingredientes <strong>en el orden correcto</strong> para hacer un ${lic.nombre}`;
    const ga=document.getElementById('game-area');
    const shuffled=shuffleArray([...lic.secuencia_correcta]);const dist=['sal','aceite','arroz'];const all=shuffleArray([...shuffled,...dist]);
    ga.dataset.correctSeq=JSON.stringify(lic.secuencia_correcta);ga.dataset.explicacion=lic.explicacion;ga.dataset.totalDistractors=dist.length.toString();
    ga.innerHTML=`<div class="licuadora-container"><div class="ingredientes-disponibles"><h3>Ingredientes disponibles</h3><div class="ingredientes-grid" id="lic-source">
        ${all.map(item=>{const f=ALIMENTOS[item];const n=f?f.nombre:item;return`<div class="lic-item" data-id="${item}" onclick="addToLicuadora(this)">${f?`<img src="${f.imagen}" alt="${n}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">`:`<span style="font-size:2rem">?</span>`}<div class="label">${n}</div></div>`}).join('')}
    </div></div><div class="licuadora-visual"><h3>Orden de carga</h3><div id="lic-target" class="lic-sequence">
        ${lic.secuencia_correcta.map((_,i)=>`<div class="lic-slot" data-order="${i}"><span>${i+1}°</span></div>`).join('')}
    </div></div></div>`;
    document.getElementById('btn-verify').onclick=()=>{Biometrics.logVerify();verifyLevel4()};
}

function addToLicuadora(el) {
    if(el.classList.contains('used'))return;const id=el.dataset.id;
    const es=document.querySelector('.lic-slot:not(.filled)');if(!es)return;
    const f=ALIMENTOS[id];es.innerHTML=`<span>${parseInt(es.dataset.order)+1}° ${f?f.nombre:id}</span>`;
    es.dataset.id=id;es.classList.add('filled');el.classList.add('used');el.style.opacity='0.3';
    Biometrics.logClick(id,'lic_slot_'+es.dataset.order);
}

function verifyLevel4() {
    const cs=JSON.parse(document.getElementById('game-area').dataset.correctSeq);
    const td=parseInt(document.getElementById('game-area').dataset.totalDistractors)||0;
    let hits=0,errors=0,du=0;
    document.querySelectorAll('.lic-slot').forEach((s,i)=>{
        if(s.dataset.id===cs[i]){hits++;s.classList.add('filled')}
        else if(s.dataset.id){errors++;s.classList.add('error');if(!cs.includes(s.dataset.id))du++}
    });
    const score=Math.round((hits/cs.length)*100);
    const bio=Biometrics.getLevelBiometrics(4,{correct:hits,omissions:cs.length-hits-errors,commissions:du,correct_rejects:td-du});
    const m={level:4,level_name:'licuadora',score,correct:hits,errors,biometrics:bio,timestamp:new Date().toISOString()};
    gameState.levelMetrics.push(m);gameState.biometricData.push(bio);updateMetrics(hits,errors);saveLevelMetrics(m);saveBiometrics(bio);
    showEducationalModal('nivel_4_licuadora',score,{explicacion:document.getElementById('game-area').dataset.explicacion});
}

// ========== NIVEL 5: MESA ==========
function loadLevel5_Mesa() {
    document.getElementById('level-title').textContent='Nivel 5: Mesa';
    document.getElementById('level-description').innerHTML='Poné la mesa correctamente ubicando cada elemento donde corresponde';
    const ga=document.getElementById('game-area');const ai=shuffleArray(Object.values(ELEMENTOS_MESA));
    ga.innerHTML=`<div class="mesa-container"><div class="despensa"><h3>Despensa</h3><div class="despensa-grid" id="mesa-source">
        ${ai.map(i=>`<div class="mesa-item" draggable="true" data-id="${i.id}" data-zona="${i.zona}"><span class="mesa-emoji">${i.emoji}</span><div class="label">${i.nombre}</div></div>`).join('')}
    </div></div><div class="mesa-visual"><h3>La Mesa</h3><div class="mesa-grid">
        <div class="mesa-zone" data-zone="izquierda" id="zone-izquierda"><small>Izquierda</small></div>
        <div class="mesa-zone" data-zone="centro" id="zone-centro"><small>Centro</small></div>
        <div class="mesa-zone" data-zone="derecha" id="zone-derecha"><small>Derecha</small></div>
        <div class="mesa-zone" data-zone="derecha_arriba" id="zone-derecha_arriba"><small>Arriba derecha</small></div>
        <div class="mesa-zone" data-zone="base" id="zone-base"><small>Base</small></div>
    </div><div class="mesa-zone mesa-descarte" data-zone="NO_VA" id="zone-NO_VA"><small>No va en la mesa</small></div></div></div>`;
    setupMesaDragDrop();
    document.getElementById('btn-verify').onclick=()=>{Biometrics.logVerify();verifyLevel5()};
}

function setupMesaDragDrop() {
    document.querySelectorAll('.mesa-item').forEach(item=>{
        item.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',item.dataset.id);item.classList.add('dragging');Biometrics.logDragStart(item.dataset.id)});
        item.addEventListener('dragend',()=>item.classList.remove('dragging'));
    });
    document.querySelectorAll('.mesa-zone').forEach(zone=>{
        zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over')});
        zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
        zone.addEventListener('drop',e=>{
            e.preventDefault();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');const item=ELEMENTOS_MESA[id];if(!item)return;
            const b=document.createElement('div');b.className='mesa-placed';b.dataset.id=id;b.innerHTML=`${item.emoji} ${item.nombre}`;zone.appendChild(b);
            const o=document.querySelector(`.mesa-item[data-id="${id}"]`);if(o)o.style.display='none';
            Biometrics.logDrop(id,zone.dataset.zone,item.zona===zone.dataset.zone);
        });
    });
}

function verifyLevel5() {
    let hits=0,fa=0;const tci=Object.values(ELEMENTOS_MESA).filter(i=>i.zona!=='NO_VA').length;
    const td=Object.values(ELEMENTOS_MESA).filter(i=>i.zona==='NO_VA').length;let cr=td;
    document.querySelectorAll('.mesa-zone').forEach(z=>{
        z.querySelectorAll('.mesa-placed').forEach(p=>{const i=ELEMENTOS_MESA[p.dataset.id];
            if(i&&i.zona===z.dataset.zone){hits++;p.classList.add('correct')}
            else{fa++;p.classList.add('wrong');if(i&&i.zona==='NO_VA'&&z.dataset.zone!=='NO_VA')cr--}
        });
    });
    const om=tci-hits;const score=(hits+fa)>0?Math.round((hits/(hits+fa))*100):0;
    const bio=Biometrics.getLevelBiometrics(5,{correct:hits,omissions:om,commissions:fa,correct_rejects:cr});
    const m={level:5,level_name:'mesa',score,correct:hits,errors:fa,omissions:om,biometrics:bio,timestamp:new Date().toISOString()};
    gameState.levelMetrics.push(m);gameState.biometricData.push(bio);updateMetrics(hits,fa);saveLevelMetrics(m);saveBiometrics(bio);
    showEducationalModal('nivel_5_mesa',score,{});
}

// ========== NIVEL 6: HABITACIÓN ==========
function loadLevel6_Habitacion() {
    document.getElementById('level-title').textContent='Nivel 6: Habitación';
    document.getElementById('level-description').innerHTML='Guardá la ropa limpia en el lugar correcto: <strong>placard, cajón o zapatera</strong>';
    const ga=document.getElementById('game-area');const ar=shuffleArray(Object.values(ROPA));
    ga.innerHTML=`<div class="habitacion-container"><div class="canasto-ropa"><h3>Canasto de Ropa Limpia</h3><div class="canasto-grid" id="ropa-source">
        ${ar.map(i=>`<div class="ropa-item" draggable="true" data-id="${i.id}" data-destino="${i.destino}"><span class="ropa-emoji">${i.emoji}</span><div class="label">${i.nombre}</div></div>`).join('')}
    </div></div><div class="muebles">
        <div class="mueble" data-destino="placard" id="dest-placard"><h4>Placard (colgar)</h4><div class="mueble-slots"></div></div>
        <div class="mueble" data-destino="cajon" id="dest-cajon"><h4>Cajón (doblar)</h4><div class="mueble-slots"></div></div>
        <div class="mueble" data-destino="zapatera" id="dest-zapatera"><h4>Zapatera</h4><div class="mueble-slots"></div></div>
        <div class="mueble mueble-descarte" data-destino="NO_VA" id="dest-NO_VA"><h4>No va acá</h4><div class="mueble-slots"></div></div>
    </div></div>`;
    setupRopaDragDrop();
    document.getElementById('btn-verify').onclick=()=>{Biometrics.logVerify();verifyLevel6()};
}

function setupRopaDragDrop() {
    document.querySelectorAll('.ropa-item').forEach(item=>{
        item.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',item.dataset.id);item.classList.add('dragging');Biometrics.logDragStart(item.dataset.id)});
        item.addEventListener('dragend',()=>item.classList.remove('dragging'));
        item.addEventListener('click',()=>{item.classList.toggle('selected');document.querySelectorAll('.ropa-item').forEach(r=>{if(r!==item)r.classList.remove('selected')})});
    });
    document.querySelectorAll('.mueble').forEach(mueble=>{
        mueble.addEventListener('dragover',e=>{e.preventDefault();mueble.classList.add('drag-over')});
        mueble.addEventListener('dragleave',()=>mueble.classList.remove('drag-over'));
        mueble.addEventListener('drop',e=>{
            e.preventDefault();mueble.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');const item=ROPA[id];if(!item)return;
            const b=document.createElement('div');b.className='ropa-placed';b.dataset.id=id;b.innerHTML=`${item.emoji} ${item.nombre}`;
            mueble.querySelector('.mueble-slots').appendChild(b);
            const o=document.querySelector(`.ropa-item[data-id="${id}"]`);if(o)o.style.display='none';
            Biometrics.logDrop(id,mueble.dataset.destino,item.destino===mueble.dataset.destino);
        });
        mueble.addEventListener('click',e=>{
            if(e.target.closest('.ropa-placed'))return;const sel=document.querySelector('.ropa-item.selected');if(!sel)return;
            const id=sel.dataset.id;const item=ROPA[id];if(!item)return;
            const b=document.createElement('div');b.className='ropa-placed';b.dataset.id=id;b.innerHTML=`${item.emoji} ${item.nombre}`;
            mueble.querySelector('.mueble-slots').appendChild(b);sel.style.display='none';sel.classList.remove('selected');
            Biometrics.logClick(id,mueble.dataset.destino);
        });
    });
}

function verifyLevel6() {
    let hits=0,fa=0;const tci=Object.values(ROPA).filter(i=>i.destino!=='NO_VA').length;
    const td=Object.values(ROPA).filter(i=>i.destino==='NO_VA').length;let cr=td;
    document.querySelectorAll('.mueble').forEach(m=>{
        m.querySelectorAll('.ropa-placed').forEach(p=>{const i=ROPA[p.dataset.id];
            if(i&&i.destino===m.dataset.destino){hits++;p.classList.add('correct')}
            else{fa++;p.classList.add('wrong');if(i&&i.destino==='NO_VA'&&m.dataset.destino!=='NO_VA')cr--}
        });
    });
    const om=tci-hits;const score=(hits+fa)>0?Math.round((hits/(hits+fa))*100):0;
    const bio=Biometrics.getLevelBiometrics(6,{correct:hits,omissions:om,commissions:fa,correct_rejects:cr});
    const m2={level:6,level_name:'habitacion',score,correct:hits,errors:fa,omissions:om,biometrics:bio,timestamp:new Date().toISOString()};
    gameState.levelMetrics.push(m2);gameState.biometricData.push(bio);updateMetrics(hits,fa);saveLevelMetrics(m2);saveBiometrics(bio);
    showEducationalModal('nivel_6_habitacion',score,{});
}

// ========== DRAG & DROP (Generic for levels 1-2) ==========
function setupDragAndDrop() {
    document.querySelectorAll('.food-item[draggable="true"]').forEach(item=>{
        item.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/html',e.target.outerHTML);e.target.style.opacity='0.4';e.target.classList.add('dragging');Biometrics.logDragStart(item.dataset.id)});
        item.addEventListener('dragend',e=>{e.target.style.opacity='1';e.target.classList.remove('dragging')});
    });
    document.querySelectorAll('.cart-slot, .zone-slot').forEach(zone=>{
        zone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('drag-over')});
        zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
        zone.addEventListener('drop',e=>{
            e.preventDefault();zone.classList.remove('drag-over');if(zone.querySelector('.food-item'))return;
            const d=e.dataTransfer.getData('text/html');const t=document.createElement('div');t.innerHTML=d;const di=t.firstChild;
            const orig=document.querySelector(`.food-item[data-id="${di.dataset.id}"]`);if(orig)orig.remove();
            zone.appendChild(di);zone.classList.add('filled');
            Biometrics.logDrop(di.dataset.id,zone.dataset.zone||zone.dataset.slot,null);
            di.addEventListener('dragstart',e2=>{e2.dataTransfer.effectAllowed='move';e2.dataTransfer.setData('text/html',e2.target.outerHTML);e2.target.style.opacity='0.4';e2.target.classList.add('dragging');Biometrics.logDragStart(di.dataset.id)});
        });
    });
}

// ========== EDUCATIONAL MODAL ==========
function showEducationalModal(levelId, score, errors={}) {
    const modal = document.getElementById('educational-modal');
    const content = document.getElementById('educational-content');
    document.getElementById('score-value').textContent = score;
    content.innerHTML = generateEducationalHTML(levelId, score, errors);
    modal.classList.remove('hidden');
    document.getElementById('btn-continue').onclick = () => {
        modal.classList.add('hidden');
        if (gameState.currentLevel < gameState.totalLevels) loadLevel(gameState.currentLevel + 1);
        else showPostGameModal();
    };
}

// ========== POST-GAME MODAL ==========
function showPostGameModal() {
    const modal = document.getElementById('post-game-modal'); modal.classList.remove('hidden');
    const bs = document.getElementById('btn-skip-post'); const bc = document.getElementById('btn-continue-post');
    const ns = bs.cloneNode(true); const nc = bc.cloneNode(true); bs.replaceWith(ns); bc.replaceWith(nc);
    ns.addEventListener('click',()=>{gameState.postMood.color=null;gameState.postMood.skipped=true;savePostMoodAndFinish()});
    nc.addEventListener('click',()=>{savePostMoodAndFinish()});
    showColorSelectorDirect(nc);
}

function showColorSelectorDirect(btnContinue) {
    const cs = document.getElementById('color-selector'); const cg = cs.querySelector('.color-grid');
    cg.innerHTML = COLORES_PROYECTIVOS.map(hex=>`<button class="color-btn" data-color="${hex}" style="width:70px;height:70px;background:${hex};border:3px solid transparent;border-radius:50%;cursor:pointer;transition:all 0.25s;box-shadow:0 4px 12px rgba(0,0,0,0.3)"></button>`).join('');
    cs.classList.remove('hidden');
    cg.querySelectorAll('.color-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
            gameState.postMood.color=btn.dataset.color;gameState.postMood.intensity=null;gameState.postMood.skipped=false;
            cg.querySelectorAll('.color-btn').forEach(b=>{b.style.borderColor='transparent';b.style.transform='scale(1)';b.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'});
            btn.style.borderColor='#fff';btn.style.boxShadow='0 0 0 4px rgba(255,255,255,0.8), 0 8px 25px rgba(0,0,0,0.4)';btn.style.transform='scale(1.2)';
            btnContinue.disabled=false;btnContinue.style.opacity='1';
        });
    });
}

async function savePostMoodAndFinish() {
    await supabase.from('hdd_mood_checkins').insert({ patient_id:gameState.patientId, context:'post_game_neuro_chef', mood_level:null, color_intensity:null, color_selected:gameState.postMood.color, skipped:gameState.postMood.skipped||false }).catch(()=>{});
    document.getElementById('post-game-modal').classList.add('hidden'); finishGame();
}

// ========== FINISH ==========
async function finishGame() {
    console.log('[Neuro-Chef] Finished!');
    if(gameState._timerInterval)clearInterval(gameState._timerInterval);
    const totalTime = Date.now()-gameState.startTime;
    const summary = {
        total_time_ms:totalTime, total_correct:gameState.totalCorrect, total_errors:gameState.totalErrors,
        levels_completed:gameState.levelMetrics.length, reset_count:Biometrics.resetCount,
        biometric_summary:{
            avg_reaction_time:avg(gameState.biometricData.map(b=>b.reaction_time_ms)),
            avg_tremor:avg(gameState.biometricData.map(b=>b.tremor_avg)),
            avg_d_prime:avg(gameState.biometricData.map(b=>b.d_prime)),
            total_hesitations:sum(gameState.biometricData.map(b=>b.hesitation_count)),
            total_undos:sum(gameState.biometricData.map(b=>b.undo_count)),
            total_omissions:sum(gameState.biometricData.map(b=>b.misses)),
            total_commissions:sum(gameState.biometricData.map(b=>b.false_alarms))
        }
    };
    await supabase.from('hdd_game_sessions').update({ completed_at:new Date().toISOString(), final_score:gameState.totalCorrect-gameState.totalErrors, metadata:summary }).eq('id',gameState.sessionId).catch(()=>{});
    showResultsScreen(summary);
}

function showResultsScreen(summary) {
    const ga=document.getElementById('game-area');ga.className='';
    document.getElementById('level-instructions').classList.add('hidden');
    document.getElementById('controls').classList.add('hidden');
    const tt=Math.round(summary.total_time_ms/1000);
    const mins=Math.floor(tt/60);const secs=tt%60;
    ga.innerHTML=`<div class="results-screen">
        <h2>Sesión Completada</h2>
        <div class="results-grid">
            <div class="result-card"><div class="result-value">${summary.total_correct}</div><div class="result-label">Aciertos</div></div>
            <div class="result-card"><div class="result-value">${summary.total_errors}</div><div class="result-label">Errores</div></div>
            <div class="result-card"><div class="result-value">${mins}:${secs.toString().padStart(2,'0')}</div><div class="result-label">Tiempo total</div></div>
            <div class="result-card"><div class="result-value">${summary.levels_completed}/6</div><div class="result-label">Niveles</div></div>
        </div>
        <div class="results-actions">
            <button onclick="window.location.reload()" class="btn-primary">Jugar de nuevo</button>
            <button onclick="window.location.href=getPortalUrl()" class="btn-secondary">Volver al portal</button>
        </div>
    </div>`;
}

// ========== SUPABASE HELPERS ==========
async function saveLevelMetrics(metric) {
    const clean={...metric};if(clean.biometrics){clean.biometrics={...clean.biometrics};delete clean.biometrics.action_log;delete clean.biometrics.tremor_details;delete clean.biometrics.hesitation_details}
    await supabase.from('hdd_game_metrics').insert({ patient_id:gameState.patientId, game_session_id:gameState.sessionId, game_slug:'neuro-chef-v2', metric_type:`level_${metric.level}`, metric_value:metric.score, metric_data:clean }).catch(e=>console.warn('Metric save fail:',e));
}

async function saveBiometrics(bio) {
    await supabase.from('hdd_game_metrics').insert({
        patient_id:gameState.patientId, game_session_id:gameState.sessionId, game_slug:'neuro-chef-v2',
        metric_type:`biometric_level_${bio.level}`, metric_value:bio.d_prime||0,
        metric_data:{ reaction_time_ms:bio.reaction_time_ms, total_time_ms:bio.total_time_ms, hits:bio.hits, misses:bio.misses, false_alarms:bio.false_alarms, correct_rejects:bio.correct_rejects, d_prime:bio.d_prime, tremor_avg:bio.tremor_avg, tremor_speed_var:bio.tremor_speed_var, hesitation_count:bio.hesitation_count, hesitation_total_ms:bio.hesitation_total_ms, undo_count:bio.undo_count, reset_count:bio.reset_count, total_interactions:bio.total_interactions }
    }).catch(e=>console.warn('Bio save fail:',e));
}

// ========== UTILITIES ==========
function shuffleArray(a){const arr=[...a];for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
function avg(arr){if(!arr||!arr.length)return 0;return arr.reduce((a,b)=>a+(b||0),0)/arr.length}
function sum(arr){if(!arr||!arr.length)return 0;return arr.reduce((a,b)=>a+(b||0),0)}
function getPortalUrl(){return localStorage.getItem('games_session')?'/games/portal/':'/hdd/portal/'}

window.addEventListener('DOMContentLoaded', function(){
    // Smart back link
    var backLink = document.getElementById('back-link');
    if(backLink) backLink.href = getPortalUrl();
    initGame();
});
