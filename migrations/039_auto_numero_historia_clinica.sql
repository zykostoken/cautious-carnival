-- Auto-sequential numero_historia_clinica
-- Belén Coupau = 000001. Every new patient auto-gets next number.
-- Format: 6-digit zero-padded (000001, 000002, ...)
-- Trigger fires on INSERT — no manual assignment needed.

CREATE SEQUENCE IF NOT EXISTS hc_number_seq START WITH 2;

-- Position sequence after highest existing number
DO $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN numero_historia_clinica ~ '^\d+$' 
    THEN numero_historia_clinica::integer ELSE 0 END
  ), 1) INTO max_num FROM hdd_patients;
  PERFORM setval('hc_number_seq', GREATEST(max_num, 1));
END $$;

-- Trigger function
CREATE OR REPLACE FUNCTION assign_numero_historia_clinica()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_historia_clinica IS NULL 
     OR NEW.numero_historia_clinica = '' 
     OR NEW.numero_historia_clinica LIKE 'HC-%' THEN
    NEW.numero_historia_clinica := LPAD(nextval('hc_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_numero_hc ON hdd_patients;
CREATE TRIGGER trg_auto_numero_hc
  BEFORE INSERT ON hdd_patients
  FOR EACH ROW
  EXECUTE FUNCTION assign_numero_historia_clinica();
