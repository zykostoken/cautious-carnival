// SEC-006 FIX: Shared MercadoPago helper
// Single source of truth for pricing and API calls
// Previously duplicated in telemedicine-session.mts and mercadopago.mts

const MP_API_URL = "https://api.mercadopago.com";

export interface MPPreferenceItem {
  title: string;
  description?: string;
  quantity: number;
  currency_id: string;
  unit_price: number;
}

export interface MPPreference {
  items: MPPreferenceItem[];
  payer?: { email?: string; name?: string };
  back_urls?: { success: string; failure: string; pending: string };
  auto_return?: string;
  external_reference?: string;
  notification_url?: string;
}

export async function createMPPreference(preference: MPPreference, accessToken: string) {
  const response = await fetch(`${MP_API_URL}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preference)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mercado Pago error: ${error}`);
  }

  return response.json();
}

export async function getPaymentInfo(paymentId: string, accessToken: string) {
  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mercado Pago error: ${error}`);
  }

  return response.json();
}

// Pricing by modality (Argentina time UTC-3):
// - Con espera en linea: $50,000 ARS / USD 35 (15 min)
// - Sin cola: USD 70 (15 min)
// - Sin cola premium: USD 120 (15 min)
export const SERVICE_PRICING: Record<string, {
  price: number; usdPrice: number; planId: number;
  planName: string; priority: number;
}> = {
  queue: {
    price: 50000, usdPrice: 35, planId: 1,
    planName: 'Telemedicina con espera (15 min)', priority: 0
  },
  priority: {
    price: 70000, usdPrice: 70, planId: 2,
    planName: 'Telemedicina sin cola (15 min)', priority: 10
  },
  vip: {
    price: 120000, usdPrice: 120, planId: 3,
    planName: 'Telemedicina sin cola premium (15 min)', priority: 20
  }
};

export function getPriceForCurrentHour(callType?: string): {
  price: number; usdPrice: number; planId: number;
  planName: string; timeSlot: string; durationMinutes: number; priority: number;
} {
  const now = new Date();
  const argentinaHour = (now.getUTCHours() - 3 + 24) % 24;
  const isNightPromo = argentinaHour >= 23 || argentinaHour < 7;
  const timeSlot = isNightPromo ? '23:00-07:00' : '07:00-23:00';
  const pricing = SERVICE_PRICING[callType || 'queue'] || SERVICE_PRICING.queue;

  return {
    price: pricing.price,
    usdPrice: pricing.usdPrice,
    planId: pricing.planId,
    planName: pricing.planName,
    timeSlot,
    durationMinutes: 15,
    priority: pricing.priority
  };
}

export function getMPAccessToken(): string | null {
  return process.env.MP_ACCESS_TOKEN || null;
}
