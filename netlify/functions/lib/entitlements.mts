// Service entitlement checker
// Verifies if a patient can access a service based on their plan, usage limits, and prescriptions

import type postgres from "postgres";

export type ServiceType = 'telemedicina' | 'terapia_grupal' | 'actividades_hdd' | 'gaming' | 'terapia_ocupacional';

interface EntitlementResult {
  allowed: boolean;
  reason: string;
  planType: string | null;      // 'obra_social' | 'direct_pay' | null
  planName: string | null;
  usageThisMonth: number;
  usageThisWeek: number;
  maxPerMonth: number | null;
  maxPerWeek: number | null;
  requiresPrescription: boolean;
  hasPrescription: boolean;
}

export async function checkEntitlement(
  sql: ReturnType<typeof postgres>,
  patientId: number,
  serviceType: ServiceType
): Promise<EntitlementResult> {
  const noAccess: EntitlementResult = {
    allowed: false,
    reason: '',
    planType: null,
    planName: null,
    usageThisMonth: 0,
    usageThisWeek: 0,
    maxPerMonth: null,
    maxPerWeek: null,
    requiresPrescription: false,
    hasPrescription: false,
  };

  // 1. Get active plan for patient
  const [plan] = await sql`
    SELECT pp.id, pp.plan_type, pp.status,
           sp.name as plan_name, sp.code as plan_code
    FROM patient_plans pp
    JOIN service_plans sp ON sp.id = pp.plan_id
    WHERE pp.patient_id = ${patientId}
      AND pp.status = 'active'
      AND sp.is_active = TRUE
    ORDER BY pp.created_at DESC
    LIMIT 1
  `;

  if (!plan) {
    noAccess.reason = 'No tiene un plan activo. Contacte a administracion para activar su acceso.';
    return noAccess;
  }

  // 2. Get entitlement for this service in their plan
  const [entitlement] = await sql`
    SELECT pe.is_included, pe.max_per_month, pe.max_per_week, pe.requires_prescription
    FROM plan_entitlements pe
    JOIN service_plans sp ON sp.id = pe.plan_id
    JOIN patient_plans pp ON pp.plan_id = sp.id
    WHERE pp.patient_id = ${patientId}
      AND pp.status = 'active'
      AND pe.service_type = ${serviceType}
    LIMIT 1
  `;

  const result: EntitlementResult = {
    ...noAccess,
    planType: plan.plan_type,
    planName: plan.plan_name,
  };

  if (!entitlement) {
    result.reason = `Su plan "${plan.plan_name}" no incluye ${serviceType.replace('_', ' ')}. Puede adquirir un plan que lo incluya.`;
    return result;
  }

  if (!entitlement.is_included) {
    // Service exists in plan but not included (e.g., gaming in telemedicina_sola)
    if (entitlement.requires_prescription) {
      // Check for active prescription
      const [prescription] = await sql`
        SELECT id FROM doctor_prescriptions
        WHERE patient_id = ${patientId}
          AND service_type = ${serviceType}
          AND status = 'active'
          AND valid_from <= CURRENT_DATE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        LIMIT 1
      `;

      result.requiresPrescription = true;
      result.hasPrescription = !!prescription;

      if (!prescription) {
        result.reason = `${serviceType.replace('_', ' ')} requiere indicacion medica para su plan. Consulte con su profesional tratante.`;
        return result;
      }
      // Has prescription - allow access
    } else {
      result.reason = `Su plan "${plan.plan_name}" no incluye ${serviceType.replace('_', ' ')}.`;
      return result;
    }
  }

  // 3. Check monthly usage limits
  if (entitlement.max_per_month !== null) {
    const [monthUsage] = await sql`
      SELECT COUNT(*) as count FROM service_usage
      WHERE patient_id = ${patientId}
        AND service_type = ${serviceType}
        AND usage_date >= date_trunc('month', CURRENT_DATE)
    `;
    result.usageThisMonth = parseInt(monthUsage.count);
    result.maxPerMonth = entitlement.max_per_month;

    if (result.usageThisMonth >= entitlement.max_per_month) {
      result.reason = `Alcanzo el limite mensual de ${entitlement.max_per_month} sesion(es) de ${serviceType.replace('_', ' ')} para su plan.`;
      return result;
    }
  }

  // 4. Check weekly usage limits
  if (entitlement.max_per_week !== null) {
    const [weekUsage] = await sql`
      SELECT COUNT(*) as count FROM service_usage
      WHERE patient_id = ${patientId}
        AND service_type = ${serviceType}
        AND usage_date >= date_trunc('week', CURRENT_DATE)
    `;
    result.usageThisWeek = parseInt(weekUsage.count);
    result.maxPerWeek = entitlement.max_per_week;

    if (result.usageThisWeek >= entitlement.max_per_week) {
      result.reason = `Alcanzo el limite semanal de ${entitlement.max_per_week} sesion(es) de ${serviceType.replace('_', ' ')} para su plan.`;
      return result;
    }
  }

  // All checks passed
  result.allowed = true;
  result.reason = 'Acceso permitido';
  return result;
}

// Record service usage (call AFTER the patient uses the service)
export async function recordUsage(
  sql: ReturnType<typeof postgres>,
  patientId: number,
  serviceType: ServiceType,
  sessionReference?: string
): Promise<void> {
  await sql`
    INSERT INTO service_usage (patient_id, service_type, session_reference)
    VALUES (${patientId}, ${serviceType}, ${sessionReference || null})
  `;
}
