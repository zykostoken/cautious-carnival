import type { Context } from "@netlify/functions";
import { sendEmailNotification } from "./lib/notifications.mts";

const ADMIN_EMAIL = "direccionmedica@clinicajoseingenieros.ar";

interface FormPayload {
  form_name: string;
  data: Record<string, string>;
  created_at: string;
}

// Triggered automatically by Netlify when a form submission is received
// This acts as a backup notification channel alongside the direct email in consultations.mts
export default async (req: Request, context: Context) => {
  try {
    const { payload } = (await req.json()) as { payload: FormPayload };

    if (payload.form_name !== "consultas") {
      return new Response("OK");
    }

    const { name, email, phone, consultationType, subject, message } = payload.data;

    const typeLabels: Record<string, string> = {
      general: "Consulta General",
      telemedicina: "Telemedicina",
      internacion: "Internación",
      hdd: "Hospital de Día",
      turnos: "Turnos",
    };
    const typeLabel = typeLabels[consultationType || "general"] || consultationType || "General";

    const emailSubject = `[Netlify Forms] Nueva Consulta - ${subject || typeLabel} - ${name || "Sin nombre"}`;
    const emailHtml = `
      <div style="font-family:Arial;max-width:600px;margin:0 auto">
        <div style="background:#1a5f2a;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="color:white;margin:0">Nueva Consulta (Backup)</h1>
        </div>
        <div style="padding:30px;background:#f5f5f5">
          <p style="background:#fff3cd;padding:10px;border-radius:6px;font-size:0.85em;color:#856404;">
            Esta notificación fue enviada por Netlify Forms como respaldo.
          </p>
          <p><strong>Tipo:</strong> ${typeLabel}</p>
          <p><strong>Nombre:</strong> ${name || "No proporcionado"}</p>
          <p><strong>Email:</strong> ${email || "No proporcionado"}</p>
          <p><strong>Teléfono:</strong> ${phone || "No proporcionado"}</p>
          <p><strong>Asunto:</strong> ${subject || "Sin asunto"}</p>
          <div style="margin-top:15px;padding:15px;background:#fff;border-radius:8px;border-left:4px solid #1a5f2a;">
            <strong>Mensaje:</strong>
            <p style="white-space:pre-wrap;margin-top:8px">${message || "Sin mensaje"}</p>
          </div>
          <a href="https://clinicajoseingenieros.ar/#profesional" style="display:inline-block;background:#1a5f2a;color:white;padding:15px 30px;text-decoration:none;border-radius:8px;margin-top:20px">Ver en Panel</a>
        </div>
        <div style="padding:15px;background:#e8e8e8;text-align:center;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:0.85em;color:#666">Clínica Psiquiátrica José Ingenieros - Necochea</p>
        </div>
      </div>`;

    await sendEmailNotification(ADMIN_EMAIL, emailSubject, emailHtml);

    return new Response("OK");
  } catch (error) {
    console.error("submission-created error:", error);
    return new Response("Error", { status: 500 });
  }
};
