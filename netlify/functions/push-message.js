const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;

// ✅ Support both names so Netlify var naming can’t break pushes again
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function requireEnv(name, val) {
  if (!val) {
    const err = new Error(`Missing env var: ${name}`);
    err.code = "MISSING_ENV";
    throw err;
  }
}

exports.handler = async (event) => {
  try {
    // Optional shared secret so random callers can’t hit this endpoint
    const secret =
      event.headers["x-tmd-secret"] ||
      event.headers["X-Tmd-Secret"] ||
      event.headers["X-TMD-SECRET"];

    if (process.env.PUSH_WEBHOOK_SECRET && secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return json(401, { error: "Unauthorized" });
    }

    requireEnv("SUPABASE_URL", SUPABASE_URL);
    requireEnv("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)", SUPABASE_SERVICE_KEY);
    requireEnv("VAPID_PUBLIC_KEY", process.env.VAPID_PUBLIC_KEY);
    requireEnv("VAPID_PRIVATE_KEY", process.env.VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = JSON.parse(event.body || "{}");

    // Supabase DB Webhook format uses payload.record
    const record = payload?.record || payload;

    const recipientId =
      record?.recipient || payload?.recipientId || payload?.recipient_id;

    const senderId =
      record?.sender || payload?.senderId || payload?.sender_id;

    const text =
      record?.body || payload?.body || "New message";

    if (!recipientId) return json(400, { error: "Missing recipientId" });

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@trymedating.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipientId);

    if (error) throw error;

    if (!subs?.length) {
      return json(200, { ok: true, sent: 0, note: "No subscriptions for recipient" });
    }

    const isAttachment =
      typeof text === "string" &&
      (text.startsWith("[[file:") || text.startsWith("[[media:") || text.startsWith("[[image:") || text.startsWith("[[img:"));

    const notif = {
      title: "New message",
      body: isAttachment ? "📎 Attachment" : String(text).slice(0, 140),
      url: "/connections",
      tag: `msg:${senderId || "unknown"}`,
    };

    let sent = 0;
    let dead = 0;
    let failed = 0;

    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(subscription, JSON.stringify(notif));
        sent++;
      } catch (e) {
        failed++;
        const code = e?.statusCode;

        // ✅ Clean up dead subscriptions so you stop wasting sends
        if (code === 404 || code === 410) {
          dead++;
          try {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("user_id", recipientId)
              .eq("endpoint", s.endpoint);
          } catch {}
        }

        console.log("Push failed:", code, e?.body || e?.message);
      }
    }

    return json(200, { ok: true, sent, failed, dead, subs: subs.length });
  } catch (e) {
    console.error("push-message error:", e);
    return json(500, { error: e?.message || "Server error", code: e?.code });
  }
};
