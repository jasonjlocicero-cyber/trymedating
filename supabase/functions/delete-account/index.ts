import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing env", { status: 500 });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return new Response("Unauthorized", { status: 401 });

    // Admin client (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Identify the caller from their JWT
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes?.user) return new Response("Unauthorized", { status: 401 });

    const userId = userRes.user.id;

    // --- 1) Delete storage files (best-effort) ---
    // Avatars bucket paths in your app are `${userId}/${timestamp}.ext`
    const avatarList = await admin.storage.from("avatars").list(userId, { limit: 1000 });
    if (avatarList.data?.length) {
      const paths = avatarList.data.map((f) => `${userId}/${f.name}`);
      await admin.storage.from("avatars").remove(paths);
    }

    // If you have profile photos bucket, do the same (adjust bucket name if different)
    // const photoList = await admin.storage.from("profile-photos").list(userId, { limit: 1000 });
    // if (photoList.data?.length) {
    //   const paths = photoList.data.map((f) => `${userId}/${f.name}`);
    //   await admin.storage.from("profile-photos").remove(paths);
    // }

    // Chat attachments: pull any [[file:...]] messages sent by this user and remove their meta.path
    const { data: fileMsgs } = await admin
      .from("messages")
      .select("body")
      .eq("sender", userId)
      .like("body", "[[file:%");

    const chatPaths = new Set<string>();
    for (const row of fileMsgs || []) {
      const body = typeof row.body === "string" ? row.body : "";
      // Expected: [[file:<urlencoded json>]]
      if (!body.startsWith("[[file:") || !body.endsWith("]]")) continue;
      const encoded = body.slice("[[file:".length, -2);
      try {
        const meta = JSON.parse(decodeURIComponent(encoded));
        if (meta?.path && typeof meta.path === "string") chatPaths.add(meta.path);
      } catch {}
    }
    if (chatPaths.size) {
      await admin.storage.from("chat-media").remove(Array.from(chatPaths));
    }

    // --- 2) Delete database rows ---
    // Profiles
    await admin.from("profiles").delete().eq("user_id", userId);

    // Connections (adjust column names if yours differ)
    await admin
      .from("connections")
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    // Messages: strict interpretation of "remove all user info" = delete all messages involving them
    await admin
      .from("messages")
      .delete()
      .or(`sender.eq.${userId},recipient.eq.${userId}`);

    // If you have other tables (likes, blocks, reports, profile_photos, etc.) delete them here too.

    // --- 3) Delete the auth user ---
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      // If auth delete fails, you may already have removed user data; return error so you can investigate.
      return new Response(JSON.stringify({ ok: false, error: delAuthErr.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
