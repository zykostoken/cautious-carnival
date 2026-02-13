-- ====================================================================
-- MIGRATION: Color Psychology Table
-- Purpose: Store psychological meaning of 60 colors (12 families × 5 intensities)
-- Date: 2026-02-13
-- ====================================================================

CREATE TABLE IF NOT EXISTS hdd_color_psychology (
  color_hex VARCHAR(7) PRIMARY KEY,
  color_family VARCHAR(20) NOT NULL,
  intensity VARCHAR(20) NOT NULL CHECK (intensity IN ('vivid', 'soft', 'pastel', 'dark', 'muted')),
  psychological_tags TEXT[] NOT NULL,
  clinical_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_color_family ON hdd_color_psychology(color_family);
CREATE INDEX idx_color_intensity ON hdd_color_psychology(intensity);
CREATE INDEX idx_psychological_tags ON hdd_color_psychology USING GIN(psychological_tags);

-- ====================================================================
-- INSERT: 60 Colors with Psychological Tags
-- ====================================================================

-- VIVID COLORS (Alta energía, activación)
INSERT INTO hdd_color_psychology (color_hex, color_family, intensity, psychological_tags, clinical_notes) VALUES
('#FF0000', 'red', 'vivid', ARRAY['ira intensa', 'energía alta', 'agitación', 'alerta'], 'Rojo puro - Activación extrema'),
('#DC143C', 'red', 'vivid', ARRAY['pasión', 'urgencia', 'tensión'], 'Carmesí - Emoción intensa'),
('#FF8C00', 'orange', 'vivid', ARRAY['entusiasmo', 'motivación', 'creatividad'], 'Naranja - Energía positiva'),
('#FFD700', 'yellow', 'vivid', ARRAY['alegría', 'optimismo', 'ansiedad'], 'Amarillo dorado - Activación mental'),
('#00FF00', 'green', 'vivid', ARRAY['crecimiento', 'renovación', 'esperanza'], 'Verde brillante - Vitalidad'),
('#32CD32', 'green', 'vivid', ARRAY['frescura', 'energía natural', 'equilibrio activo'], 'Verde lima - Dinamismo'),
('#0000FF', 'blue', 'vivid', ARRAY['profundidad', 'introspección intensa', 'melancolía aguda'], 'Azul puro - Emoción profunda'),
('#1E90FF', 'blue', 'vivid', ARRAY['claridad mental', 'enfoque', 'determinación'], 'Azul dodger - Concentración'),
('#8B00FF', 'purple', 'vivid', ARRAY['creatividad extrema', 'espiritualidad', 'confusión'], 'Violeta - Pensamiento no convencional'),
('#FF00FF', 'magenta', 'vivid', ARRAY['intensidad emocional', 'impulsividad', 'pasión'], 'Magenta - Emoción desbordante'),
('#8B4513', 'brown', 'vivid', ARRAY['anclaje', 'peso emocional', 'estabilidad forzada'], 'Marrón - Gravedad'),
('#696969', 'grey', 'vivid', ARRAY['neutralidad tensa', 'confusión', 'indecisión'], 'Gris oscuro - Incertidumbre');

-- SOFT COLORS (Energía moderada, regulada)
INSERT INTO hdd_color_psychology (color_hex, color_family, intensity, psychological_tags, clinical_notes) VALUES
('#FFB6C1', 'pink', 'soft', ARRAY['ternura', 'cuidado', 'vulnerabilidad positiva'], 'Rosa suave - Apertura emocional'),
('#FF69B4', 'pink', 'soft', ARRAY['afecto', 'calidez', 'conexión'], 'Rosa medio - Vínculo afectivo'),
('#FFA07A', 'orange', 'soft', ARRAY['sociabilidad', 'comunicación', 'comodidad'], 'Salmón - Interacción social'),
('#FFDAB9', 'orange', 'soft', ARRAY['suavidad', 'tranquilidad cálida', 'confort'], 'Durazno - Confort emocional'),
('#90EE90', 'green', 'soft', ARRAY['calma', 'sanación', 'equilibrio'], 'Verde suave - Recuperación'),
('#98FB98', 'green', 'soft', ARRAY['serenidad', 'paz', 'armonía'], 'Verde pálido - Tranquilidad'),
('#87CEEB', 'blue', 'soft', ARRAY['claridad', 'apertura', 'ligereza'], 'Azul cielo - Expansión mental'),
('#87CEFA', 'blue', 'soft', ARRAY['calma mental', 'reflexión', 'contemplación'], 'Azul cielo claro - Paz cognitiva'),
('#DDA0DD', 'purple', 'soft', ARRAY['creatividad moderada', 'intuición', 'sensibilidad'], 'Ciruela - Percepción sutil'),
('#FF69B4', 'pink', 'soft', ARRAY['calidez emocional', 'aceptación', 'ternura'], 'Rosa hot soft - Afecto'),
('#CD853F', 'brown', 'soft', ARRAY['estabilidad', 'seguridad', 'fundamento'], 'Marrón claro - Anclaje suave'),
('#A9A9A9', 'grey', 'soft', ARRAY['neutralidad', 'descanso mental', 'pausa'], 'Gris medio - Punto neutro');

-- PASTEL COLORS (Baja intensidad, suavidad extrema)
INSERT INTO hdd_color_psychology (color_hex, color_family, intensity, psychological_tags, clinical_notes) VALUES
('#FFE4E1', 'pink', 'pastel', ARRAY['dulzura', 'inocencia', 'fragilidad positiva'], 'Rosa neblina - Delicadeza'),
('#F08080', 'red', 'pastel', ARRAY['afecto ligero', 'emoción suave', 'calidez tenue'], 'Coral claro - Ternura'),
('#FFDEAD', 'beige', 'pastel', ARRAY['simplicidad', 'naturalidad', 'autenticidad'], 'Blanco navajo - Esencia'),
('#F0E68C', 'yellow', 'pastel', ARRAY['alegría suave', 'ligereza', 'optimismo tenue'], 'Khaki - Positividad sutil'),
('#E0FFE0', 'green', 'pastel', ARRAY['renovación suave', 'esperanza tenue', 'crecimiento lento'], 'Verde menta - Inicio'),
('#F0FFF0', 'green', 'pastel', ARRAY['pureza', 'frescura', 'nuevo comienzo'], 'Rocío de miel - Renacimiento'),
('#E6E6FA', 'purple', 'pastel', ARRAY['calma espiritual', 'serenidad profunda', 'paz interior'], 'Lavanda - Quietud'),
('#B0E0E6', 'blue', 'pastel', ARRAY['ligereza mental', 'claridad suave', 'transparencia emocional'], 'Azul polvo - Apertura'),
('#DDA0DD', 'purple', 'pastel', ARRAY['sensibilidad extrema', 'empatía', 'apertura emocional'], 'Ciruela claro - Receptividad'),
('#FFB6C1', 'pink', 'pastel', ARRAY['suavidad extrema', 'vulnerabilidad', 'apertura total'], 'Rosa claro - Entrega'),
('#D2B48C', 'tan', 'pastel', ARRAY['estabilidad suave', 'arraigo ligero', 'presencia tenue'], 'Tan - Anclaje sutil'),
('#D3D3D3', 'grey', 'pastel', ARRAY['neutralidad total', 'desconexión leve', 'descanso profundo'], 'Gris claro - Pausa total');

-- DARK COLORS (Baja energía, sombras)
INSERT INTO hdd_color_psychology (color_hex, color_family, intensity, psychological_tags, clinical_notes) VALUES
('#8B0000', 'red', 'dark', ARRAY['ira contenida', 'resentimiento', 'dolor profundo'], 'Rojo oscuro - Rabia internalizada'),
('#800020', 'red', 'dark', ARRAY['tristeza intensa', 'pena', 'duelo'], 'Burgundy - Luto emocional'),
('#FF4500', 'orange', 'dark', ARRAY['frustración', 'impaciencia', 'irritabilidad'], 'Rojo naranja - Molestia'),
('#B8860B', 'yellow', 'dark', ARRAY['ansiedad crónica', 'preocupación persistente', 'tensión'], 'Oro oscuro - Inquietud'),
('#006400', 'green', 'dark', ARRAY['estancamiento', 'celos', 'posesividad'], 'Verde oscuro - Bloqueo'),
('#2F4F4F', 'grey', 'dark', ARRAY['depresión', 'aislamiento', 'desesperanza'], 'Gris pizarra oscuro - Vacío'),
('#00008B', 'blue', 'dark', ARRAY['depresión profunda', 'desesperación', 'abismo'], 'Azul oscuro - Pozo emocional'),
('#191970', 'blue', 'dark', ARRAY['oscuridad mental', 'confusión profunda', 'pérdida'], 'Azul medianoche - Desorientación'),
('#4B0082', 'purple', 'dark', ARRAY['pensamiento obsesivo', 'rumiación', 'confusión espiritual'], 'Índigo - Obsesión'),
('#8B008B', 'magenta', 'dark', ARRAY['dolor emocional intenso', 'herida profunda', 'trauma'], 'Magenta oscuro - Cicatriz'),
('#654321', 'brown', 'dark', ARRAY['peso extremo', 'carga', 'agotamiento'], 'Marrón oscuro - Lastre'),
('#2F4F4F', 'grey', 'dark', ARRAY['depresión severa', 'anhedonia', 'desconexión total'], 'Gris pizarra - Apagón emocional');

-- MUTED COLORS (Energía apagada, desaturada)
INSERT INTO hdd_color_psychology (color_hex, color_family, intensity, psychological_tags, clinical_notes) VALUES
('#BC8F8F', 'pink', 'muted', ARRAY['cansancio emocional', 'agotamiento afectivo', 'desgaste'], 'Rosa marrón - Fatiga'),
('#CD5C5C', 'red', 'muted', ARRAY['irritabilidad contenida', 'molestia crónica', 'cansancio mental'], 'Rojo indio - Hastío'),
('#D2691E', 'orange', 'muted', ARRAY['apatía social', 'retraimiento', 'desconexión'], 'Chocolate - Distancia'),
('#DAA520', 'yellow', 'muted', ARRAY['preocupación persistente', 'ansiedad de fondo', 'tensión crónica'], 'Vara de oro - Alerta constante'),
('#8FBC8F', 'green', 'muted', ARRAY['estancamiento emocional', 'estabilidad forzada', 'calma falsa'], 'Verde mar oscuro - Quietud forzada'),
('#66CDAA', 'green', 'muted', ARRAY['equilibrio forzado', 'control excesivo', 'represión'], 'Aguamarina medio - Contención'),
('#4682B4', 'blue', 'muted', ARRAY['tristeza contenida', 'melancolía silenciosa', 'pena callada'], 'Azul acero - Dolor silencioso'),
('#5F9EA0', 'blue', 'muted', ARRAY['desconexión emocional', 'frialdad', 'distancia afectiva'], 'Cadet blue - Alejamiento'),
('#9370DB', 'purple', 'muted', ARRAY['confusión persistente', 'ambivalencia', 'indecisión crónica'], 'Púrpura medio - Duda'),
('#BA55D3', 'purple', 'muted', ARRAY['sensibilidad dolorosa', 'vulnerabilidad defensiva', 'protección excesiva'], 'Orquídea medio - Defensa'),
('#A0522D', 'brown', 'muted', ARRAY['carga constante', 'peso emocional crónico', 'obligación'], 'Siena - Deber'),
('#808080', 'grey', 'muted', ARRAY['apatía', 'indiferencia', 'desconexión total'], 'Gris - Neutralidad absoluta');

-- ====================================================================
-- VIEW: Joined mood checkins with color psychology
-- ====================================================================

CREATE OR REPLACE VIEW v_hdd_mood_color_analysis AS
SELECT 
    mc.id,
    mc.patient_id,
    p.full_name AS patient_name,
    mc.mood_value,
    mc.color_hex,
    mc.color_intensity,
    mc.context,
    mc.note,
    mc.created_at AS checkin_date,
    cp.color_family,
    cp.psychological_tags,
    cp.clinical_notes
FROM hdd_mood_checkins mc
LEFT JOIN hdd_patients p ON mc.patient_id = p.id
LEFT JOIN hdd_color_psychology cp ON mc.color_hex = cp.color_hex
ORDER BY mc.created_at DESC;

-- ====================================================================
-- TRIGGER: Update updated_at timestamp
-- ====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_hdd_color_psychology_updated_at 
    BEFORE UPDATE ON hdd_color_psychology
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- GRANT PERMISSIONS
-- ====================================================================

-- Allow authenticated users to read
GRANT SELECT ON hdd_color_psychology TO authenticated;
GRANT SELECT ON v_hdd_mood_color_analysis TO authenticated;

-- Allow service role to write
GRANT ALL ON hdd_color_psychology TO service_role;

-- ====================================================================
-- COMPLETE
-- ====================================================================

SELECT 'Color psychology table created successfully! Total colors: ' || COUNT(*) 
FROM hdd_color_psychology;
