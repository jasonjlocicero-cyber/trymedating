import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import AttachmentButton from "../components/AttachmentButton";
import { uploadChatFile, signedUrlForPath } from "../lib/chatMedia";

/** ----------------------------------------
 * Helpers & constants
 * -------------------------------------- */
const ACCEPTED = new Set(["accepted", "connected", "approved"]);
const CONN_TABLE = "connections";
const C = {
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");
const otherPartyId = (row, my) => (row?.[C.requester] === my ? row?.[C.addressee] : row?.[C.requester]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// Attachment helpers (encode metadata in body)
const isAttachment = (body) => typeof body === "string" && body.startsWith("[[file:");
const parseAttachment = (body) => {
  try {
    const json = decodeURIComponent(body.slice(7, -2)); // strip [[file:  and ]]
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/** Preview bubble for attachments (image or generic link) */
function AttachmentPreview({ meta, mine }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (meta?.path) {
      signedUrlForPath(meta.path, 3600).then((u) => alive && setUrl(u));
    }
    return () => { alive = false; };
  }, [meta?.path]);

  return (
    <div
      style={{
        maxWidth: 520,
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: mine ? "#eef6ff" : "#f8fafc",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        Attachment: {meta?.name || "file"}{meta?.size ? ` (${Math.ceil(meta.size/1024)} KB)` : ""}
      </div>
      {url ? (
        meta?.type?.startsWith("image/")
          ? <img src={url} alt={meta?.name || "image"} style={{ maxWidth: 360, borderRadius: 8 }} />
          : <a href={url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Open file</a>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Generating link…</div>
      )}
    </div>
  );
}

/** ----------------------------------------
 * ChatDock
 * -------------------------------------- */
export default function ChatDock() {
  // auth / ids
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  // connection state
  const [peer, setPeer] = useState(""); // auto-filled by "auto resume"
  const [conn, setConn] = useState(null);
  const status = conn?.[C.status] || "none";
  const [busy, setBusy] = useState(false);

  // messages (inline composer)
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollerRef = useRef(null);

  /* -------------------- auth -------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  /* -------------------- auto-resume latest connection -------------------- */
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (autoTried || !myId || peer) return;
    (async () => {
      const { data, error } = await supabase
        .from(CONN_TABLE)
        .select("*")
        .or(`${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`)
        .order(C.updatedAt, { ascending: false })
        .order(C.createdAt, { ascending: false })
        .limit(10);

      if (!error && data?.length) {
        const accepted = data.find((r) => ACCEPTED.has(r[C.status]));
        const latest = accepted || data[0];
        setPeer(otherPartyId(latest, myId));
      }
      setAutoTried(true);
    })();
  }, [autoTried, myId, peer]);

  /* -------------------- fetch + subscribe connection -------------------- */
  const fetchLatestConn = useCallback(
    async (uid) => {
      uid = toId(uid);
      if (!uid || !peer) return;
      const pairOr =
        `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),` +
        `and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid})`;
      let q = supabase.from(CONN_TABLE).select("*").or(pairOr);
      if (C.createdAt) q = q.order(C.createdAt, { ascending: false });
      const { data, error } = await q.limit(1);
      if (!error) setConn(data?.[0] ?? null);
    },
    [peer]
  );

  const subscribeConn = useCallback(
    (uid) => {
      uid = toId(uid);
      if (!uid || !peer) return () => {};
      const filter =
        `or(and(${C.requester}=eq.${uid},${C.addressee}=eq.${peer}),` +
        `and(${C.requester}=eq.${peer},${C.addressee}=eq.${uid}))`;
      const ch = supabase
        .channel(`conn:${uid}<->${peer}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: CONN_TABLE, filter },
          () => fetchLatestConn(uid)
        )
        .subscribe();
      return () => supabase.removeChannel(ch);
    },
    [peer, fetchLatestConn]
  );

  useEffect(() => {
    if (!myId || !peer) return;
    fetchLatestConn(myId);
    const off = subscribeConn(myId);
    return off;
  }, [myId, peer, fetchLatestConn, subscribeConn]);

  /* -------------------- connection actions -------------------- */
  const requestConnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      if (
        conn &&
        conn[C.status] === "pending" &&
        toId(conn[C.requester]) === peer &&
        toId(conn[C.addressee]) === myId
      ) {
        await acceptRequest(conn.id);
        return;
      }
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(CONN_TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to connect."); }
    finally { setBusy(false); }
  };

  const acceptRequest = async (id = conn?.id) => {
    const cid = toId(id);
    if (!cid || !conn || conn[C.status] !== "pending" || toId(conn[C.addressee]) !== myId) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "accepted", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to accept."); }
    finally { setBusy(false); }
  };

  const rejectRequest = async () => {
    if (!conn || conn[C.status] !== "pending" || toId(conn[C.addressee]) !== myId) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "rejected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to reject."); }
    finally { setBusy(false); }
  };

  const cancelPending = async () => {
    if (!conn || conn[C.status] !== "pending" || toId(conn[C.requester]) !== myId) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to cancel."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED.has(conn[C.status])) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to disconnect."); }
    finally { setBusy(false); }
  };

  const reconnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(CONN_TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to reconnect."); }
    finally { setBusy(false); }
  };

  /* -------------------- messages: fetch + realtime + send -------------------- */
  const canSend = useMemo(
    () => !!myId && !!conn?.id && ACCEPTED.has(status) && !!text.trim() && !sending,
    [myId, conn?.id, status, text, sending]
  );

  const fetchMessages = useCallback(async () => {
    if (!conn?.id) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", conn.id)
      .order("created_at", { ascending: true });
    if (!error) setItems(data || []);
  }, [conn?.id]);

  useEffect(() => {
    if (!conn?.id) return;
    fetchMessages();
    const ch = supabase
      .channel(`msgs:${conn.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${conn.id}` },
        () => fetchMessages()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [conn?.id, fetchMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!canSend) return;
    setSending(true);
    try {
      const recip = otherPartyId(conn, myId);
      const payload = {
        connection_id: conn.id,
        sender: myId,     // legacy NOT NULL column
        recipient: recip, // legacy NOT NULL column
        body: text.trim(),
      };
      const { error } = await supabase.from("messages").insert(payload);
      if (error) throw error;
      setText("");
    } catch (err) {
      alert(err.message ?? "Failed to send");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const isMine = (m) => (m.sender === myId) || (m.sender_id === myId);

  /* -------------------- attachment flow -------------------- */
  const pickAttachment = async (file) => {
    try {
      if (!conn?.id || !file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert("File is too large (max 10MB).");
        return;
      }
      setUploading(true);

      // Upload to chat-media/<connectionId>/<timestamp>-<filename>
      const { path } = await uploadChatFile(conn.id, file);

      // Insert a special "attachment" message with encoded metadata in body
      const recip = otherPartyId(conn, myId);
      const meta = { name: file.name, type: file.type, size: file.size, path };
      const body = `[[file:${encodeURIComponent(JSON.stringify(meta))}]]`;

      const { error } = await supabase.from("messages").insert({
        connection_id: conn.id,
        sender: myId,
        recipient: recip,
        body,
      });
      if (error) throw error;
    } catch (err) {
      alert(err.message ?? "Upload failed");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  /* -------------------- small UI helpers -------------------- */
  const Btn = ({ onClick, label, tone = "primary", disabled }) => {
    const bg = tone === "danger" ? "#dc2626" : tone === "ghost" ? "#e5e7eb" : "#2563eb";
    return (
      <button
        onClick={onClick}
        disabled={busy || disabled}
        style={{
          padding: "8px 12px",
          borderRadius: 16,
          marginRight: 8,
          border: "1px solid var(--border)",
          background: disabled ? "#cbd5e1" : bg,
          color: tone === "ghost" ? "#111" : "#fff",
          cursor: busy || disabled ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {label}
      </button>
    );
  };
  const Pill = (txt, color) => (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: color, color: "#111" }}>
      {txt}
    </span>
  );

  /* -------------------- render -------------------- */
  if (!me) {
    return (
      <div style={{ maxWidth: 720, margin: "12px auto", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div className="muted" style={{ fontSize: 13 }}>Please sign in to use chat.</div>
      </div>
    );
  }

  if (!peer) {
    return (
      <div style={{ maxWidth: 720, margin: "12px auto", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Messages</div>
        <div className="muted" style={{ fontSize: 13 }}>Loading your latest conversation…</div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 720, margin: "12px auto",
        border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff",
      }}
    >
      {/* Top: connection state */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Connection</div>
        <div>
          {ACCEPTED.has(status) && Pill("Connected", "#bbf7d0")}
          {status === "pending" && Pill("Pending", "#fde68a")}
          {status === "rejected" && Pill("Rejected", "#fecaca")}
          {status === "disconnected" && Pill("Disconnected", "#e5e7eb")}
          {status === "none" && Pill("No connection", "#f3f4f6")}
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: 10 }}>
        {status === "none" && <Btn onClick={requestConnect} label="Connect" />}
        {status === "pending" && toId(conn?.[C.requester]) === myId && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}
        {status === "pending" && toId(conn?.[C.addressee]) === myId && (
          <>
            <Btn onClick={() => acceptRequest()} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}
        {ACCEPTED.has(status) && <Btn tone="danger" onClick={disconnect} label="Disconnect" />}
        {(status === "rejected" || status === "disconnected") && <Btn onClick={reconnect} label="Reconnect" />}
      </div>

      {/* Messages area (compact height) */}
      {ACCEPTED.has(status) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, maxHeight: 360 }}>
            <div
              ref={scrollerRef}
              style={{
                border: "1px solid var(--border)", borderRadius: 12, padding: 12,
                overflowY: "auto", background: "#fff",
                minHeight: 140, maxHeight: 260,
              }}
            >
              {items.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>}

              {items.map((m) => {
                const mine = isMine(m);
                const meta = isAttachment(m.body) ? parseAttachment(m.body) : null;

                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    {meta ? (
                      <AttachmentPreview meta={meta} mine={mine} />
                    ) : (
                      <div
                        style={{
                          maxWidth: 520,
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: mine ? "#eef6ff" : "#f8fafc",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 14,
                          lineHeight: 1.4,
                        }}
                      >
                        {m.body}
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: mine ? "right" : "left" }}>
                          {new Date(m.created_at).toLocaleString()} {m.read_at ? "• Read" : ""}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* composer with paperclip */}
            <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
              <AttachmentButton onPick={pickAttachment} disabled={!conn?.id || uploading} />
              <input
                type="text"
                placeholder={uploading ? "Uploading…" : "Type a message…"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={uploading}
                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}
              />
              <button
                type="submit"
                disabled={!canSend || uploading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: (!canSend || uploading) ? "#cbd5e1" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  cursor: (!canSend || uploading) ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


























