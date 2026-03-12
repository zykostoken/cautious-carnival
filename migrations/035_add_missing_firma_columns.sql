-- Migration 035: Add missing firma/signature columns to HCE tables
-- FIX: hdd-hce.mts queries firma_nombre, firma_especialidad, firma_matricula, firma_role
-- and registrado_por_nombre, registrado_por_role — none existed, causing HTTP 500 on HCE load.

-- hce_evoluciones: firma columns for digital signature compliance (Ley 26.529)
ALTER TABLE hce_evoluciones 
ADD COLUMN IF NOT EXISTS firma_nombre VARCHAR(255),
ADD COLUMN IF NOT EXISTS firma_especialidad VARCHAR(255),
ADD COLUMN IF NOT EXISTS firma_matricula VARCHAR(100),
ADD COLUMN IF NOT EXISTS firma_role VARCHAR(50);

COMMENT ON COLUMN hce_evoluciones.firma_nombre IS 'Nombre del profesional al momento de firmar la evolución';
COMMENT ON COLUMN hce_evoluciones.firma_especialidad IS 'Especialidad del profesional al momento de firmar';
COMMENT ON COLUMN hce_evoluciones.firma_matricula IS 'Matrícula del profesional al momento de firmar';
COMMENT ON COLUMN hce_evoluciones.firma_role IS 'Rol del profesional al momento de firmar';

-- hce_signos_vitales: registrado_por_nombre and registrado_por_role
ALTER TABLE hce_signos_vitales
ADD COLUMN IF NOT EXISTS registrado_por_nombre VARCHAR(255),
ADD COLUMN IF NOT EXISTS registrado_por_role VARCHAR(50);

COMMENT ON COLUMN hce_signos_vitales.registrado_por_nombre IS 'Nombre del profesional que registró los signos vitales';
COMMENT ON COLUMN hce_signos_vitales.registrado_por_role IS 'Rol del profesional que registró los signos vitales';

-- hce_evoluciones: original_contenido for addendum pattern (Ley 26.529 Art 18)
ALTER TABLE hce_evoluciones
ADD COLUMN IF NOT EXISTS original_contenido TEXT;
