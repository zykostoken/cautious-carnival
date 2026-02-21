// ========== CONFIGURACIÓN DE SUPABASE ==========
const supabaseUrl = 'https://yqpqfzvgcmvxvqzvtajx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxcHFmenZnY212eHZxenZ0YWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1OTMzODksImV4cCI6MjA2NTE2OTM4OX0.jM2YEBXQ0YFwFOBu3mGbU3NxCez29x8RKYYDV2d8snk';
let supabase = null;
try {
    if (window.supabase && window.supabase.createClient) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    } else { console.warn('[neuro-chef] Supabase SDK no cargó, modo offline'); }
} catch(e) { console.warn('[neuro-chef] Supabase init failed:', e.message); }

// ========== DATOS DE ALIMENTOS ==========
const ALIMENTOS = {
    // CARNES Y PROTEÍNAS
    carne_picada: {
        id: 'carne_picada',
        nombre: 'Carne Picada',
        imagen: 'https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=300',
        categoria: 'proteina_animal',
        estado: 'crudo',
        zona_heladera: 'fria',
        posicion: 'abajo',
        temperatura: 2,
        duracion_dias: 2,
        riesgo_contaminacion: 'alto',
        tags: ['carne', 'picada', 'roja', 'cruda', 'proteína']
    },
    bife: {
        id: 'bife',
        nombre: 'Bife',
        imagen: 'https://images.unsplash.com/photo-1588347818036-c97cbf4e3c23?w=300',
        categoria: 'proteina_animal',
        estado: 'crudo',
        zona_heladera: 'fria',
        posicion: 'abajo',
        temperatura: 2,
        duracion_dias: 3,
        riesgo_contaminacion: 'alto'
    },
    pollo: {
        id: 'pollo',
        nombre: 'Pollo',
        imagen: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300',
        categoria: 'proteina_animal',
        estado: 'crudo',
        zona_heladera: 'fria',
        posicion: 'abajo',
        temperatura: 2,
        duracion_dias: 2,
        riesgo_contaminacion: 'muy_alto'
    },
    pescado: {
        id: 'pescado',
        nombre: 'Pescado',
        imagen: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300',
        categoria: 'proteina_animal',
        estado: 'crudo',
        zona_heladera: 'fria',
        posicion: 'abajo',
        temperatura: 0,
        duracion_dias: 1,
        riesgo_contaminacion: 'muy_alto'
    },
    salchichas: {
        id: 'salchichas',
        nombre: 'Salchichas',
        imagen: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=300',
        categoria: 'proteina_procesada',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 7
    },
    jamon: {
        id: 'jamon',
        nombre: 'Jamón Cocido',
        imagen: 'https://images.unsplash.com/photo-1562158147-f8bc83c0e99b?w=300',
        categoria: 'proteina_procesada',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 7
    },
    huevos: {
        id: 'huevos',
        nombre: 'Huevos',
        imagen: 'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?w=300',
        categoria: 'proteina_animal',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 21
    },
    
    // LÁCTEOS
    leche: {
        id: 'leche',
        nombre: 'Leche',
        imagen: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 7
    },
    yogur: {
        id: 'yogur',
        nombre: 'Yogur',
        imagen: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 14
    },
    manteca: {
        id: 'manteca',
        nombre: 'Manteca',
        imagen: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 30
    },
    queso: {
        id: 'queso',
        nombre: 'Queso',
        imagen: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 14
    },
    queso_rallado: {
        id: 'queso_rallado',
        nombre: 'Queso Rallado',
        imagen: 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 21
    },
    crema: {
        id: 'crema',
        nombre: 'Crema de Leche',
        imagen: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=300',
        categoria: 'lacteo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 14
    },
    
    // VERDURAS
    lechuga: {
        id: 'lechuga',
        nombre: 'Lechuga',
        imagen: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 5
    },
    tomate: {
        id: 'tomate',
        nombre: 'Tomate',
        imagen: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 8,
        duracion_dias: 7
    },
    cebolla: {
        id: 'cebolla',
        nombre: 'Cebolla',
        imagen: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?w=300',
        categoria: 'verdura',
        zona_heladera: 'afuera',
        temperatura: 18,
        duracion_dias: 30
    },
    zanahoria: {
        id: 'zanahoria',
        nombre: 'Zanahoria',
        imagen: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 14
    },
    pepino: {
        id: 'pepino',
        nombre: 'Pepino',
        imagen: 'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 7
    },
    morron: {
        id: 'morron',
        nombre: 'Morrón',
        imagen: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 10
    },
    brocoli: {
        id: 'brocoli',
        nombre: 'Brócoli',
        imagen: 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 7
    },
    papa: {
        id: 'papa',
        nombre: 'Papas',
        imagen: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300',
        categoria: 'verdura',
        zona_heladera: 'afuera',
        temperatura: 15,
        duracion_dias: 30
    },
    ajo: {
        id: 'ajo',
        nombre: 'Ajo',
        imagen: 'https://images.unsplash.com/photo-1588165171080-c89acfa5ee83?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 18,
        duracion_dias: 60
    },
    
    // ADEREZOS Y CONDIMENTOS
    mayonesa: {
        id: 'mayonesa',
        nombre: 'Mayonesa',
        imagen: 'https://images.unsplash.com/photo-1608068803864-fd1b3a98e7d6?w=300',
        categoria: 'aderezo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 60
    },
    mostaza: {
        id: 'mostaza',
        nombre: 'Mostaza',
        imagen: 'https://images.unsplash.com/photo-1582454613151-7fb7302b8e05?w=300',
        categoria: 'aderezo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 90
    },
    ketchup: {
        id: 'ketchup',
        nombre: 'Ketchup',
        imagen: 'https://images.unsplash.com/photo-1628289876359-26c7e89d1e40?w=300',
        categoria: 'aderezo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 90
    },
    aceitunas: {
        id: 'aceitunas',
        nombre: 'Aceitunas',
        imagen: 'https://images.unsplash.com/photo-1577003833154-a2e6762f0a8f?w=300',
        categoria: 'aderezo',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 180
    },
    
    // FREEZER
    hielo: {
        id: 'hielo',
        nombre: 'Hielo',
        imagen: 'https://images.unsplash.com/photo-1563428537-afe72eb83fd4?w=300',
        categoria: 'freezer',
        zona_heladera: 'freezer',
        temperatura: -18,
        duracion_dias: 365
    },
    helado: {
        id: 'helado',
        nombre: 'Helado',
        imagen: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=300',
        categoria: 'freezer',
        zona_heladera: 'freezer',
        temperatura: -18,
        duracion_dias: 180
    },
    vegetales_congelados: {
        id: 'vegetales_congelados',
        nombre: 'Vegetales Congelados',
        imagen: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=300',
        categoria: 'freezer',
        zona_heladera: 'freezer',
        temperatura: -18,
        duracion_dias: 365
    },
    
    // BEBIDAS
    jugo: {
        id: 'jugo',
        nombre: 'Jugo',
        imagen: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300',
        categoria: 'bebida',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 7
    },
    gaseosa: {
        id: 'gaseosa',
        nombre: 'Gaseosa',
        imagen: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=300',
        categoria: 'bebida',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 90
    },
    
    // NO VA EN HELADERA
    pan: {
        id: 'pan',
        nombre: 'Pan',
        imagen: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300',
        categoria: 'panificado',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 3
    },
    sal: {
        id: 'sal',
        nombre: 'Sal',
        imagen: 'https://images.unsplash.com/photo-1563199094-ba6e24bfff7f?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 3650
    },
    azucar: {
        id: 'azucar',
        nombre: 'Azúcar',
        imagen: 'https://images.unsplash.com/photo-1563368605-72cdb692fea9?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 3650
    },
    aceite: {
        id: 'aceite',
        nombre: 'Aceite',
        imagen: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 365
    }
};

