// supabase/functions/report-email/index.ts
// Email provider: Resend (simple). You can swap to SendGrid/Mailgun if you prefer.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORTS_TO_EMAIL = Deno.env.get("REPORTS_TO_EMAIL") ?? "";
const HOOK_SECRET = Deno.env.get("REPORT_HOOK_SECRET") ?? ""; // must match app_settings

async function sendEmail(subject: string, html: string) {
  if (!RESEND_API_KEY || !REPORTS_TO_EMAIL) {
    console.log("[report-email] Missing RESEND_API_KEY or REPORTS_TO_EMAIL; printing instead.");
    console.log(subject);
    console.log(html);
    return new Response("ok (logged)", { status: 200 });
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: "reports@trymedating.com",
      to: [REPORTS_TO_EMAIL],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Resend error:", text);
    return new Response("email error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

serve(async (req) => {
  try {
    // Basic shared-secret auth
    const sig = req.headers.get("x-report-hook") ?? "";
    if (!HOOK_SECRET || sig !== HOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const body = await req.json();

    // Expect the DB trigger to send the report fields directly
    const {
      id, reporter, target, connection_id, category, details, status, created_at,
    } = body ?? {};

    const safeDetails = (details ?? "").toString().slice(0, 4000);
    const subject = `New report: ${category} (${status})`;
    const html = `
      <div style="font-family:ui-sans-serif,system-ui;line-height:1.5">
        <h2 style="margin:0 0 8px">New Report</h2>
        <table style="font-size:14px">
          <tr><td><b>ID</b></td><td>${id}</td></tr>
          <tr><td><b>Created</b></td><td>${created_at}</td></tr>
          <tr><td><b>Reporter</b></td><td>${reporter}</td></tr>
          <tr><td><b>Target</b></td><td>${target}</td></tr>
          <tr><td><b>Connection</b></td><td>${connection_id ?? ""}</td></tr>
          <tr><td><b>Category</b></td><td>${category}</td></tr>
          <tr><td><b>Status</b></td><td>${status}</td></tr>
        </table>
        <h3 style="margin:16px 0 6px">Details</h3>
        <pre style="white-space:pre-wrap;border:1px solid #eee;padding:10px;border-radius:8px;background:#fafafa">${safeDetails}</pre>
      </div>
    `;

    return await sendEmail(subject, html);
  } catch (e) {
    console.error(e);
    return new Response("bad request", { status: 400 });
  }
});
