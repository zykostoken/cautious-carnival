// Shared notification transports for serverless functions
import nodemailer from "nodemailer";

export interface NotificationResult {
  success: boolean;
  channel: string;
  error?: string;
  externalId?: string;
}

export function getEmailTransporter() {
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!user || !pass) return null;

  const host = process.env.ZOHO_SMTP_HOST || "smtp.zoho.com";

  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user, pass }
  });
}

export async function sendWhatsAppNotification(phone: string, message: string): Promise<NotificationResult> {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!apiKey) {
    console.log(`[WhatsApp] To: ${phone}, Message: ${message}`);
    return { success: false, channel: 'whatsapp', error: 'CALLMEBOT_API_KEY not configured' };
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
    const response = await fetch(url);
    return response.ok ? { success: true, channel: 'whatsapp' } : { success: false, channel: 'whatsapp', error: `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, channel: 'whatsapp', error: String(error) };
  }
}

export async function sendEmailNotification(to: string, subject: string, htmlBody: string): Promise<NotificationResult> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.log(`[Email] To: ${to}, Subject: ${subject}`);
    return { success: false, channel: 'email', error: 'SMTP not configured' };
  }
  try {
    const info = await transporter.sendMail({
      from: `"Clínica José Ingenieros" <${process.env.ZOHO_SMTP_USER}>`,
      to,
      subject,
      html: htmlBody
    });
    return { success: true, channel: 'email', externalId: info.messageId };
  } catch (error) {
    return { success: false, channel: 'email', error: String(error) };
  }
}

export async function logNotification(sql: any, type: string, channel: string, result: NotificationResult) {
  await sql`
    INSERT INTO notification_log (type, channel, success, error, created_at)
    VALUES (${type}, ${channel}, ${result.success}, ${result.error || null}, NOW())
  `.catch((e: any) => console.log('Notification log failed:', e));
}
