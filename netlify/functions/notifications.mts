import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import { sendWhatsAppNotification, sendEmailNotification, type NotificationResult } from "./lib/notifications.mts";
import { CORS_HEADERS } from "./lib/auth.mts";

// Admin notification settings - hardcoded for reliability
const ADMIN_PHONE = "+5492262656681";
const ADMIN_EMAIL = "direccionmedica@clinicajoseingenieros.ar";

async function logNotification(sql: any, recipientType: string, recipientId: number, channel: string, destination: string, messageType: string, messageContent: string, result: NotificationResult) {
  try {
    await sql`INSERT INTO notification_log (recipient_type, recipient_id, channel, destination, message_type, message_content, status, external_id, error_message, created_at, sent_at) VALUES (${recipientType}, ${recipientId || 0}, ${channel}, ${destination}, ${messageType}, ${messageContent}, ${result.success ? 'sent' : 'failed'}, ${result.externalId || null}, ${result.error || null}, NOW(), ${result.success ? sql`NOW()` : null})`;
  } catch (e) { console.error("Log failed:", e); }
}

// Notify admin about new call - ALWAYS sends to hardcoded phone and email
async function notifyAdminOfNewCall(sql: any, callQueueId: number, patientName: string, roomName: string, price?: number, timeSlot?: string) {
  const errors: string[] = [];
  let notified = 0;

  const priceStr = price ? `$${price.toLocaleString('es-AR')} ARS` : 'Pendiente';
  const timeSlotStr = timeSlot || 'N/A';

  const whatsappMsg = `NUEVA LLAMADA - Clinica Jose Ingenieros
Paciente: ${patientName}
Precio: ${priceStr} (${timeSlotStr})
Sala: ${roomName}
Acceder: https://clinicajoseingenieros.ar/#profesional`;

  const emailSubject = `Nueva Videoconsulta - ${patientName} - ${priceStr}`;
  const emailHtml = `
    <div style="font-family:Arial;max-width:600px;margin:0 auto">
      <div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0">Nueva Videoconsulta</h1>
      </div>
      <div style="padding:30px;background:#f5f5f5">
        <p><strong>Paciente:</strong> ${patientName}</p>
        <p><strong>Precio:</strong> ${priceStr}</p>
        <p><strong>Franja horaria:</strong> ${timeSlotStr}</p>
        <p><strong>Sala:</strong> ${roomName}</p>
        <p style="margin-top:20px;padding:15px;background:#fff3cd;border-radius:8px;border-left:4px solid #ffc107;">
          <strong>El pago se procesará al tomar la llamada.</strong>
        </p>
        <a href="https://clinicajoseingenieros.ar/#profesional" style="display:inline-block;background:#1a5f2a;color:white;padding:15px 30px;text-decoration:none;border-radius:8px;margin-top:20px">Atender Llamada</a>
      </div>
    </div>`;

  // Always notify admin phone
  const whatsappResult = await sendWhatsAppNotification(ADMIN_PHONE, whatsappMsg);
  await logNotification(sql, 'admin', 0, 'whatsapp', ADMIN_PHONE, 'new_call', whatsappMsg, whatsappResult);
  if (whatsappResult.success) notified++; else errors.push(`WhatsApp admin: ${whatsappResult.error}`);

  // Always notify admin email
  const emailResult = await sendEmailNotification(ADMIN_EMAIL, emailSubject, emailHtml);
  await logNotification(sql, 'admin', 0, 'email', ADMIN_EMAIL, 'new_call', emailSubject, emailResult);
  if (emailResult.success) notified++; else errors.push(`Email admin: ${emailResult.error}`);

  // Also notify registered professionals
  const professionals = await sql`SELECT id, full_name, email, whatsapp, notify_email, notify_whatsapp FROM healthcare_professionals WHERE is_active = TRUE AND (notify_email = TRUE OR notify_whatsapp = TRUE)`;
  for (const prof of professionals) {
    if (prof.notify_whatsapp && prof.whatsapp && prof.whatsapp !== ADMIN_PHONE) {
      const result = await sendWhatsAppNotification(prof.whatsapp, whatsappMsg);
      await logNotification(sql, 'professional', prof.id, 'whatsapp', prof.whatsapp, 'new_call', whatsappMsg, result);
      if (result.success) notified++; else errors.push(`WhatsApp ${prof.full_name}: ${result.error}`);
    }
    if (prof.notify_email && prof.email && prof.email !== ADMIN_EMAIL) {
      const result = await sendEmailNotification(prof.email, emailSubject, emailHtml);
      await logNotification(sql, 'professional', prof.id, 'email', prof.email, 'new_call', emailSubject, result);
      if (result.success) notified++; else errors.push(`Email ${prof.full_name}: ${result.error}`);
    }
  }

  return { notified, errors };
}

