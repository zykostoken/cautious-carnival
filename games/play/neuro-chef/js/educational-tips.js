// ========== CONSEJOS EDUCATIVOS POST-NIVEL (DINÁMICOS) ==========

// Tips genéricos por nivel (siempre se muestran)
const EDUCATIONAL_TIPS_BASE = {
    nivel_1_supermercado: {
        title: '🛒 Selección de Ingredientes',
        tips: [
            {
                type: 'info',
                icon: '🛒',
                title: 'COMPRA INTELIGENTE',
                content: `
                    <p><strong>VERDURAS:</strong></p>
                    <ul>
                        <li>✅ Firmes, sin manchas, color brillante</li>
                        <li>❌ Blandas, con moho, decoloradas</li>
                    </ul>
                    <p><strong>CARNES:</strong></p>
                    <ul>
                        <li>✅ Rojo intenso, sin olor fuerte</li>
                        <li>⚠️ Revisar fecha de vencimiento</li>
                    </ul>
                    <p><strong>LÁCTEOS:</strong></p>
                    <ul>
                        <li>✅ Envases sellados, fechas lejanas</li>
                        <li>❌ Envases inflados (gas = bacteria)</li>
                    </ul>
                `
            }
        ]
    },

    nivel_2_heladera: {
        title: '🧊 Organización de la Heladera',
        tips: [
            {
                type: 'warning',
                icon: '🦠',
                title: 'CONTAMINACIÓN CRUZADA',
                content: `
                    <p><strong>⚠️ NUNCA</strong> pongas carne cruda junto a alimentos que se comen sin cocinar (lechuga, tomate)</p>
                    <p><strong>✅ Correcto:</strong></p>
                    <ul>
                        <li>🔴 Carne cruda → Estante INFERIOR (zona fría, abajo)</li>
                        <li>🟢 Verduras → Cajón SEPARADO (zona verduras)</li>
                        <li>🔵 Alimentos cocidos → Estante SUPERIOR (zona fría, arriba)</li>
                        <li>🟡 Lácteos → Zona fría (no en la puerta)</li>
                    </ul>
                    <p><strong>⚠️ Riesgo:</strong> Las bacterias de la carne cruda gotean y contaminan lo de abajo</p>
                `
            },
            {
                type: 'info',
                icon: '❄️',
                title: 'ZONAS DE LA HELADERA',
                content: `
                    <p><strong>FREEZER (-18°C):</strong> Helado, hielo, congelados</p>
                    <p><strong>ZONA FRÍA (2-4°C):</strong> Lácteos, carnes, huevos, aderezos abiertos</p>
                    <p><strong>CAJÓN VERDURAS (5-8°C):</strong> Verduras y frutas frescas</p>
                    <p><strong>ALACENA (ambiente):</strong> Pan, papas, cebolla, ajo, sal, azúcar, aceite</p>
                    <ul>
                        <li>❌ Pan en heladera → se endurece más rápido</li>
                        <li>❌ Papas en heladera → se pudren con humedad</li>
                        <li>❌ Cebollas en heladera → ablandan y pierden sabor</li>
                    </ul>
                `
            }
        ]
    },

    nivel_3_cocina: {
        title: '🍳 Secuencia de Preparación',
        tips: [
            {
                type: 'info',
                icon: '⏱️',
                title: 'OPTIMIZACIÓN DE TIEMPO',
                content: `
                    <p><strong>✅ Aprovechá los tiempos de cocción:</strong></p>
                    <ul>
                        <li>→ Mientras hierve el agua, picá verduras</li>
                        <li>→ Mientras se cocina algo en el horno, prepará guarnición</li>
                        <li>→ Prepará todos los ingredientes ANTES de cocinar</li>
                    </ul>
                    <p><strong>❌ Error común:</strong> No planificar y tener que esperar entre pasos</p>
                `
            }
        ]
    },

    nivel_4_licuadora: {
        title: '🥤 Uso Correcto de Licuadora',
        tips: [
            {
                type: 'success',
                icon: '🥤',
                title: 'ORDEN CORRECTO EN LICUADORA',
                content: `
                    <p><strong>1° LÍQUIDOS (abajo):</strong></p>
                    <ul>
                        <li>🥛 Leche, agua, jugo</li>
                        <li>💡 Ayuda a que las cuchillas giren libremente</li>
                    </ul>
                    <p><strong>2° BLANDOS (medio):</strong></p>
                    <ul>
                        <li>🍌 Banana, frutillas, yogur</li>
                        <li>💡 Se licúan fácil con el líquido</li>
                    </ul>
                    <p><strong>3° DUROS/HIELO (arriba):</strong></p>
                    <ul>
                        <li>🧊 Hielo, frutas congeladas</li>
                        <li>💡 El peso empuja todo hacia las cuchillas</li>
                    </ul>
                `
            }
        ]
    },

    nivel_5_mesa: {
        title: '🍽️ Poner la Mesa Correctamente',
        tips: [
            {
                type: 'success',
                icon: '🍽️',
                title: 'UBICACIÓN CORRECTA',
                content: `
                    <p><strong>BÁSICO:</strong></p>
                    <ul>
                        <li>🍽️ Plato al centro</li>
                        <li>🍴 Tenedor a la IZQUIERDA</li>
                        <li>🔪 Cuchillo a la DERECHA (filo hacia el plato)</li>
                        <li>🥛 Vaso arriba a la derecha</li>
                    </ul>
                    <p><strong>EXTRAS:</strong></p>
                    <ul>
                        <li>🥄 Cuchara a la derecha del cuchillo</li>
                        <li>🧻 Servilleta a la izquierda del tenedor</li>
                    </ul>
                    <p><strong>NO VA EN LA MESA:</strong></p>
                    <ul>
                        <li>🍳 Sartén, 🫕 Olla, 🧽 Esponja, 🪵 Tabla</li>
                    </ul>
                `
            }
        ]
    },

    nivel_6_habitacion: {
        title: '👕 Organización de la Ropa',
        tips: [
            {
                type: 'success',
                icon: '👕',
                title: 'CATEGORIZACIÓN CORRECTA',
                content: `
                    <p><strong>PLACARD (colgar):</strong> Camisas, pantalones, camperas, vestidos</p>
                    <p><strong>CAJÓN (doblar):</strong> Remeras, medias, ropa interior, pijamas</p>
                    <p><strong>ZAPATERA:</strong> Zapatos, zapatillas, ojotas, botas</p>
                    <p><strong>NO VA:</strong> Paraguas (perchero), Toalla (baño)</p>
                `
            },
            {
                type: 'info',
                icon: '🧺',
                title: 'CUIDADO DE LA ROPA',
                content: `
                    <p><strong>ANTES DE GUARDAR:</strong></p>
                    <ul>
                        <li>✅ Revisar que esté limpia y seca</li>
                        <li>✅ Doblar o colgar sin arrugas</li>
                        <li>✅ Agrupar por tipo o color</li>
                    </ul>
                `
            }
        ]
    }
};

