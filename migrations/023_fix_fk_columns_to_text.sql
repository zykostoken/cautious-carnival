-- Fix: prescripto_por, diagnosticado_por, registrado_por columns
-- were defined as INTEGER FK but the application writes professional names (strings).
-- Change them to VARCHAR to match actual usage.

-- Drop FK constraints first (if they exist)
DO $$ BEGIN
  ALTER TABLE hce_medicacion DROP CONSTRAINT IF EXISTS hce_medicacion_prescripto_por_fkey;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hce_diagnosticos DROP CONSTRAINT IF EXISTS hce_diagnosticos_diagnosticado_por_fkey;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hce_antecedentes DROP CONSTRAINT IF EXISTS hce_antecedentes_registrado_por_fkey;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE hce_signos_vitales DROP CONSTRAINT IF EXISTS hce_signos_vitales_registrado_por_fkey;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Alter column types: INTEGER -> VARCHAR(255)
-- Use USING to cast any existing integer values to text
ALTER TABLE hce_medicacion
  ALTER COLUMN prescripto_por TYPE VARCHAR(255) USING prescripto_por::text;

ALTER TABLE hce_diagnosticos
  ALTER COLUMN diagnosticado_por TYPE VARCHAR(255) USING diagnosticado_por::text;

ALTER TABLE hce_antecedentes
  ALTER COLUMN registrado_por TYPE VARCHAR(255) USING registrado_por::text;

-- hce_signos_vitales.registrado_por was already removed in favor of registrado_por_nombre (VARCHAR)
-- but check if the old column still exists as INTEGER
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hce_signos_vitales'
      AND column_name = 'registrado_por'
      AND data_type IN ('integer', 'bigint')
  ) THEN
    ALTER TABLE hce_signos_vitales
      ALTER COLUMN registrado_por TYPE VARCHAR(255) USING registrado_por::text;
  END IF;
END $$;

-- Add index for draft query optimization
CREATE INDEX IF NOT EXISTS idx_hce_evoluciones_draft
  ON hce_evoluciones(patient_id, profesional_id, tipo)
  WHERE tipo = 'borrador';
