-- ============================================================
-- MIGRATION 016: Historia Clínica Electrónica (HCE)
-- Módulos: datos filiatorios ampliados, antecedentes,
--          diagnósticos, medicación, evoluciones clínicas,
--          estudios complementarios
-- Cumplimiento: Ley 26.529 (Argentina) - retención mínima 10 años
-- ============================================================

-- ===========================================
-- 1. DATOS FILIATORIOS AMPLIADOS
-- Extends hdd_patients with full demographic data
-- ===========================================
ALTER TABLE hdd_patients
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS sexo VARCHAR(20),                    -- 'masculino','femenino','otro','no_especifica'
  ADD COLUMN IF NOT EXISTS genero VARCHAR(50),                   -- identidad de género autopercibida
  ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(100) DEFAULT 'Argentina',
  ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30),             -- 'soltero/a','casado/a','divorciado/a','viudo/a','union_de_hecho'
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS localidad VARCHAR(200),
  ADD COLUMN IF NOT EXISTS provincia VARCHAR(100) DEFAULT 'Buenos Aires',
  ADD COLUMN IF NOT EXISTS codigo_postal VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ocupacion VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nivel_educativo VARCHAR(50),          -- 'primario','secundario','terciario','universitario','posgrado'
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono VARCHAR(32),
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion VARCHAR(100),
  ADD COLUMN IF NOT EXISTS grupo_sanguineo VARCHAR(10),          -- 'A+','A-','B+','B-','AB+','AB-','O+','O-'
  ADD COLUMN IF NOT EXISTS numero_historia_clinica VARCHAR(20);  -- Número interno de HC (ej: HC-00001)

