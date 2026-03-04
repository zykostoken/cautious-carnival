// ========== CONFIGURACIÓN DE SUPABASE ==========
var sb = window.sbClient || null;

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
        imagen: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=300',
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
        imagen: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300',
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
        temperatura: 6,
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
        imagen: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=300',
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
    pan_rallado: {
        id: 'pan_rallado',
        nombre: 'Pan Rallado',
        imagen: 'https://images.unsplash.com/photo-1586444248879-bc604bc77bdd?w=300',
        categoria: 'cereal',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 180
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
    },

    // EXTRAS para recetas
    arroz: {
        id: 'arroz',
        nombre: 'Arroz',
        imagen: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300',
        categoria: 'cereal',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 365
    },
    harina: {
        id: 'harina',
        nombre: 'Harina',
        imagen: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=300',
        categoria: 'cereal',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 180
    },
    pasas_uva: {
        id: 'pasas_uva',
        nombre: 'Pasas de Uva',
        imagen: 'https://images.unsplash.com/photo-1596273501691-9dba1b5f5337?w=300',
        categoria: 'fruto_seco',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 180
    },
    canela: {
        id: 'canela',
        nombre: 'Canela',
        imagen: 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 365
    },
    frutas_secas: {
        id: 'frutas_secas',
        nombre: 'Frutas Secas',
        imagen: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=300',
        categoria: 'fruto_seco',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 180
    },
    vinagre: {
        id: 'vinagre',
        nombre: 'Vinagre',
        imagen: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=300',
        categoria: 'aderezo',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 365
    },
    limon: {
        id: 'limon',
        nombre: 'Limón',
        imagen: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=300',
        categoria: 'fruta',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 14
    },
    perejil: {
        id: 'perejil',
        nombre: 'Perejil',
        imagen: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=300',
        categoria: 'verdura',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 7
    },
    nuez_moscada: {
        id: 'nuez_moscada',
        nombre: 'Nuez Moscada',
        imagen: 'https://images.unsplash.com/photo-1599909533503-f2781e5dcfd4?w=300',
        categoria: 'condimento',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 365
    },
    ciruelas_pasas: {
        id: 'ciruelas_pasas',
        nombre: 'Ciruelas Pasas',
        imagen: 'https://images.unsplash.com/photo-1590282610690-6bbb53fa2e5f?w=300',
        categoria: 'fruto_seco',
        zona_heladera: 'afuera',
        temperatura: 20,
        duracion_dias: 180
    },

    // FRUTAS para licuados
    banana: {
        id: 'banana',
        nombre: 'Banana',
        imagen: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300',
        categoria: 'fruta',
        zona_heladera: 'afuera',
        temperatura: 18,
        duracion_dias: 5
    },
    frutilla: {
        id: 'frutilla',
        nombre: 'Frutilla',
        imagen: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=300',
        categoria: 'fruta',
        zona_heladera: 'verduras',
        temperatura: 4,
        duracion_dias: 5
    },
    mango: {
        id: 'mango',
        nombre: 'Mango',
        imagen: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=300',
        categoria: 'fruta',
        zona_heladera: 'verduras',
        temperatura: 6,
        duracion_dias: 7
    },
    jugo_naranja: {
        id: 'jugo_naranja',
        nombre: 'Jugo de Naranja',
        imagen: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=300',
        categoria: 'bebida',
        zona_heladera: 'fria',
        temperatura: 4,
        duracion_dias: 7
    }
};

