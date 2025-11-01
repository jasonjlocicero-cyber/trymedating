// src/lib/unread.js
// Lightweight helpers to fetch and subscribe to the user's unread count.

export async function fetchUnreadCount(supabase, userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("recipient", userId)
    .is("read_at", null);

  if (error) {
    console.warn("[unread] fetch error:", error);
    return 0;
  }
  return count || 0;
}

/**
 * subscribeUnreadCount(supabase, userId, cb)
 * - Calls cb(count) initially and whenever your unread count changes.
 * - Returns an unsubscribe function.
 */
export function subscribeUnreadCount(supabase, userId, cb) {
  if (!userId) return () => {};

  let cancelled = false;

  const update = async () => {
    const n = await fetchUnreadCount(supabase, userId);
    if (!cancelled) cb(n);
  };

  // Initial fetch
  update();

  // Listen for inserts/updates that affect me
  const ch = supabase
    .channel(`unread:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${userId}` },
      update
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `recipient=eq.${userId}` },
      update
    )
    .subscribe();

  return () => {
    cancelled = true;
    try {
      supabase.removeChannel(ch);
    } catch {}
  };
}
