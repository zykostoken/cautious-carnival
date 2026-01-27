import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "./lib/db.mts";
import nodemailer from "nodemailer";

interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
  externalId?: string;
}

function getEmailTransporter() {
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    auth: { user, pass }
  });
}

async function sendWhatsAppNotification(phone: string, message: string): Promise<NotificationResult> {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!apiKey) {
    console.log(`[WhatsApp] To: ${phone}, Message: ${message}`);
    return { success: false, channel: 'whatsapp', error: 'CALLMEBOT_API_KEY not configured' };
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
    const response = await fetch(url);
    return response.ok ? { success: true, channel: 'whatsapp' } : { success: false, channel: 'whatsapp', error: `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, channel: 'whatsapp', error: String(error) };
  }
}

async function sendEmailNotification(to: string, subject: string, htmlBody: string): Promise<NotificationResult> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.log(`[Email] To: ${to}, Subject: ${subject}`);
    return { success: false, channel: 'email', error: 'Zoho SMTP not configured' };
  }
  try {
    const info = await transporter.sendMail({
      from: `"Clinica Jose Ingenieros" <${process.env.ZOHO_SMTP_USER}>`,
      to, subject, html: htmlBody
    });
    return { success: true, channel: 'email', externalId: info.messageId };
  } catch (error) {
    console.error("Email error:", error);
    return { success: false, channel: 'email', error: error instanceof Error ? error.message : String(error) };
  }
}

async function logNotification(sql: any, recipientType: string, recipientId: number, channel: string, destination: string, messageType: string, messageContent: string, result: NotificationResult) {
  try {
    await sql`INSERT INTO notification_log (recipient_type, recipient_id, channel, destination, message_type, message_content, status, external_id, error_message, created_at, sent_at) VALUES (${recipientType}, ${recipientId}, ${channel}, ${destination}, ${messageType}, ${messageContent}, ${result.success ? 'sent' : 'failed'}, ${result.externalId || null}, ${result.error || null}, NOW(), ${result.success ? sql`NOW()` : null})`;
  } catch (e) { console.error("Log failed:", e); }
}

async function notifyProfessionalsOfCall(sql: any, callQueueId: number, patientName: string, roomName: string) {
  const errors: string[] = [];
  let notified = 0;
  const professionals = await sql`SELECT id, full_name, email, whatsapp, notify_email, notify_whatsapp FROM healthcare_professionals WHERE is_active = TRUE AND (notify_email = TRUE OR notify_whatsapp = TRUE)`;
  const whatsappMsg = `Nueva videollamada - Clinica Jose Ingenieros\nPaciente: ${patientName}\nSala: ${roomName}`;
  const emailSubject = 'Nueva Videoconsulta - Paciente Esperando';
  const emailHtml = `<div style="font-family:Arial;max-width:600px;margin:0 auto"><div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0"><h1 style="color:white;margin:0">Nueva Videoconsulta</h1></div><div style="padding:30px;background:#f5f5f5"><p><strong>Paciente:</strong> ${patientName}</p><p><strong>Sala:</strong> ${roomName}</p><a href="https://clinicajoseingenieros.ar/#profesional" style="display:inline-block;background:#1a5f2a;color:white;padding:15px 30px;text-decoration:none;border-radius:8px">Atender Llamada</a></div></div>`;
  for (const prof of professionals) {
    if (prof.notify_whatsapp && prof.whatsapp) {
      const result = await sendWhatsAppNotification(prof.whatsapp, whatsappMsg);
      await logNotification(sql, 'professional', prof.id, 'whatsapp', prof.whatsapp, 'new_call', whatsappMsg, result);
      if (result.success) notified++; else errors.push(`WhatsApp ${prof.full_name}: ${result.error}`);
    }
    if (prof.notify_email && prof.email) {
      const result = await sendEmailNotification(prof.email, emailSubject, emailHtml);
      await logNotification(sql, 'professional', prof.id, 'email', prof.email, 'new_call', emailSubject, result);
      if (result.success) notified++; else errors.push(`Email ${prof.full_name}: ${result.error}`);
    }
  }
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
        const { callQueueId, patientName, roomName } = body;
        const result = await notifyProfessionalsOfCall(sql, callQueueId, patientName, roomName);
        return new Response(JSON.stringify({ success: result.notified > 0, notified: result.notified, errors: result.errors }), { status: 200, headers: corsHeaders });
      }
      if (action === "status") {
        return new Response(JSON.stringify({ email: { configured: !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS), provider: 'zoho' }, whatsapp: { configured: !!process.env.CALLMEBOT_API_KEY } }), { status: 200, headers: corsHeaders });
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
      return new Response(JSON.stringify({ email: !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS), whatsapp: !!process.env.CALLMEBOT_API_KEY, provider: 'zoho-smtp' }), { status: 200, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: "Use action=status" }), { status: 400, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: corsHeaders });
};

export const config: Config = { path: "/api/notifications" };
