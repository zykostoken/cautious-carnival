-- Configuración del establecimiento — datos ministeriales
-- Source of truth para headers, reportes, HCE, dossier técnico
-- Calle 52 N° 2950 (internación) / N° 2995 (consultorios)
-- 40 camas vigentes por capacidad edilicia

CREATE TABLE IF NOT EXISTS establishment_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(255)
);

INSERT INTO establishment_config (key, value, category) VALUES
  ('nombre_legal', 'Clínica Psiquiátrica Privada José Ingenieros SRL', 'identidad'),
  ('nombre_corto', 'Clínica José Ingenieros', 'identidad'),
  ('cuit', '', 'identidad'),
  ('director_medico', 'Dr. Gonzalo Pérez Cortizo', 'autoridades'),
  ('director_medico_mp', '', 'autoridades'),
  ('director_medico_mn', '', 'autoridades'),
  ('direccion_internacion', 'Calle 52 N° 2950', 'ubicacion'),
  ('direccion_consultorios', 'Calle 52 N° 2995', 'ubicacion'),
  ('localidad', 'Necochea', 'ubicacion'),
  ('partido', 'Necochea', 'ubicacion'),
  ('provincia', 'Buenos Aires', 'ubicacion'),
  ('codigo_postal', '7630', 'ubicacion'),
  ('pais', 'Argentina', 'ubicacion'),
  ('telefono', '', 'contacto'),
  ('email', 'gonzaloperez.cortizo@gmail.com', 'contacto'),
  ('web', 'https://clinicajoseingenieros.ar', 'contacto'),
  ('camas_habilitadas', '40', 'capacidad'),
  ('camas_internacion', '40', 'capacidad'),
  ('camas_hospital_dia', '0', 'capacidad'),
  ('consultorios', '', 'capacidad'),
  ('numero_habilitacion_municipal', '', 'habilitacion'),
  ('numero_habilitacion_provincial', '', 'habilitacion'),
  ('categoria_establecimiento', 'Clínica Psiquiátrica con Internación', 'habilitacion'),
  ('tipo_establecimiento', 'Privado', 'habilitacion'),
  ('especialidad_principal', 'Psiquiatría', 'habilitacion'),
  ('programa_hdd', 'Hospital de Día Digital', 'programas'),
  ('programa_telemedicina', 'PSYKooD Telemedicina Internacional', 'programas'),
  ('programa_gaming', 'ROOTTINE — Motor de Juegos Terapéuticos', 'programas'),
  ('ley_salud_mental', 'Ley 26.657', 'normativa'),
  ('ley_historia_clinica', 'Ley 26.529', 'normativa'),
  ('ley_datos_personales', 'Ley 25.326', 'normativa'),
  ('renapdis', 'En trámite', 'normativa'),
  ('disposicion_4980', 'Aplicable — HDD', 'normativa')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE establishment_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'establishment_config' AND policyname = 'config_service_role') THEN
    CREATE POLICY "config_service_role" ON establishment_config FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'establishment_config' AND policyname = 'config_anon_read') THEN
    CREATE POLICY "config_anon_read" ON establishment_config FOR SELECT TO anon USING (true);
  END IF;
END $$;