// Notify admin when call is taken and payment processed
async function notifyAdminOfCallTaken(sql: any, professionalName: string, patientName: string, patientEmail: string, price: number, timeSlot: string, paymentRef: string) {
  const errors: string[] = [];
  let notified = 0;

  const priceStr = `$${price.toLocaleString('es-AR')} ARS`;

  const whatsappMsg = `LLAMADA TOMADA - COBRO REALIZADO
Profesional: ${professionalName}
Paciente: ${patientName}
Monto: ${priceStr} (${timeSlot})
Ref: ${paymentRef}`;

  const emailSubject = `Cobro Realizado - ${patientName} - ${priceStr}`;
  const emailHtml = `
    <div style="font-family:Arial;max-width:600px;margin:0 auto">
      <div style="background:#28a745;padding:20px;text-align:center;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0">Cobro Realizado</h1>
      </div>
      <div style="padding:30px;background:#f5f5f5">
        <div style="background:#d4edda;padding:20px;border-radius:8px;margin-bottom:20px">
          <h2 style="color:#155724;margin:0 0 10px 0">${priceStr}</h2>
          <p style="color:#155724;margin:0">Cobro procesado exitosamente</p>
        </div>
        <p><strong>Profesional:</strong> ${professionalName}</p>
        <p><strong>Paciente:</strong> ${patientName}</p>
        <p><strong>Email paciente:</strong> ${patientEmail || 'No proporcionado'}</p>
        <p><strong>Franja horaria:</strong> ${timeSlot}</p>
        <p><strong>Referencia:</strong> ${paymentRef}</p>
        <p style="margin-top:20px;font-size:0.9em;color:#666">La videoconsulta está en curso.</p>
      </div>
    </div>`;

  // Notify admin phone
  const whatsappResult = await sendWhatsAppNotification(ADMIN_PHONE, whatsappMsg);
  await logNotification(sql, 'admin', 0, 'whatsapp', ADMIN_PHONE, 'call_taken', whatsappMsg, whatsappResult);
  if (whatsappResult.success) notified++; else errors.push(`WhatsApp admin: ${whatsappResult.error}`);

  // Notify admin email
  const emailResult = await sendEmailNotification(ADMIN_EMAIL, emailSubject, emailHtml);
  await logNotification(sql, 'admin', 0, 'email', ADMIN_EMAIL, 'call_taken', emailSubject, emailResult);
  if (emailResult.success) notified++; else errors.push(`Email admin: ${emailResult.error}`);

  return { notified, errors };
}

