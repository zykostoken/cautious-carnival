// ========== CONSEJOS EDUCATIVOS POST-NIVEL ==========

const EDUCATIONAL_TIPS = {
    nivel_1_supermercado: {
        title: '🛒 Selección de Ingredientes',
        tips: [
            {
                type: 'success',
                icon: '🥔',
                title: 'PASTEL DE PAPAS - Ingredientes',
                content: `
                    <p><strong>BASE (imprescindibles):</strong></p>
                    <ul>
                        <li>✅ Papas, carne picada, cebolla, huevos</li>
                    </ul>
                    <p><strong>EXTRAS (opcionales):</strong></p>
                    <ul>
                        <li>✅ Aceitunas, pasas de uva, huevo duro</li>
                    </ul>
                    <p><strong>CONDIMENTOS:</strong></p>
                    <ul>
                        <li>✅ Sal, pimienta, orégano, pimentón</li>
                    </ul>
                `
            },
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
                        <li>Carne cruda → Estante INFERIOR (abajo)</li>
                        <li>Verduras → Cajón separado</li>
                        <li>Alimentos cocidos → Estante SUPERIOR</li>
                    </ul>
                    <p><strong>⚠️ Riesgo:</strong> Las bacterias de la carne cruda gotean sobre las verduras</p>
                `
            },
            {
                type: 'info',
                icon: '❄️',
                title: 'TEMPERATURA Y CONSERVACIÓN',
                content: `
                    <p><strong>FREEZER (-18°C):</strong></p>
                    <ul>
                        <li>✅ Carnes congeladas, helado, hielo</li>
                        <li>⏱️ Duran: 3-6 meses</li>
                    </ul>
                    <p><strong>ZONA FRÍA (2-4°C):</strong></p>
                    <ul>
                        <li>✅ Lácteos, carnes frescas, huevos</li>
                        <li>⏱️ Duran: 3-7 días</li>
                    </ul>
                    <p><strong>CAJÓN VERDURAS (5-8°C):</strong></p>
                    <ul>
                        <li>✅ Frutas, verduras</li>
                        <li>⏱️ Duran: 5-10 días</li>
                    </ul>
                `
            },
            {
                type: 'warning',
                icon: '🧊',
                title: 'QUÉ NO VA EN HELADERA',
                content: `
                    <p><strong>❌ Pan</strong> → se pone duro más rápido</p>
                    <p>✅ Va en: panera a temperatura ambiente</p>
                    <p><strong>❌ Papas/Cebollas</strong> → se pudren con humedad</p>
                    <p>✅ Va en: lugar seco y oscuro</p>
                    <p><strong>❌ Tomate</strong> → pierde sabor en frío</p>
                    <p>✅ Va en: frutera (salvo muy maduro)</p>
                `
            }
        ]
    },
    
    nivel_3_cocina: {
        title: '🍳 Secuencia de Preparación',
        tips: [
            {
                type: 'success',
                icon: '🔪',
                title: 'ORDEN CORRECTO (Pastel de Papas)',
                content: `
                    <ol>
                        <li>🧈 Engrasar fuente (evita que pegue)</li>
                        <li>🥔 Pelar papas (antes de hervir)</li>
                        <li>🥔 Hervir papas (20-25 min)</li>
                        <li>🧅 Picar cebolla (mientras hierven papas)</li>
                        <li>🥩 Dorar carne con cebolla</li>
                        <li>🥔 Hacer puré de papas</li>
                        <li>📦 Armar capas (puré, carne, puré)</li>
                        <li>🥚 Pintar con huevo batido</li>
                        <li>🔥 Horno 180°C por 30 minutos</li>
                    </ol>
                `
            },
            {
                type: 'info',
                icon: '⏱️',
                title: 'OPTIMIZACIÓN DE TIEMPO',
                content: `
                    <p><strong>✅ MIENTRAS hierven las papas (20 min):</strong></p>
                    <ul>
                        <li>→ Picar cebolla</li>
                        <li>→ Dorar la carne</li>
                        <li>→ Preparar otros ingredientes</li>
                    </ul>
                    <p><strong>❌ NUNCA esperes con las manos vacías:</strong></p>
                    <p>Aprovechá tiempos muertos</p>
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
                        <li>💡 Ayuda a que las cuchillas giren</li>
                    </ul>
                    <p><strong>2° BLANDOS (medio):</strong></p>
                    <ul>
                        <li>🍌 Banana, frutillas, yogur</li>
                        <li>💡 Se licúan fácil</li>
                    </ul>
                    <p><strong>3° DUROS (arriba):</strong></p>
                    <ul>
                        <li>🧊 Hielo, frutas congeladas</li>
                        <li>💡 El peso ayuda a empujar hacia abajo</li>
                    </ul>
                `
            },
            {
                type: 'info',
                icon: '🍓',
                title: 'LICUADOS SALUDABLES',
                content: `
                    <p><strong>BASE LÍQUIDA (elegir 1):</strong></p>
                    <ul>
                        <li>Leche común</li>
                        <li>Leche vegetal (almendras, avena)</li>
                        <li>Agua o yogur natural</li>
                    </ul>
                    <p><strong>FRUTAS (2-3 tipos):</strong></p>
                    <ul>
                        <li>Banana (da cremosidad)</li>
                        <li>Frutillas, arándanos</li>
                        <li>Durazno, manzana</li>
                    </ul>
                    <p><strong>EXTRAS OPCIONALES:</strong></p>
                    <ul>
                        <li>Avena (energía)</li>
                        <li>Miel (dulzor natural)</li>
                        <li>Semillas de chía</li>
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
                        <li>Plato al centro</li>
                        <li>Tenedor a la IZQUIERDA</li>
                        <li>Cuchillo a la DERECHA (filo hacia dentro)</li>
                        <li>Vaso arriba a la derecha</li>
                    </ul>
                    <p><strong>EXTRAS:</strong></p>
                    <ul>
                        <li>Cuchara a la derecha del cuchillo</li>
                        <li>Servilleta sobre o a la izquierda del plato</li>
                        <li>Pan a la izquierda arriba</li>
                    </ul>
                `
            },
            {
                type: 'info',
                icon: '🧂',
                title: 'ELEMENTOS COMPARTIDOS',
                content: `
                    <p><strong>AL CENTRO DE LA MESA:</strong></p>
                    <ul>
                        <li>Sal y pimienta</li>
                        <li>Manteca (si hay pan)</li>
                        <li>Jarra de agua o jugo</li>
                        <li>Fuente de comida principal</li>
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
                    <p><strong>PLACARD (colgar):</strong></p>
                    <ul>
                        <li>Camisas, pantalones de vestir</li>
                        <li>Camperas, abrigos</li>
                        <li>Vestidos</li>
                    </ul>
                    <p><strong>CAJÓN (doblar):</strong></p>
                    <ul>
                        <li>Remeras, sweaters</li>
                        <li>Medias, ropa interior</li>
                        <li>Pijamas</li>
                    </ul>
                    <p><strong>ZAPATERA:</strong></p>
                    <ul>
                        <li>Zapatos, zapatillas</li>
                        <li>Botas</li>
                    </ul>
                `
            },
            {
                type: 'info',
                icon: '🧺',
                title: 'CUIDADO DE LA ROPA',
                content: `
                    <p><strong>ANTES DE GUARDAR:</strong></p>
                    <ul>
                        <li>✅ Revisar que esté limpia</li>
                        <li>✅ Doblar o colgar sin arrugas</li>
                        <li>✅ Agrupar por tipo o color</li>
                    </ul>
                    <p><strong>ORDEN:</strong></p>
                    <ul>
                        <li>Ropa de temporada → adelante</li>
                        <li>Ropa fuera de temporada → atrás</li>
                    </ul>
                `
            }
        ]
    }
};

// Función para generar HTML de consejos
function generateEducationalHTML(levelId, score, errors = {}) {
    const tips = EDUCATIONAL_TIPS[levelId];
    if (!tips) return '<p>¡Buen trabajo!</p>';
    
    let html = `<h2 class="text-center mb-4">${tips.title}</h2>`;
    
    // Agregar errores específicos si los hay
    if (errors && Object.keys(errors).length > 0) {
        html += `
            <div class="educational-box warning">
                <h3>❌ Errores encontrados</h3>
                ${generateErrorFeedback(errors)}
            </div>
        `;
    }
    
    // Agregar consejos educativos
    tips.tips.forEach(tip => {
        html += `
            <div class="educational-box ${tip.type}">
                <h3>${tip.icon} ${tip.title}</h3>
                ${tip.content}
            </div>
        `;
    });
    
    return html;
}

// Generar feedback específico de errores
function generateErrorFeedback(errors) {
    let html = '<ul>';
    
    for (const [key, value] of Object.entries(errors)) {
        switch (key) {
            case 'wrong_zone':
                html += `<li><strong>Ubicación incorrecta:</strong> ${value.item} no va en ${value.zone}</li>`;
                break;
            case 'contamination_risk':
                html += `<li><strong>⚠️ Riesgo de contaminación:</strong> ${value.message}</li>`;
                break;
            case 'missing_ingredients':
                html += `<li><strong>Ingredientes olvidados:</strong> ${value.join(', ')}</li>`;
                break;
            case 'wrong_sequence':
                html += `<li><strong>Orden incorrecto:</strong> ${value.message}</li>`;
                break;
            default:
                html += `<li>${value}</li>`;
        }
    }
    
    html += '</ul>';
    return html;
}
