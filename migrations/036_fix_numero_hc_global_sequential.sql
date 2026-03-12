-- Migration 036: Fix numero_historia_clinica to global sequential (no year prefix)
-- HC numbers are unique across all years: 000001, 000002, 000003...

CREATE OR REPLACE FUNCTION auto_assign_numero_historia_clinica()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  IF NEW.numero_historia_clinica IS NULL OR NEW.numero_historia_clinica = '' THEN
    SELECT COALESCE(MAX(CAST(numero_historia_clinica AS INTEGER)), 0) + 1
    INTO next_num
    FROM hdd_patients
    WHERE numero_historia_clinica ~ '^\d+$';
    
    NEW.numero_historia_clinica := LPAD(next_num::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_numero_hc ON hdd_patients;
CREATE TRIGGER trg_auto_numero_hc
  BEFORE INSERT ON hdd_patients
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_numero_historia_clinica();
