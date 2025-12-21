// src/components/ChatLauncher.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "./ChatDock";

// Small helper to fetch a display name/handle for a user id
async function fetchProfileName(userId) {
  if (!userId) return "";
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, handle, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return "";
  return data.display_name || (data.handle ? `@${data.handle}` : "");
}

export default function ChatLauncher({ onUnreadChange = () => {} }) {
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);

  // "thread" selection
  const [partnerId, setPartnerId] = useState(null);
  const [partnerName, setPartnerName] = useState("");

  // inbox list
  const [loadingList, setLoadingList] = useState(false);
  const [recent, setRecent] = useState([]);
  const [err, setErr] = useState("");

  // New-message toast (shows only when dock is closed)
  // shape: { fromId, fromName, text }
  const [toast, setToast] = useState(null);

  // responsive: mobile = fullscreen
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const closeAll = () => {
    setOpen(false);
    setPartnerId(null);
    setPartnerName("");
  };

  // ------- auth -------
  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ------- global opener + event -------
  useEffect(() => {
    function openFromEvent(ev) {
      const d = ev?.detail || {};
      if (d.partnerId) {
        setPartnerId(d.partnerId);
        setPartnerName(d.partnerName || "");
      }
      setOpen(true);
    }

    window.addEventListener("open-chat", openFromEvent);

    // allow calling window.openChat(id, name)
    window.openChat = function (id, name = "") {
      if (id) {
        setPartnerId(id);
        setPartnerName(name || "");
      }
      setOpen(true);
    };

    return () => window.removeEventListener("open-chat", openFromEvent);
  }, []);

  // ------- recent list when panel is open (and user is authed) -------
  useEffect(() => {
    let cancel = false;

    async function loadRecent() {
      if (!open || !me?.id) return;

      setLoadingList(true);
      setErr("");

      try {
        const { data, error } = await supabase
          .from("messages")
          .select("sender, recipient, created_at")
          .or(`sender.eq.${me.id},recipient.eq.${me.id}`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const seen = new Set();
        const order = [];
        for (const m of data || []) {
          const other = m.sender === me.id ? m.recipient : m.sender;
          if (other && !seen.has(other)) {
            seen.add(other);
            order.push(other);
          }
          if (order.length >= 12) break;
        }

        if (!order.length) {
          if (!cancel) setRecent([]);
          return;
        }

        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle")
          .in("user_id", order);

        if (pErr) throw pErr;

        const rank = new Map(order.map((id, i) => [id, i]));
        const list = (profs || [])
          .map((p) => ({
            id: p.user_id,
            display_name: p.display_name || "",
            handle: p.handle || "",
          }))
          .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));

        if (!cancel) setRecent(list);
      } catch (e) {
        if (!cancel) setErr(e.message || "Failed to load conversations");
      } finally {
        if (!cancel) setLoadingList(false);
      }
    }

    loadRecent();
    return () => {
      cancel = true;
    };
  }, [open, me?.id]);

  // ------- unread count (fix: use count, not data.length when head:true) -------
  async function computeUnread(userId) {
    if (!userId) {
      onUnreadChange(0);
      return;
    }

    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient", userId)
      .is("read_at", null);

    if (error) return onUnreadChange(0);
    onUnreadChange(typeof count === "number" ? count : 0);
  }

  useEffect(() => {
    computeUnread(me?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // Live bump on relevant message changes
  useEffect(() => {
    if (!me?.id) return;

    const channel = supabase
      .channel(`messages-unread-${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `recipient=eq.${me.id}` },
        () => computeUnread(me.id)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  // ------- new-message toast when dock is closed -------
  useEffect(() => {
    if (!me?.id) return;

    const ch = supabase
      .channel(`toast-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${me.id}` },
        async ({ new: m }) => {
          if (open) return; // don't toast if panel is open
          const name = await fetchProfileName(m.sender);
          const text = m.body?.startsWith?.("[[file:") ? "Attachment" : m.body || "Message";
          setToast({ fromId: m.sender, fromName: name || "New message", text });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [me?.id, open]);

  const canChat = !!(me?.id && partnerId);

  const panelStyle = useMemo(() => {
    if (!open) return null;

    // Mobile: full-screen
    if (isMobile) {
      return {
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
      };
    }

    // Desktop: popup
    return {
      position: "fixed",
      right: 16,
      bottom: 80,
      width: 360,
      height: 560,
      maxWidth: "calc(100vw - 24px)",
      background: "#fff",
      border: "1px solid var(--border)",
      borderRadius: 16,
      boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
      padding: 10,
      zIndex: 2000,
      display: "flex",
      flexDirection: "column",
    };
  }, [open, isMobile]);

  return (
    <>
      {/* Floating launcher button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Messages"
        aria-label="Messages"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: "#fff",
          boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
          display: "grid",
          placeItems: "center",
          zIndex: 1999,
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 24 }}>💬</span>
      </button>

      {/* Panel (inbox OR thread) */}
      {open && (
        <div style={panelStyle}>
          {/* panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 6px 10px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {partnerId ? (
                <button
                  className="btn btn-neutral"
                  onClick={() => {
                    setPartnerId(null);
                    setPartnerName("");
                  }}
                  style={{ padding: "4px 8px" }}
                  title="Back"
                >
                  ←
                </button>
              ) : null}

              <div style={{ fontWeight: 900 }}>
                {partnerId ? partnerName || "Chat" : "Messages"}
              </div>
            </div>

            <button
              className="btn btn-neutral"
              onClick={closeAll}
              style={{ padding: "4px 8px" }}
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* panel body */}
          <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
            {!me?.id && <div className="helper-error">Sign in to message.</div>}

            {me?.id && !partnerId && (
              <>
                <div className="helper-muted" style={{ marginBottom: 8 }}>
                  Pick a recent chat:
                </div>

                {err && (
                  <div className="helper-error" style={{ marginBottom: 8 }}>
                    {err}
                  </div>
                )}
                {loadingList && <div className="muted">Loading…</div>}
                {!loadingList && recent.length === 0 && (
                  <div className="muted">
                    No conversations yet. Open someone’s profile to start a chat.
                  </div>
                )}

                <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "100%", overflowY: "auto" }}>
                  {recent.map((p) => (
                    <li key={p.id}>
                      <button
                        className="btn btn-neutral"
                        style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6 }}
                        onClick={() => {
                          setPartnerId(p.id);
                          setPartnerName(p.display_name || (p.handle ? `@${p.handle}` : "Friend"));
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: "#eef2f7",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {(p.display_name || p.handle || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontWeight: 700 }}>{p.display_name || "Unnamed"}</div>
                            {p.handle && <div className="muted">@{p.handle}</div>}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Chat dock (IMPORTANT: pass peerId, not partnerId) */}
            {me?.id && canChat && (
              <div style={{ height: "100%", minHeight: 0 }}>
                <ChatDock peerId={partnerId} mode="widget" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* New-message toast (bottom-left) */}
      {toast && (
        <div
          role="alert"
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 2100,
            background: "#111827",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 10,
            boxShadow: "0 10px 24px rgba(0,0,0,.2)",
            maxWidth: 280,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{toast.fromName}</div>
          <div
            style={{
              opacity: 0.9,
              marginBottom: 8,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {toast.text}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setPartnerId(toast.fromId);
                setPartnerName(toast.fromName || "");
                setOpen(true);
                setToast(null);
              }}
            >
              Open
            </button>
            <button className="btn btn-neutral" onClick={() => setToast(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}