// Genera tips DINÁMICOS para Nivel 1, específicos de la receta seleccionada
function generateRecipeTip(recetaKey) {
    const receta = RECETAS[recetaKey];
    if (!receta) return null;

    const baseNames = receta.ingredientes_base.map(id => ALIMENTOS[id]?.nombre || id).join(', ');
    const optNames = receta.ingredientes_opcionales.map(id => ALIMENTOS[id]?.nombre || id).join(', ');
    const distNames = receta.distractores.map(id => ALIMENTOS[id]?.nombre || id).join(', ');
    const tipReceta = receta.tips_receta || {};

    return {
        type: 'success',
        icon: '🍽️',
        title: `${receta.nombre.toUpperCase()} — Ingredientes`,
        content: `
            <p><strong>BASE (imprescindibles):</strong></p>
            <ul><li>✅ ${baseNames}</li></ul>
            <p><strong>EXTRAS (opcionales válidos):</strong></p>
            <ul><li>✅ ${optNames}</li></ul>
            <p><strong>DISTRACTORES (NO van en esta receta):</strong></p>
            <ul><li>❌ ${distNames}</li></ul>
            ${tipReceta.consejo_clave ? `<p><strong>💡 Consejo:</strong> ${tipReceta.consejo_clave}</p>` : ''}
            ${tipReceta.logica ? `<p><strong>🧠 Lógica:</strong> ${tipReceta.logica}</p>` : ''}
        `
    };
}

// Genera tips DINÁMICOS para Nivel 3, específicos de la receta de cocina
function generateCookingTip(recetaKey) {
    const receta = RECETAS[recetaKey];
    if (!receta) return null;

    const tipReceta = receta.tips_receta || {};

    return {
        type: 'success',
        icon: '🔪',
        title: `ORDEN CORRECTO — ${receta.nombre}`,
        content: `
            <ol>
                ${receta.pasos.map((p, i) => `<li>${p}</li>`).join('')}
            </ol>
            ${tipReceta.error_comun ? `<p><strong>⚠️ Error frecuente:</strong> ${tipReceta.error_comun}</p>` : ''}
            ${tipReceta.consejo_clave ? `<p><strong>💡 Consejo:</strong> ${tipReceta.consejo_clave}</p>` : ''}
        `
    };
}