-- Generar número de HC automáticamente si no existe
CREATE OR REPLACE FUNCTION generate_hc_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_historia_clinica IS NULL THEN
    NEW.numero_historia_clinica := 'HC-' || LPAD(NEW.id::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hc_number') THEN
    CREATE TRIGGER trg_hc_number
      BEFORE INSERT ON hdd_patients
      FOR EACH ROW EXECUTE FUNCTION generate_hc_number();
  END IF;
END $$;

-- Update existing patients with HC numbers
UPDATE hdd_patients
SET numero_historia_clinica = 'HC-' || LPAD(id::TEXT, 5, '0')
WHERE numero_historia_clinica IS NULL;

-- ===========================================
-- 2. ANTECEDENTES
-- Personal, familiar, quirúrgico, alérgico, hábitos
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_antecedentes (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  tipo VARCHAR(30) NOT NULL,  -- 'personal','familiar','quirurgico','alergico','habito','perinatal','ginecologico'
  descripcion TEXT NOT NULL,
  fecha_aproximada VARCHAR(50),  -- Texto libre: "2020", "infancia", "hace 5 años"
  observaciones TEXT,
  registrado_por INTEGER REFERENCES healthcare_professionals(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_antecedentes_patient ON hce_antecedentes(patient_id);
CREATE INDEX IF NOT EXISTS idx_hce_antecedentes_tipo ON hce_antecedentes(patient_id, tipo);

-- ===========================================
-- 3. DIAGNÓSTICOS (CIE-10 / DSM-5)
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_diagnosticos (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  codigo VARCHAR(20),             -- CIE-10 o DSM-5 code (ej: F20.0, F32.1)
  sistema VARCHAR(10) DEFAULT 'CIE-10',  -- 'CIE-10','DSM-5'
  descripcion TEXT NOT NULL,      -- Nombre del diagnóstico
  tipo VARCHAR(20) DEFAULT 'principal', -- 'principal','secundario','diferencial'
  estado VARCHAR(20) DEFAULT 'activo',  -- 'activo','resuelto','en_estudio'
  fecha_diagnostico DATE DEFAULT CURRENT_DATE,
  fecha_resolucion DATE,
  diagnosticado_por INTEGER REFERENCES healthcare_professionals(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_diagnosticos_patient ON hce_diagnosticos(patient_id);
CREATE INDEX IF NOT EXISTS idx_hce_diagnosticos_estado ON hce_diagnosticos(patient_id, estado);
CREATE INDEX IF NOT EXISTS idx_hce_diagnosticos_codigo ON hce_diagnosticos(codigo);

-- ===========================================
-- 4. MEDICACIÓN ACTUAL
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_medicacion (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  droga VARCHAR(255) NOT NULL,           -- Nombre genérico
  nombre_comercial VARCHAR(255),         -- Nombre comercial
  dosis VARCHAR(100) NOT NULL,           -- "10 mg", "25 gotas"
  frecuencia VARCHAR(100) NOT NULL,      -- "cada 12hs", "1 por noche", "según necesidad"
  via VARCHAR(50) DEFAULT 'oral',        -- 'oral','sublingual','intramuscular','endovenosa','topica'
  fecha_inicio DATE DEFAULT CURRENT_DATE,
  fecha_fin DATE,                        -- null = vigente
  estado VARCHAR(20) DEFAULT 'activo',   -- 'activo','suspendido','finalizado'
  motivo_suspension TEXT,
  prescripto_por INTEGER REFERENCES healthcare_professionals(id),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_medicacion_patient ON hce_medicacion(patient_id);
CREATE INDEX IF NOT EXISTS idx_hce_medicacion_estado ON hce_medicacion(patient_id, estado);

-- ===========================================
-- 5. EVOLUCIONES CLÍNICAS
-- El corazón de la HC: notas de cada profesional
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_evoluciones (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  profesional_id INTEGER NOT NULL REFERENCES healthcare_professionals(id),
  fecha TIMESTAMPTZ DEFAULT NOW(),
  tipo VARCHAR(30) DEFAULT 'evolucion',  -- 'evolucion','interconsulta','epicrisis','ingreso','egreso'
  contenido TEXT NOT NULL,                -- Texto de la evolución
  -- Campos estructurados opcionales (el profesional puede usar solo contenido libre)
  motivo_consulta TEXT,
  examen_mental TEXT,
  plan_terapeutico TEXT,
  indicaciones TEXT,
  -- Metadatos
  es_confidencial BOOLEAN DEFAULT FALSE,  -- Solo visible para el autor y dirección médica
  editado BOOLEAN DEFAULT FALSE,
  editado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_evoluciones_patient ON hce_evoluciones(patient_id);
CREATE INDEX IF NOT EXISTS idx_hce_evoluciones_fecha ON hce_evoluciones(patient_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_hce_evoluciones_profesional ON hce_evoluciones(profesional_id);
CREATE INDEX IF NOT EXISTS idx_hce_evoluciones_tipo ON hce_evoluciones(tipo);

-- ===========================================
-- 6. ESTUDIOS COMPLEMENTARIOS
-- Adjuntos: laboratorio, imágenes, informes externos
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_estudios (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,       -- 'laboratorio','imagen','electroencefalograma','psicometrico','informe_externo','otro'
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  fecha_estudio DATE DEFAULT CURRENT_DATE,
  resultado_texto TEXT,            -- Resultado en texto (para búsquedas)
  archivo_url TEXT,                -- URL al archivo (PDF, imagen) - futuro: Supabase Storage
  archivo_nombre VARCHAR(255),
  subido_por INTEGER REFERENCES healthcare_professionals(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_estudios_patient ON hce_estudios(patient_id);
CREATE INDEX IF NOT EXISTS idx_hce_estudios_tipo ON hce_estudios(patient_id, tipo);

-- ===========================================
-- 7. SIGNOS VITALES (opcional, para consultas médicas)
-- ===========================================
CREATE TABLE IF NOT EXISTS hce_signos_vitales (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES hdd_patients(id) ON DELETE CASCADE,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  peso_kg DECIMAL(5,2),
  talla_cm DECIMAL(5,1),
  ta_sistolica INTEGER,      -- Tensión arterial
  ta_diastolica INTEGER,
  fc INTEGER,                -- Frecuencia cardíaca
  fr INTEGER,                -- Frecuencia respiratoria
  temperatura DECIMAL(4,1),
  saturacion INTEGER,        -- SpO2
  glucemia INTEGER,          -- mg/dL
  notas TEXT,
  registrado_por INTEGER REFERENCES healthcare_professionals(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_signos_vitales_patient ON hce_signos_vitales(patient_id);

-- ===========================================
-- 8. PERMISOS - Solo service_role (via Netlify functions)
-- ===========================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'hce_antecedentes', 'hce_diagnosticos', 'hce_medicacion',
      'hce_evoluciones', 'hce_estudios', 'hce_signos_vitales'
    ])
  LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon', tbl);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated', tbl);
    EXECUTE format('GRANT ALL ON %I TO service_role', tbl);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- Grant sequence access for inserts
DO $$
DECLARE
  seq TEXT;
BEGIN
  FOR seq IN
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    AND sequence_name LIKE 'hce_%_id_seq'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO service_role', seq);
  END LOOP;
END $$;

-- ===========================================
-- 9. VISTA: Resumen HC del paciente
-- ===========================================
CREATE OR REPLACE VIEW v_hce_resumen_paciente AS
SELECT
  p.id AS patient_id,
  p.numero_historia_clinica,
  p.dni,
  p.full_name,
  p.fecha_nacimiento,
  p.sexo,
  p.admission_date,
  p.status,
  -- Conteos
  (SELECT COUNT(*) FROM hce_evoluciones e WHERE e.patient_id = p.id) AS total_evoluciones,
  (SELECT COUNT(*) FROM hce_diagnosticos d WHERE d.patient_id = p.id AND d.estado = 'activo') AS diagnosticos_activos,
  (SELECT COUNT(*) FROM hce_medicacion m WHERE m.patient_id = p.id AND m.estado = 'activo') AS medicacion_activa,
  (SELECT COUNT(*) FROM hce_antecedentes a WHERE a.patient_id = p.id) AS total_antecedentes,
  (SELECT COUNT(*) FROM hce_estudios es WHERE es.patient_id = p.id) AS total_estudios,
  -- Última evolución
  (SELECT fecha FROM hce_evoluciones e WHERE e.patient_id = p.id ORDER BY fecha DESC LIMIT 1) AS ultima_evolucion,
  (SELECT hp.full_name FROM hce_evoluciones e JOIN healthcare_professionals hp ON hp.id = e.profesional_id WHERE e.patient_id = p.id ORDER BY e.fecha DESC LIMIT 1) AS ultimo_profesional
FROM hdd_patients p;

GRANT SELECT ON v_hce_resumen_paciente TO service_role;

COMMENT ON TABLE hce_antecedentes IS 'Antecedentes del paciente: personales, familiares, quirúrgicos, alérgicos, hábitos';
COMMENT ON TABLE hce_diagnosticos IS 'Diagnósticos CIE-10/DSM-5: principal, secundarios, diferenciales';
COMMENT ON TABLE hce_medicacion IS 'Medicación actual y pasada del paciente';
COMMENT ON TABLE hce_evoluciones IS 'Evoluciones clínicas: notas de seguimiento por profesional (Ley 26.529)';
COMMENT ON TABLE hce_estudios IS 'Estudios complementarios: laboratorio, imágenes, informes';
COMMENT ON TABLE hce_signos_vitales IS 'Registro de signos vitales';

SELECT 'Migration 016: Historia Clínica Electrónica (HCE) complete';
