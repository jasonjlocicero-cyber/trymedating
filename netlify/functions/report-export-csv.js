// netlify/functions/reports-export-csv.js
export async function handler(event) {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE,
    ADMIN_CSV_KEY
  } = process.env;

  const key = event.queryStringParameters?.key || "";
  if (!ADMIN_CSV_KEY || key !== ADMIN_CSV_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const restUrl =
    `${SUPABASE_URL}/rest/v1/reports` +
    `?select=id,created_at,reporter_id,reported_user_id,category,notes,status` +
    `&order=created_at.desc`;

  const r = await fetch(restUrl, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    return { statusCode: r.status, body: txt };
  }

  const rows = await r.json();
  const headers = ["id","created_at","reporter_id","reported_user_id","category","notes","status"];
  const esc = (s = "") => `"${String(s).replace(/"/g, '""')}"`;
  const csv = [headers.join(",")]
    .concat(rows.map(x => headers.map(h => esc(x?.[h] ?? "")).join(",")))
    .join("\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reports-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
    body: csv,
  };
}