// ========== RECETAS ==========
const RECETAS = {
    pastel_papas: {
        id: 'pastel_papas',
        nombre: 'Pastel de Papas',
        ingredientes_base: ['papa', 'carne_picada', 'cebolla', 'huevos'],
        ingredientes_opcionales: ['aceitunas', 'sal'],
        distractores: ['tomate', 'lechuga', 'pan', 'azucar', 'pescado'],
        pasos: [
            'Hervir las papas con piel en agua con sal',
            'Hacer un sofrito de cebolla hasta transparentar',
            'Agregar la carne picada y cocinar hasta dorar',
            'Pelar las papas y hacer un puré con leche y manteca',
            'En una fuente, poner la carne abajo y el puré arriba',
            'Pintar con huevo batido',
            'Gratinar en el horno a 200°C por 15 minutos'
        ]
    },
    lasagna: {
        id: 'lasagna',
        nombre: 'Lasaña',
        ingredientes_base: ['carne_picada', 'cebolla', 'tomate', 'queso', 'leche'],
        ingredientes_opcionales: ['sal', 'aceite'],
        distractores: ['papa', 'lechuga', 'arroz', 'azucar', 'pescado'],
        pasos: [
            'Hacer la salsa bolognesa con carne, cebolla y tomate',
            'Preparar la salsa blanca con leche, manteca y harina',
            'Hervir las láminas de lasaña en agua con sal',
            'En una fuente, alternar capas: salsa, pasta, queso',
            'Terminar con salsa blanca y queso rallado',
            'Hornear a 180°C por 30 minutos hasta gratinar'
        ]
    },
    budin_ingles: {
        id: 'budin_ingles',
        nombre: 'Budín Inglés',
        ingredientes_base: ['huevos', 'azucar', 'manteca', 'leche'],
        ingredientes_opcionales: ['sal'],
        distractores: ['carne_picada', 'lechuga', 'papa', 'pollo', 'pescado'],
        pasos: [
            'Batir la manteca pomada con el azúcar hasta cremar',
            'Agregar los huevos de a uno, batiendo bien',
            'Incorporar la harina tamizada alternando con la leche',
            'Agregar frutas secas y pasas enharinadas',
            'Volcar en molde de budín enmantecado y enharinado',
            'Hornear a 170°C por 45 minutos'
        ]
    },
    ensalada_completa: {
        id: 'ensalada_completa',
        nombre: 'Ensalada Completa',
        ingredientes_base: ['lechuga', 'tomate', 'cebolla', 'huevos', 'zanahoria'],
        ingredientes_opcionales: ['aceitunas', 'aceite', 'sal'],
        distractores: ['carne_picada', 'azucar', 'leche', 'pan', 'arroz'],
        pasos: [
            'Lavar bien la lechuga hoja por hoja',
            'Hervir los huevos durante 10 minutos',
            'Pelar y rallar la zanahoria',
            'Cortar el tomate en gajos',
            'Cortar la cebolla en aros finos',
            'Mezclar todo en un bol grande y condimentar'
        ]
    },
    milanesas: {
        id: 'milanesas',
        nombre: 'Milanesas',
        ingredientes_base: ['bife', 'huevos', 'pan'],
        ingredientes_opcionales: ['sal', 'aceite'],
        distractores: ['leche', 'azucar', 'lechuga', 'arroz', 'manteca'],
        pasos: [
            'Golpear los bifes con un martillo hasta aplanar',
            'Salar los bifes por ambos lados',
            'Batir los huevos en un plato hondo',
            'Pasar cada bife por huevo',
            'Pasar por pan rallado presionando bien',
            'Freír en aceite caliente o cocinar al horno'
        ]
    }
};