// ========== RECETAS ==========
const RECETAS = {
    pastel_papas: {
        id: 'pastel_papas',
        nombre: 'Pastel de Papas',
        ingredientes_base: ['papa', 'carne_picada', 'cebolla', 'huevos', 'aceite', 'sal'],
        ingredientes_opcionales: ['aceitunas', 'pasas_uva', 'leche', 'manteca', 'canela', 'azucar', 'queso', 'ciruelas_pasas'],
        distractores: ['pescado', 'lechuga', 'arroz', 'banana', 'helado'],
        pasos: [
            'Hervir las papas con piel en agua con sal',
            'Hacer un sofrito de cebolla hasta transparentar',
            'Agregar la carne picada y cocinar hasta dorar',
            'Pelar las papas y hacer un puré con leche y manteca',
            'En una fuente, poner la carne abajo y el puré arriba',
            'Pintar con huevo batido',
            'Gratinar en el horno a 200°C por 15 minutos'
        ],
        tips_receta: {
            consejo_clave: 'Las papas se hierven CON piel para que no absorban agua. El puré queda más seco y firme.',
            error_comun: 'Si el puré queda aguado, el pastel no se sostiene. Escurrí bien las papas.',
            logica: 'Las aceitunas, pasas de uva y ciruelas pasas son extras clásicos del pastel. La canela, el azúcar y el queso son opcionales según la receta familiar.'
        }
    },
    lasagna: {
        id: 'lasagna',
        nombre: 'Lasaña',
        ingredientes_base: ['carne_picada', 'cebolla', 'tomate', 'queso', 'leche', 'sal'],
        ingredientes_opcionales: ['aceite', 'queso_rallado', 'manteca', 'harina'],
        distractores: ['pescado', 'lechuga', 'arroz', 'azucar', 'banana'],
        pasos: [
            'Hacer la salsa bolognesa con carne, cebolla y tomate',
            'Preparar la salsa blanca con leche, manteca y harina',
            'Hervir las láminas de lasaña en agua con sal',
            'En una fuente, alternar capas: salsa, pasta, queso',
            'Terminar con salsa blanca y queso rallado',
            'Hornear a 180°C por 30 minutos hasta gratinar'
        ],
        tips_receta: {
            consejo_clave: 'La salsa blanca se hace con leche, manteca y harina. Si se forman grumos, batir enérgicamente.',
            error_comun: 'Las capas deben alternarse: bolognesa, pasta, blanca, queso. Si ponés todo junto, no se arma.',
            logica: 'El queso rallado es extra para gratinar. El arroz y la banana NO tienen nada que ver con la lasaña.'
        }
    },
    budin_ingles: {
        id: 'budin_ingles',
        nombre: 'Budín Inglés',
        ingredientes_base: ['huevos', 'azucar', 'manteca', 'leche', 'harina'],
        ingredientes_opcionales: ['sal', 'pasas_uva', 'frutas_secas', 'canela'],
        distractores: ['carne_picada', 'lechuga', 'papa', 'pollo', 'tomate'],
        pasos: [
            'Batir la manteca pomada con el azúcar hasta cremar',
            'Agregar los huevos de a uno, batiendo bien',
            'Incorporar la harina tamizada alternando con la leche',
            'Agregar frutas secas y pasas enharinadas',
            'Volcar en molde de budín enmantecado y enharinado',
            'Hornear a 170°C por 45 minutos'
        ],
        tips_receta: {
            consejo_clave: 'Las pasas y frutas secas se enharinan ANTES de mezclarlas para que no se hundan al fondo.',
            error_comun: 'Si la manteca no está a temperatura ambiente, no crema bien con el azúcar.',
            logica: 'Pasas de uva, frutas secas y canela son extras clásicos de budín. La carne y el pollo son ingredientes salados que NO van.'
        }
    },
    ensalada_completa: {
        id: 'ensalada_completa',
        nombre: 'Ensalada Completa',
        ingredientes_base: ['lechuga', 'tomate', 'cebolla', 'huevos', 'aceite', 'sal'],
        ingredientes_opcionales: ['aceitunas', 'zanahoria', 'vinagre', 'limon'],
        distractores: ['carne_picada', 'azucar', 'arroz', 'canela', 'helado'],
        pasos: [
            'Lavar bien la lechuga hoja por hoja',
            'Hervir los huevos durante 10 minutos',
            'Pelar y rallar la zanahoria',
            'Cortar el tomate en gajos',
            'Cortar la cebolla en aros finos',
            'Mezclar todo en un bol grande y condimentar'
        ],
        tips_receta: {
            consejo_clave: 'Lavar CADA hoja de lechuga individualmente elimina tierra y posibles insectos.',
            error_comun: 'Si cortás la lechuga con cuchillo de metal, se oxida más rápido. Mejor trozar con las manos.',
            logica: 'El aceite, vinagre y limón son aderezos clásicos de ensalada. El azúcar y la canela son para postres, NO van acá.'
        }
    },
    milanesas: {
        id: 'milanesas',
        nombre: 'Milanesas',
        ingredientes_base: ['bife', 'huevos', 'pan_rallado', 'aceite', 'sal'],
        ingredientes_opcionales: ['ajo', 'limon', 'perejil', 'nuez_moscada', 'leche'],
        distractores: ['azucar', 'arroz', 'banana', 'helado', 'pescado'],
        pasos: [
            'Golpear los bifes con un martillo hasta aplanar',
            'Salar los bifes por ambos lados',
            'Batir los huevos en un plato hondo',
            'Pasar cada bife por huevo',
            'Pasar por pan rallado presionando bien',
            'Freír en aceite caliente o cocinar al horno'
        ],
        tips_receta: {
            consejo_clave: 'Aplanar el bife asegura cocción pareja. El pan rallado debe presionarse bien para que no se despegue.',
            error_comun: 'Si el aceite no está bien caliente, la milanesa absorbe grasa y queda pesada.',
            logica: 'El ajo y perejil saborizan el huevo batido. La leche y nuez moscada tiernizan la carne al remojarla. El azúcar NO va en milanesas.'
        }
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
