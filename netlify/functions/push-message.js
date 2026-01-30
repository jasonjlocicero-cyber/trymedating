// netlify/functions/push-subscribe.js
const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getBearerToken(headers) {
  const h = headers || {};
  const raw = h.authorization || h.Authorization || "";
  if (!raw || typeof raw !== "string") return "";
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const token = getBearerToken(event.headers);
    if (!token) {
      return json(401, { error: "Missing Authorization: Bearer <access_token>" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // ✅ Verify who is calling
    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user?.id) {
      return json(401, { error: "Invalid/expired token" });
    }
    const userId = u.user.id;

    const body = JSON.parse(event.body || "{}");
    const sub = body?.subscription;

    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return json(400, { error: "Missing subscription endpoint/keys (p256dh/auth)" });
    }

    const row = {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null,
      updated_at: new Date().toISOString(),
    };

    // ✅ Store/update this device subscription
    // Recommended DB constraint: UNIQUE(endpoint)
    // If you instead use UNIQUE(user_id, endpoint), change onConflict accordingly.
    const { error: upErr } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });

    if (upErr) throw upErr;

    return json(200, { ok: true });
  } catch (e) {
    console.error("push-subscribe error:", e);
    return json(500, { error: e?.message || "Server error" });
  }
};
;