// ========== COLORES POST-GAME (12 proyectivos) ==========
// Usa el shared system de /games/shared/mood-modals.js
// Solo referencia para fallback
const COLORES_PROYECTIVOS = [
    '#FF0000', '#FF8C00', '#FFD700', '#008000',
    '#00CED1', '#87CEEB', '#00008B', '#800080',
    '#FF69B4', '#8B4513', '#808080', '#000000'
];

// ========== LICUADORA: COMBINACIONES ==========
const LICUADOS = {
    banana_frutilla: {
        nombre: 'Licuado de Banana y Frutilla',
        secuencia_correcta: ['leche', 'banana', 'frutilla', 'hielo'],
        explicacion: 'Primero el líquido para que las cuchillas no se traben, luego las frutas blandas y al final el hielo.'
    },
    tropical: {
        nombre: 'Smoothie Tropical',
        secuencia_correcta: ['jugo_naranja', 'banana', 'mango', 'hielo'],
        explicacion: 'El líquido siempre primero. Las frutas más blandas antes. El hielo siempre al final para no dañar cuchillas.'
    }
};

// ========== MESA: ELEMENTOS ==========
const ELEMENTOS_MESA = {
    mantel: { id: 'mantel', nombre: 'Mantel', emoji: '🧺', zona: 'base', orden: 1 },
    plato_base: { id: 'plato_base', nombre: 'Plato grande', emoji: '🍽️', zona: 'centro', orden: 2 },
    plato_hondo: { id: 'plato_hondo', nombre: 'Plato hondo', emoji: '🥣', zona: 'centro', orden: 3 },
    tenedor: { id: 'tenedor', nombre: 'Tenedor', emoji: '🍴', zona: 'izquierda', orden: 4 },
    cuchillo: { id: 'cuchillo', nombre: 'Cuchillo', emoji: '🔪', zona: 'derecha', orden: 5 },
    cuchara: { id: 'cuchara', nombre: 'Cuchara', emoji: '🥄', zona: 'derecha', orden: 6 },
    vaso: { id: 'vaso', nombre: 'Vaso', emoji: '🥛', zona: 'derecha_arriba', orden: 7 },
    servilleta: { id: 'servilleta', nombre: 'Servilleta', emoji: '🧻', zona: 'izquierda', orden: 8 },
    // Distractores
    sarten: { id: 'sarten', nombre: 'Sartén', emoji: '🍳', zona: 'NO_VA', orden: 0 },
    olla: { id: 'olla', nombre: 'Olla', emoji: '🫕', zona: 'NO_VA', orden: 0 },
    esponja: { id: 'esponja', nombre: 'Esponja', emoji: '🧽', zona: 'NO_VA', orden: 0 },
    tabla: { id: 'tabla', nombre: 'Tabla de picar', emoji: '🪵', zona: 'NO_VA', orden: 0 }
};

