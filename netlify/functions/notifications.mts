import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";

// Notification sending functions (configurable via environment variables)

interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
  externalId?: string;
}

// Send WhatsApp notification via WhatsApp Business API or CallMeBot (free)
async function sendWhatsAppNotification(
  phone: string,
  message: string
): Promise<NotificationResult> {
  // Option 1: Use CallMeBot (free, simple) - requires one-time setup by recipient
  // User must first send: "I allow callmebot to send me messages" to +34 644 78 72 20

  // Option 2: Use environment variable for WhatsApp Business API
  const whatsappApiKey = process.env.CALLMEBOT_API_KEY;

  if (!whatsappApiKey) {
    // Fallback: Log the notification for manual follow-up
    console.log(`[WhatsApp Notification] To: ${phone}, Message: ${message}`);
    return {
      success: false,
      channel: 'whatsapp',
      error: 'WhatsApp API not configured. Set CALLMEBOT_API_KEY for CallMeBot integration.'
    };
  }

  try {
    // CallMeBot API (free tier)
    const encodedMessage = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${whatsappApiKey}`;

    const response = await fetch(url);

    if (response.ok) {
      return { success: true, channel: 'whatsapp' };
    } else {
      return {
        success: false,
        channel: 'whatsapp',
        error: `HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Send email notification via Netlify Email or SMTP
async function sendEmailNotification(
  email: string,
  subject: string,
  body: string
): Promise<NotificationResult> {
  // Check for Resend API (recommended for Netlify)
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Clínica José Ingenieros <notificaciones@clinicajoseingenieros.com.ar>',
          to: email,
          subject: subject,
          html: body
        })
      });

      const result = await response.json();

      if (response.ok) {
        return { success: true, channel: 'email', externalId: result.id };
      } else {
        return { success: false, channel: 'email', error: result.message };
      }
    } catch (error) {
      return {
        success: false,
        channel: 'email',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Fallback: Log for manual follow-up
  console.log(`[Email Notification] To: ${email}, Subject: ${subject}`);
  return {
    success: false,
    channel: 'email',
    error: 'Email service not configured. Set RESEND_API_KEY for email notifications.'
  };
}

// Log notification to database
async function logNotification(
  sql: ReturnType<typeof getDatabase>,
  recipientType: string,
  recipientId: number,
  channel: string,
  destination: string,
  messageType: string,
  messageContent: string,
  result: NotificationResult
): Promise<void> {
  await sql`
    INSERT INTO notification_log (
      recipient_type, recipient_id, channel, destination,
      message_type, message_content, status, external_id, error_message,
      created_at, sent_at
    )
    VALUES (
      ${recipientType}, ${recipientId}, ${channel}, ${destination},
      ${messageType}, ${messageContent},
      ${result.success ? 'sent' : 'failed'},
      ${result.externalId || null},
      ${result.error || null},
      NOW(),
      ${result.success ? sql`NOW()` : null}
    )
  `;
}

// Notify all available professionals of a new call request
async function notifyProfessionalsOfCall(
  sql: ReturnType<typeof getDatabase>,
  callQueueId: number,
  patientName: string,
  roomName: string
): Promise<{ notified: number; errors: string[] }> {
  const errors: string[] = [];
  let notified = 0;

  // Get all active and available professionals with notifications enabled
  const professionals = await sql`
    SELECT id, full_name, email, whatsapp, notify_email, notify_whatsapp
    FROM healthcare_professionals
    WHERE is_active = TRUE
      AND (notify_email = TRUE OR notify_whatsapp = TRUE)
  `;

  const message = `Nueva solicitud de videollamada en Clínica José Ingenieros.\n\nPaciente: ${patientName}\nSala: ${roomName}\n\nIngresá al panel de profesionales para atender la llamada.`;

  const emailSubject = '📹 Nueva Solicitud de Videoconsulta - Clínica José Ingenieros';
  const emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #d4a853, #58a6ff); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0;">📹 Nueva Videoconsulta</h1>
      </div>
      <div style="padding: 30px; background: #f5f5f5;">
        <p style="font-size: 16px;"><strong>Hay un paciente esperando atención</strong></p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Paciente:</strong> ${patientName}</p>
          <p><strong>Sala:</strong> ${roomName}</p>
        </div>
        <a href="https://joseingenieros.netlify.app/#profesional"
           style="display: inline-block; background: #d4a853; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Atender Llamada
        </a>
      </div>
      <div style="padding: 15px; text-align: center; color: #666; font-size: 12px;">
        Clínica Psiquiátrica José Ingenieros - Calle 52 #2990, Necochea
      </div>
    </div>
  `;

  for (const prof of professionals) {
    // Send WhatsApp notification
    if (prof.notify_whatsapp && prof.whatsapp) {
      const result = await sendWhatsAppNotification(prof.whatsapp, message);
      await logNotification(
        sql, 'professional', prof.id, 'whatsapp', prof.whatsapp,
        'new_call', message, result
      );
      if (result.success) notified++;
      else errors.push(`WhatsApp a ${prof.full_name}: ${result.error}`);
    }

    // Send email notification
    if (prof.notify_email && prof.email) {
      const result = await sendEmailNotification(prof.email, emailSubject, emailBody);
      await logNotification(
        sql, 'professional', prof.id, 'email', prof.email,
        'new_call', emailSubject, result
      );
      if (result.success) notified++;
      else errors.push(`Email a ${prof.full_name}: ${result.error}`);
    }
  }

  return { notified, errors };
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;

      // Send test notification
      if (action === "test") {
        const { channel, destination, message } = body;

        let result: NotificationResult;

        if (channel === 'whatsapp') {
          result = await sendWhatsAppNotification(destination, message || 'Test desde Clínica José Ingenieros');
        } else if (channel === 'email') {
          result = await sendEmailNotification(
            destination,
            'Test de Notificación - Clínica José Ingenieros',
            `<p>${message || 'Este es un mensaje de prueba del sistema de notificaciones.'}</p>`
          );
        } else {
          return new Response(JSON.stringify({ error: "Canal inválido. Use 'whatsapp' o 'email'" }),
            { status: 400, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: result.success,
          channel,
          destination,
          error: result.error
        }), { status: result.success ? 200 : 500, headers: corsHeaders });
      }

      // Notify professionals of new call (called internally by session endpoint)
      if (action === "notify_new_call") {
        const { callQueueId, patientName, roomName } = body;

        const result = await notifyProfessionalsOfCall(sql, callQueueId, patientName, roomName);

        return new Response(JSON.stringify({
          success: result.notified > 0,
          notified: result.notified,
          errors: result.errors
        }), { status: 200, headers: corsHeaders });
      }

      // Get notification status
      if (action === "status") {
        const { notificationId } = body;

        const [notification] = await sql`
          SELECT id, channel, destination, message_type, status, error_message, sent_at
          FROM notification_log
          WHERE id = ${notificationId}
        `;

        if (!notification) {
          return new Response(JSON.stringify({ error: "Notificación no encontrada" }),
            { status: 404, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ notification }),
          { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Acción inválida" }),
        { status: 400, headers: corsHeaders });

    } catch (error) {
      console.error("Notification error:", error);
      return new Response(JSON.stringify({ error: "Error interno del servidor" }),
        { status: 500, headers: corsHeaders });
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const recipientType = url.searchParams.get("recipientType");
    const recipientId = url.searchParams.get("recipientId");

    if (recipientType && recipientId) {
      try {
        const notifications = await sql`
          SELECT id, channel, destination, message_type, status, created_at, sent_at
          FROM notification_log
          WHERE recipient_type = ${recipientType} AND recipient_id = ${parseInt(recipientId)}
          ORDER BY created_at DESC
          LIMIT 50
        `;

        return new Response(JSON.stringify({ notifications }),
          { status: 200, headers: corsHeaders });

      } catch (error) {
        console.error("Get notifications error:", error);
        return new Response(JSON.stringify({ error: "Error interno" }),
          { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Parámetros requeridos" }),
      { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Método no permitido" }),
    { status: 405, headers: corsHeaders });
};

export const config: Config = {
  path: "/api/notifications"
};
