// netlify/functions/push-message.js
const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const secret = event.headers["x-tmd-secret"];
    if (process.env.PUSH_WEBHOOK_SECRET && secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return json(401, { error: "Unauthorized" });
    }

    const payload = JSON.parse(event.body || "{}");

    const recipientId =
      payload?.record?.recipient || payload?.recipientId || payload?.recipient_id;

    const senderId =
      payload?.record?.sender || payload?.senderId || payload?.sender_id;

    const text = payload?.record?.body || payload?.body || "New message";

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
    if (!subs?.length) return json(200, { ok: true, sent: 0, note: "No subscriptions" });

    const notif = {
      title: "New message",
      body: text?.startsWith?.("[[file:") ? "📎 Attachment" : String(text).slice(0, 120),
      url: "/connections",
      tag: `msg:${senderId || "unknown"}`,
    };

    let sent = 0;
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

        // ✅ critical: remove dead endpoints so future pushes succeed
        if (code === 404 || code === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", recipientId)
            .eq("endpoint", s.endpoint);
        }

        console.log("Push failed:", code, e?.body || e?.message);
      }
    }

    return json(200, { ok: true, sent, failed });
  } catch (e) {
    console.error("push-message error:", e);
    return json(500, { error: e?.message || "Server error" });
  }
};