// ========== HABITACIÓN: ROPA ==========
const ROPA = {
    camisa: { id: 'camisa', nombre: 'Camisa', emoji: '👔', destino: 'placard' },
    pantalon: { id: 'pantalon', nombre: 'Pantalón', emoji: '👖', destino: 'placard' },
    campera: { id: 'campera', nombre: 'Campera', emoji: '🧥', destino: 'placard' },
    vestido: { id: 'vestido', nombre: 'Vestido', emoji: '👗', destino: 'placard' },
    remera: { id: 'remera', nombre: 'Remera', emoji: '👕', destino: 'cajon' },
    medias: { id: 'medias', nombre: 'Medias', emoji: '🧦', destino: 'cajon' },
    ropa_interior: { id: 'ropa_interior', nombre: 'Ropa interior', emoji: '🩲', destino: 'cajon' },
    pijama: { id: 'pijama', nombre: 'Pijama', emoji: '🛌', destino: 'cajon' },
    zapatos: { id: 'zapatos', nombre: 'Zapatos', emoji: '👞', destino: 'zapatera' },
    zapatillas: { id: 'zapatillas', nombre: 'Zapatillas', emoji: '👟', destino: 'zapatera' },
    ojotas: { id: 'ojotas', nombre: 'Ojotas', emoji: '🩴', destino: 'zapatera' },
    botas: { id: 'botas', nombre: 'Botas', emoji: '🥾', destino: 'zapatera' },
    // Distractores - NO va en ninguno
    paraguas: { id: 'paraguas', nombre: 'Paraguas', emoji: '☂️', destino: 'NO_VA' },
    toalla: { id: 'toalla', nombre: 'Toalla', emoji: '🧖', destino: 'NO_VA' }
};

// ========== ESTADO DEL JUEGO ==========
const gameState = {
    patientId: null,
    patientDni: 'HDD-2026-DEMO',
    sessionId: null,
    currentLevel: 1,
    totalLevels: 6,
    startTime: null,
    
    // Métricas globales
    totalCorrect: 0,
    totalErrors: 0,
    
    // Métricas por nivel
    levelMetrics: [],
    
    // Modal pre-game
    preMood: {
        q1: '',
        q2: '',
        q3: ''
    },
    
    // Modal post-game
    postMood: {
        intensity: '',
        color: ''
    },
    
    // Biometric data per level (array)
    biometricData: [],
    
    // Player session history (loaded from Supabase)
    playerHistory: [],
    
    // Game registry
    gameId: null
};