// Función principal para generar HTML de consejos
function generateEducationalHTML(levelId, score, errors = {}) {
    const baseTips = EDUCATIONAL_TIPS_BASE[levelId];
    if (!baseTips) return '<p>¡Buen trabajo!</p>';

    let html = `<h2 class="text-center mb-4">${baseTips.title}</h2>`;

    // Score display
    html += `<div style="text-align:center;margin-bottom:1rem;">
        <span style="font-size:2rem;font-weight:700;color:${score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--accent)' : 'var(--red)'}">${score}%</span>
        <span style="color:rgba(255,255,255,0.6);font-size:0.9rem;display:block;margin-top:0.25rem;">Puntaje del nivel</span>
    </div>`;

    // Agregar feedback específico de errores
    if (errors && Object.keys(errors).length > 0) {
        html += `
            <div class="educational-box warning">
                <h4>❌ Revisemos los errores</h4>
                ${generateErrorFeedback(errors)}
            </div>
        `;
    }

    // Para Nivel 1: agregar tip dinámico de receta
    if (levelId === 'nivel_1_supermercado' && errors.recetaKey) {
        const recipeTip = generateRecipeTip(errors.recetaKey);
        if (recipeTip) {
            html += `
                <div class="educational-box ${recipeTip.type}">
                    <h4>${recipeTip.icon} ${recipeTip.title}</h4>
                    ${recipeTip.content}
                </div>
            `;
        }
    }

    // Para Nivel 3: agregar tip dinámico de cocina
    if (levelId === 'nivel_3_cocina' && errors.recetaKey) {
        const cookingTip = generateCookingTip(errors.recetaKey);
        if (cookingTip) {
            html += `
                <div class="educational-box ${cookingTip.type}">
                    <h4>${cookingTip.icon} ${cookingTip.title}</h4>
                    ${cookingTip.content}
                </div>
            `;
        }
    }

    // Agregar consejos educativos genéricos
    baseTips.tips.forEach(tip => {
        html += `
            <div class="educational-box ${tip.type}">
                <h4>${tip.icon} ${tip.title}</h4>
                ${tip.content}
            </div>
        `;
    });

    return html;
}

// Generar feedback específico de errores
function generateErrorFeedback(errors) {
    let html = '<ul style="list-style:none;padding:0;">';

    for (const [key, value] of Object.entries(errors)) {
        switch (key) {
            case 'wrong_zone':
                if (Array.isArray(value)) {
                    value.forEach(v => {
                        const correctZoneName = {freezer:'Freezer',fria:'Zona Fría',verduras:'Cajón Verduras',afuera:'Alacena'}[v.correct_zone] || v.correct_zone;
                        const placedZoneName = {freezer:'Freezer',fria:'Zona Fría',verduras:'Cajón Verduras',afuera:'Alacena'}[v.zone] || v.zone;
                        html += `<li style="margin-bottom:0.3rem">📍 <strong>${v.item}</strong> → lo pusiste en <em>${placedZoneName}</em>, pero va en <strong>${correctZoneName}</strong></li>`;
                    });
                }
                break;
            case 'missing_ingredients':
                if (Array.isArray(value) && value.length > 0) {
                    html += `<li style="margin-bottom:0.3rem">🔍 <strong>Te faltaron:</strong> ${value.join(', ')}</li>`;
                }
                break;
            case 'wrong_items':
                if (Array.isArray(value) && value.length > 0) {
                    html += `<li style="margin-bottom:0.3rem">🚫 <strong>No van en esta receta:</strong> ${value.join(', ')}</li>`;
                }
                break;
            case 'wrong_sequence':
                html += `<li style="margin-bottom:0.3rem">🔄 <strong>Orden incorrecto:</strong> ${value.message || value}</li>`;
                break;
            case 'explicacion':
                html += `<li style="margin-bottom:0.3rem">💡 <strong>Explicación:</strong> ${value}</li>`;
                break;
            case 'recetaKey':
            case 'receta':
                // Skip internal keys
                break;
            default:
                if (typeof value === 'string') {
                    html += `<li style="margin-bottom:0.3rem">${value}</li>`;
                }
        }
    }

    html += '</ul>';
    return html;
}
