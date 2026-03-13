-- Ley 26.529 / Aprobación ministerial portal digital
-- 1. Evoluciones firmadas son INMUTABLES (solo borradores editables)
-- 2. Log de acceso a HC (trazabilidad de lectura)

-- === INMUTABILIDAD DE EVOLUCIONES FIRMADAS ===
CREATE OR REPLACE FUNCTION prevent_signed_evolution_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tipo = 'borrador' THEN RETURN NEW; END IF;
  IF OLD.contenido IS DISTINCT FROM NEW.contenido 
     OR OLD.tipo IS DISTINCT FROM NEW.tipo
     OR OLD.diagnostico IS DISTINCT FROM NEW.diagnostico
     OR OLD.indicaciones IS DISTINCT FROM NEW.indicaciones
     OR OLD.motivo_consulta IS DISTINCT FROM NEW.motivo_consulta
     OR OLD.examen_mental IS DISTINCT FROM NEW.examen_mental THEN
    RAISE EXCEPTION 'Evolución firmada (%) no puede modificarse (Ley 26.529). Use addendum.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_signed_evolution ON hce_evoluciones;
CREATE TRIGGER trg_immutable_signed_evolution
  BEFORE UPDATE ON hce_evoluciones FOR EACH ROW
  EXECUTE FUNCTION prevent_signed_evolution_modification();

CREATE OR REPLACE FUNCTION prevent_evolution_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'No se permite eliminar evoluciones (Ley 26.529). ID: %', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_evolution_delete ON hce_evoluciones;
CREATE TRIGGER trg_prevent_evolution_delete
  BEFORE DELETE ON hce_evoluciones FOR EACH ROW
  EXECUTE FUNCTION prevent_evolution_delete();

-- === LOG DE ACCESO A HC ===
CREATE TABLE IF NOT EXISTS hce_access_log (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    patient_dni VARCHAR(20),
    professional_id INTEGER NOT NULL,
    professional_email VARCHAR(255),
    professional_name VARCHAR(255),
    action_type VARCHAR(50) NOT NULL DEFAULT 'view_hce',
    resource_detail TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hce_access_patient ON hce_access_log(patient_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hce_access_prof ON hce_access_log(professional_id, accessed_at DESC);
ALTER TABLE hce_access_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hce_access_log' AND policyname='hce_access_service_role') THEN
    CREATE POLICY "hce_access_service_role" ON hce_access_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
