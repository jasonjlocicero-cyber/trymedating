const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const requestId = event.headers["x-nf-request-id"] || "no-request-id";

  try {
    // Optional shared secret so random callers can’t hit this endpoint
    const secret = event.headers["x-tmd-secret"];
    if (process.env.PUSH_WEBHOOK_SECRET && secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return json(401, { error: "Unauthorized" });
    }

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(500, {
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE(_KEY) env vars",
      });
    }

    const payload = JSON.parse(event.body || "{}");

    const recipientId =
      payload?.record?.recipient || payload?.recipientId || payload?.recipient_id;

    const senderId =
      payload?.record?.sender || payload?.senderId || payload?.sender_id;

    const text = payload?.record?.body || payload?.body || "New message";

    if (!recipientId) return json(400, { error: "Missing recipientId" });

    // Configure VAPID
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
      return json(500, { error: "Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY" });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@trymedating.com",
      vapidPublic,
      vapidPrivate
    );

    // Pull all subscriptions for this recipient
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, updated_at")
      .eq("user_id", recipientId);

    if (error) throw error;
    if (!subs?.length) {
      console.log(`[${requestId}] No subscriptions for user`, recipientId);
      return json(200, { ok: true, sent: 0, pruned: 0, note: "No subscriptions" });
    }

    const notif = {
      title: "New message",
      body: text?.startsWith?.("[[file:") ? "📎 Attachment" : String(text).slice(0, 120),
      url: "/connections",
      tag: `msg:${senderId || "unknown"}`,
    };

    let sent = 0;
    let pruned = 0;
    const results = [];

    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(subscription, JSON.stringify(notif), {
          TTL: 60 * 60, // 1 hour
        });
        sent++;
        results.push({ endpoint: s.endpoint, ok: true });
      } catch (e) {
        const code = e?.statusCode;
        const msg = e?.body || e?.message || "Push failed";

        console.log(`[${requestId}] Push failed:`, code, msg);

        // AUTO-DELETE DEAD SUBSCRIPTIONS
        if (code === 410 || code === 404) {
          try {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", s.endpoint);
            pruned++;
            console.log(`[${requestId}] Pruned dead subscription`, s.endpoint);
          } catch (delErr) {
            console.log(`[${requestId}] Failed pruning`, delErr?.message || delErr);
          }
        }

        results.push({ endpoint: s.endpoint, ok: false, code, msg });
      }
    }

    console.log(
      `[${requestId}] Push summary user=${recipientId} sent=${sent} pruned=${pruned} total=${subs.length}`
    );

    return json(200, { ok: true, sent, pruned, total: subs.length, results });
  } catch (e) {
    console.error(`[${requestId}] push-message error:`, e);
    return json(500, { error: e?.message || "Server error" });
  }
};
