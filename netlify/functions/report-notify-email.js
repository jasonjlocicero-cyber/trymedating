// netlify/functions/report-notify-email.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { reportId } = JSON.parse(event.body || "{}");
    if (!reportId) return { statusCode: 400, body: "Missing reportId" };

    const {
      RESEND_API_KEY,
      ADMIN_REPORTS_EMAIL,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE
    } = process.env;

    if (!RESEND_API_KEY || !ADMIN_REPORTS_EMAIL) {
      return { statusCode: 500, body: "Email not configured" };
    }

    // Load report details (server-side with service role)
    const restUrl =
      `${SUPABASE_URL}/rest/v1/reports` +
      `?id=eq.${encodeURIComponent(reportId)}` +
      `&select=id,created_at,reporter_id,reported_user_id,category,notes,status`;
    const repRes = await fetch(restUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      },
    });

    if (!repRes.ok) {
      const txt = await repRes.text();
      return { statusCode: 502, body: `Supabase fetch failed: ${txt}` };
    }
    const [row] = await repRes.json();

    const subject = `[TryMeDating] New report (#${row?.id ?? reportId})`;
    const html = `
      <h3>New report submitted</h3>
      <pre style="font-size:12px">${row ? JSON.stringify(row, null, 2) : reportId}</pre>
    `;

    // Resend email
    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "alerts@trymedating.com",
        to: [ADMIN_REPORTS_EMAIL],
        subject,
        html,
      }),
    });

    if (!mailRes.ok) {
      const txt = await mailRes.text();
      return { statusCode: 502, body: `Email failed: ${txt}` };
    }

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    return { statusCode: 500, body: e?.message || "Error" };
  }
}