export default async (req: Request, context: Context) => {
  const sql = getDatabase();
  const corsHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action } = body;
      if (action === "test") {
        const { channel, destination, message } = body;
        if (!destination) return new Response(JSON.stringify({ error: "destination requerido" }), { status: 400, headers: corsHeaders });
        let result: NotificationResult;
        if (channel === 'whatsapp') result = await sendWhatsAppNotification(destination, message || 'Test - Clinica Jose Ingenieros');
        else if (channel === 'email') result = await sendEmailNotification(destination, 'Test - Clinica Jose Ingenieros', `<p>${message || 'Test del sistema de notificaciones'}</p>`);
        else return new Response(JSON.stringify({ error: "Canal invalido" }), { status: 400, headers: corsHeaders });
        return new Response(JSON.stringify({ success: result.success, channel, destination, messageId: result.externalId, error: result.error }), { status: 200, headers: corsHeaders });
      }
      if (action === "notify_new_call") {
        const { callQueueId, patientName, roomName, price, timeSlot } = body;
        const result = await notifyAdminOfNewCall(sql, callQueueId, patientName, roomName, price, timeSlot);
        return new Response(JSON.stringify({ success: result.notified > 0, notified: result.notified, errors: result.errors }), { status: 200, headers: corsHeaders });
      }
      if (action === "notify_call_taken") {
        const { professionalName, patientName, patientEmail, price, timeSlot, paymentRef } = body;
        const result = await notifyAdminOfCallTaken(sql, professionalName, patientName, patientEmail, price, timeSlot, paymentRef);
        return new Response(JSON.stringify({ success: result.notified > 0, notified: result.notified, errors: result.errors }), { status: 200, headers: corsHeaders });
      }

      // Notify admin about new consultation/inquiry from website
      if (action === "notify_new_consultation") {
        const { consultationId, name, email, phone, subject, consultationType } = body;
        const errors: string[] = [];
        let notified = 0;

        const whatsappMsg = `NUEVA CONSULTA - Clinica Jose Ingenieros
Tipo: ${consultationType || 'general'}
De: ${name}
Asunto: ${subject || 'Sin asunto'}
Contacto: ${email || phone || 'No proporcionado'}
Ver en: https://clinicajoseingenieros.ar/#profesional`;

        const emailSubject = `Nueva Consulta Web - ${subject || consultationType || 'General'}`;
        const emailHtml = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0">Nueva Consulta</h1>
            </div>
            <div style="padding:30px;background:#f5f5f5">
              <p><strong>Tipo:</strong> ${consultationType || 'General'}</p>
              <p><strong>Nombre:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email || 'No proporcionado'}</p>
              <p><strong>Teléfono:</strong> ${phone || 'No proporcionado'}</p>
              <p><strong>Asunto:</strong> ${subject || 'Sin asunto'}</p>
              <p style="margin-top:20px;padding:15px;background:#e7f3ff;border-radius:8px;border-left:4px solid #2196F3;">
                <strong>ID de consulta:</strong> #${consultationId}
              </p>
              <a href="https://clinicajoseingenieros.ar/#profesional" style="display:inline-block;background:#1a5f2a;color:white;padding:15px 30px;text-decoration:none;border-radius:8px;margin-top:20px">Ver Consultas</a>
            </div>
          </div>`;

        // Notify admin via WhatsApp
        const whatsappResult = await sendWhatsAppNotification(ADMIN_PHONE, whatsappMsg);
        await logNotification(sql, 'admin', 0, 'whatsapp', ADMIN_PHONE, 'new_consultation', whatsappMsg, whatsappResult);
        if (whatsappResult.success) notified++; else errors.push(`WhatsApp: ${whatsappResult.error}`);

        // Notify admin via email
        const emailResult = await sendEmailNotification(ADMIN_EMAIL, emailSubject, emailHtml);
        await logNotification(sql, 'admin', 0, 'email', ADMIN_EMAIL, 'new_consultation', emailSubject, emailResult);
        if (emailResult.success) notified++; else errors.push(`Email: ${emailResult.error}`);

        return new Response(JSON.stringify({ success: notified > 0, notified, errors }), { status: 200, headers: corsHeaders });
      }

      if (action === "status") {
        return new Response(JSON.stringify({
          email: {
            configured: !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS),
            provider: 'zoho',
            host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com'
          },
          whatsapp: { configured: !!process.env.CALLMEBOT_API_KEY, note: 'WhatsApp deshabilitado por ahora' },
          adminPhone: ADMIN_PHONE,
          adminEmail: ADMIN_EMAIL
        }), { status: 200, headers: corsHeaders });
      }

      // Send password reset email to professional
      if (action === "send_password_reset_email") {
        const { email, code, fullName } = body;
        if (!email || !code) {
          return new Response(JSON.stringify({ error: "Email y código requeridos" }), { status: 400, headers: corsHeaders });
        }

        const subject = "Recuperación de Contraseña - Clínica José Ingenieros";
        const htmlBody = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#dc3545;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0">Recuperación de Contraseña</h1>
            </div>
            <div style="padding:30px;background:#f5f5f5">
              <p>Hola ${fullName || 'Profesional'},</p>
              <p>Recibimos una solicitud para restablecer tu contraseña en el sistema de telemedicina de la Clínica José Ingenieros.</p>
              <p>Tu código de recuperación es:</p>
              <div style="background:#fff;border:2px solid #dc3545;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#dc3545">${code}</span>
              </div>
              <p style="color:#666;font-size:0.9em">Este código expira en 30 minutos.</p>
              <p style="background:#fff3cd;padding:15px;border-radius:8px;border-left:4px solid #ffc107;margin-top:20px">
                <strong>Si no solicitaste este cambio, podés ignorar este mensaje.</strong> Tu contraseña actual seguirá siendo válida.
              </p>
            </div>
            <div style="padding:15px;background:#e8e8e8;text-align:center;border-radius:0 0 8px 8px">
              <p style="margin:0;font-size:0.85em;color:#666">Clínica Psiquiátrica José Ingenieros - Necochea</p>
            </div>
          </div>`;

        const result = await sendEmailNotification(email, subject, htmlBody);
        try {
          await logNotification(sql, 'professional', 0, 'email', email, 'password_reset', subject, result);
        } catch (e) {
          console.log('Notification log skipped:', e);
        }

        return new Response(JSON.stringify({ success: result.success, error: result.error }), { status: 200, headers: corsHeaders });
      }

      // Send verification email to professional
      if (action === "send_verification_email") {
        const { email, code, fullName } = body;
        if (!email || !code) {
          return new Response(JSON.stringify({ error: "Email y código requeridos" }), { status: 400, headers: corsHeaders });
        }

        const subject = "Verificación de Email - Clínica José Ingenieros";
        const htmlBody = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0">Verificación de Email</h1>
            </div>
            <div style="padding:30px;background:#f5f5f5">
              <p>Hola ${fullName || 'Profesional'},</p>
              <p>Gracias por registrarte en el sistema de telemedicina de la Clínica José Ingenieros.</p>
              <p>Tu código de verificación es:</p>
              <div style="background:#fff;border:2px solid #1a5f2a;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a5f2a">${code}</span>
              </div>
              <p style="color:#666;font-size:0.9em">Este código expira en 30 minutos.</p>
              <p>Si no solicitaste este registro, podés ignorar este mensaje.</p>
            </div>
            <div style="padding:15px;background:#e8e8e8;text-align:center;border-radius:0 0 8px 8px">
              <p style="margin:0;font-size:0.85em;color:#666">Clínica Psiquiátrica José Ingenieros - Necochea</p>
            </div>
          </div>`;

        const result = await sendEmailNotification(email, subject, htmlBody);
        // Log notification silently (notification_log table may not exist)
        try {
          await logNotification(sql, 'professional', 0, 'email', email, 'verification', subject, result);
        } catch (e) {
          console.log('Notification log skipped:', e);
        }

        return new Response(JSON.stringify({ success: result.success, error: result.error }), { status: 200, headers: corsHeaders });
      }

      // Send verification email to HDD patient
      if (action === "send_hdd_verification_email") {
        const { email, code, fullName } = body;
        if (!email || !code) {
          return new Response(JSON.stringify({ error: "Email y código requeridos" }), { status: 400, headers: corsHeaders });
        }

        const subject = "Verificación de Email - Hospital de Día";
        const htmlBody = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#2563eb;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0">Hospital de Día</h1>
              <p style="color:#dbeafe;margin:5px 0 0 0;font-size:0.9em">Clínica José Ingenieros</p>
            </div>
            <div style="padding:30px;background:#f5f5f5">
              <p>Hola ${fullName || 'Participante'},</p>
              <p>Gracias por registrarte en el portal de Hospital de Día.</p>
              <p>Tu código de verificación es:</p>
              <div style="background:#fff;border:2px solid #2563eb;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#2563eb">${code}</span>
              </div>
              <p style="color:#666;font-size:0.9em">Este código expira en 30 minutos.</p>
              <p>Si no solicitaste este registro, podés ignorar este mensaje.</p>
            </div>
            <div style="padding:15px;background:#e8e8e8;text-align:center;border-radius:0 0 8px 8px">
              <p style="margin:0;font-size:0.85em;color:#666">Clínica Psiquiátrica José Ingenieros - Necochea</p>
            </div>
          </div>`;

        const result = await sendEmailNotification(email, subject, htmlBody);
        try {
          await logNotification(sql, 'hdd_patient', 0, 'email', email, 'verification', subject, result);
        } catch (e) {
          console.log('Notification log skipped:', e);
        }

        return new Response(JSON.stringify({ success: result.success, error: result.error }), { status: 200, headers: corsHeaders });
      }

      // Send booking confirmation to patient after payment
      if (action === "send_booking_confirmation") {
        const { email, fullName, roomName, price, sessionToken } = body;
        if (!email) {
          return new Response(JSON.stringify({ error: "Email requerido" }), { status: 400, headers: corsHeaders });
        }

        const priceStr = price ? `$${price.toLocaleString('es-AR')} ARS` : '';
        const subject = "Confirmación de Videoconsulta - Clínica José Ingenieros";
        const htmlBody = `
          <div style="font-family:Arial;max-width:600px;margin:0 auto">
            <div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h1 style="color:white;margin:0">¡Pago Confirmado!</h1>
            </div>
            <div style="padding:30px;background:#f5f5f5">
              <p>Hola ${fullName || 'Paciente'},</p>
              <p>Tu pago ha sido procesado exitosamente. Ahora estás en la cola de espera para tu videoconsulta.</p>
              ${priceStr ? `<p><strong>Monto:</strong> ${priceStr}</p>` : ''}
              <div style="background:#d4edda;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #28a745">
                <h3 style="color:#155724;margin:0 0 10px 0">¿Qué sigue?</h3>
                <ul style="color:#155724;margin:0;padding-left:20px">
                  <li>Un profesional tomará tu llamada en breve</li>
                  <li>Mantené abierta la página de telemedicina</li>
                  <li>Asegurate de tener cámara y micrófono habilitados</li>
                </ul>
              </div>
              <a href="https://clinicajoseingenieros.ar/#telemedicina" style="display:inline-block;background:#1a5f2a;color:white;padding:15px 30px;text-decoration:none;border-radius:8px;margin-top:10px">Ir a Telemedicina</a>
              <p style="margin-top:20px;font-size:0.85em;color:#666">Si tenés algún problema, contactanos a ${ADMIN_EMAIL}</p>
            </div>
            <div style="padding:15px;background:#e8e8e8;text-align:center;border-radius:0 0 8px 8px">
              <p style="margin:0;font-size:0.85em;color:#666">Clínica Psiquiátrica José Ingenieros - Necochea</p>
            </div>
          </div>`;

        const result = await sendEmailNotification(email, subject, htmlBody);
        try {
          await logNotification(sql, 'patient', 0, 'email', email, 'booking_confirmation', subject, result);
        } catch (e) {
          console.log('Notification log skipped:', e);
        }

        return new Response(JSON.stringify({ success: result.success, error: result.error }), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Accion invalida" }), { status: 400, headers: corsHeaders });
    } catch (error) {
      console.error("Notification error:", error);
      return new Response(JSON.stringify({ error: "Error interno", details: error instanceof Error ? error.message : String(error) }), { status: 500, headers: corsHeaders });
    }
  }
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "status") {
      return new Response(JSON.stringify({
        email: {
          configured: !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS),
          host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com'
        },
        whatsapp: {
          configured: !!process.env.CALLMEBOT_API_KEY,
          note: 'WhatsApp deshabilitado por ahora'
        },
        provider: 'zoho-smtp',
        adminPhone: ADMIN_PHONE,
        adminEmail: ADMIN_EMAIL
      }), { status: 200, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: "Use action=status" }), { status: 400, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: corsHeaders });
};

export const config: Config = { path: "/api/notifications" };
