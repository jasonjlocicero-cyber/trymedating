// src/components/ChatDock.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import AttachmentButton from "./AttachmentButton";
import { uploadChatFile, signedUrlForPath } from "../lib/chatMedia";

/* ------------------------ helpers & constants ------------------------ */
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
const ALLOWED = /^(image\/.*|application\/pdf)$/; // allowed attachments

// message body encodings
const isAttachment = (b) => typeof b === "string" && b.startsWith("[[file:");
const parseAttachment = (b) => { try { return JSON.parse(decodeURIComponent(b.slice(7, -2))); } catch { return null; } };
const isDeletedAttachment = (b) => typeof b === "string" && b.startsWith("[[deleted:");
const parseDeleted = (b) => { try { return JSON.parse(decodeURIComponent(b.slice(10, -2))); } catch { return null; } };

/* ----------------------------- linkifying ---------------------------- */
/** Safely convert URLs/emails in plain text to <a> elements (no innerHTML). */
function linkifyJSX(text) {
  if (!text) return null;
  const LINK_RE = /((https?:\/\/|www\.)[^\s<]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})/gi;
  const out = [];
  let last = 0;
  let m;
  let key = 0;

  while ((m = LINK_RE.exec(text))) {
    const raw = m[0];
    const pre = text.slice(last, m.index);
    if (pre) out.push(pre);

    // Trim common trailing punctuation from the match only
    const trimmed = raw.replace(/[)\].,!?;:]+$/g, "");
    const trailing = raw.slice(trimmed.length);

    const isUrl = !!m[1];
    const href = isUrl
      ? (trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed)
      : `mailto:${trimmed}`;

    out.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="nofollow noopener noreferrer"
        style={{ textDecoration: "underline" }}
      >
        {trimmed}
      </a>
    );
    if (trailing) out.push(trailing);
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ------------------------------ UI bits ------------------------------ */
const Btn = ({ onClick, label, tone = "primary", disabled, title }) => {
  const bg = tone === "danger" ? "#dc2626" : tone === "ghost" ? "#e5e7eb" : "#2563eb";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "8px 12px",
        borderRadius: 16,
        marginRight: 8,
        border: "1px solid var(--border)",
        background: disabled ? "#cbd5e1" : bg,
        color: tone === "ghost" ? "#111" : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );
};

const Pill = (txt, color) => (
  <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: color, color: "#111" }}>{txt}</span>
);

function ProgressBar({ percent }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  return (
    <div style={{ width: "100%", height: 8, background: "#eee", borderRadius: 8 }}>
      <div style={{ width: `${p}%`, height: 8, borderRadius: 8, background: "#2563eb" }} />
    </div>
  );
}

/** Attachment bubble with auto-refreshing signed URL + optional delete (owner only) */
function AttachmentPreview({ meta, mine, onDelete, deleting }) {
  const [url, setUrl] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (!meta?.path) return;
      try {
        const u = await signedUrlForPath(meta.path, 3600); // 1h
        if (alive) setUrl(u);
      } catch {}
    }
    refresh();
    const id = setInterval(() => setRefreshTick((n) => n + 1), 55 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [meta?.path, refreshTick]);

  const handleImgError = () => setRefreshTick((n) => n + 1);

  return (
    <div
      style={{
        maxWidth: 520, padding: "8px 10px", borderRadius: 12, border: "1px solid var(--border)",
        background: mine ? "#eef6ff" : "#f8fafc", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13 }}>
          Attachment: {meta?.name || "file"}{meta?.size ? ` (${Math.ceil(meta.size / 1024)} KB)` : ""}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button" title="Refresh link" onClick={() => setRefreshTick((n) => n + 1)}
            style={{ border: "1px solid var(--border)", background: "#f3f4f6", color: "#111", borderRadius: 8, padding: "4px 8px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ⟳
          </button>
          {mine && onDelete && (
            <button
              type="button" onClick={() => onDelete(meta)} disabled={deleting} title="Delete attachment"
              style={{ border: "1px solid var(--border)", background: deleting ? "#cbd5e1" : "#fee2e2", color: "#111", borderRadius: 8, padding: "4px 8px", cursor: deleting ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12 }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        {url ? (
          meta?.type?.startsWith("image/") ? (
            <img src={url} alt={meta?.name || "image"} onError={handleImgError} style={{ maxWidth: 360, borderRadius: 8 }} />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" onClick={() => setRefreshTick((n) => n + 1)} style={{ fontWeight: 600 }}>Open file</a>
          )
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Generating link…</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ ChatDock ------------------------------ */
export default function ChatDock() {
  // auth
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  // connection
  const [peer, setPeer] = useState("");
  const [conn, setConn] = useState(null);
  const status = conn?.[C.status] || "none";
  const [busy, setBusy] = useState(false);

  // messages
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // attachments
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [deletingPaths, setDeletingPaths] = useState(() => new Set());

  const scrollerRef = useRef(null);
  const [autoTried, setAutoTried] = useState(false);

  /* auth */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  /* auto-resume latest connection */
  useEffect(() => {
    if (autoTried || !myId || peer) return;
    (async () => {
      const { data } = await supabase
        .from(CONN_TABLE)
        .select("*")
        .or(`${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`)
        .order(C.updatedAt, { ascending: false })
        .order(C.createdAt, { ascending: false })
        .limit(10);
      if (data?.length) {
        const accepted = data.find((r) => ACCEPTED.has(r[C.status]));
        const latest = accepted || data[0];
        setPeer(otherPartyId(latest, myId));
      }
      setAutoTried(true);
    })();
  }, [autoTried, myId, peer]);

  /* fetch + subscribe connection */
  const fetchLatestConn = useCallback(async (uid) => {
    uid = toId(uid);
    if (!uid || !peer) return;
    const pairOr =
      `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),` +
      `and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid})`;
    let q = supabase.from(CONN_TABLE).select("*").or(pairOr);
    if (C.createdAt) q = q.order(C.createdAt, { ascending: false });
    const { data } = await q.limit(1);
    setConn(data?.[0] ?? null);
  }, [peer]);

  const subscribeConn = useCallback((uid) => {
    uid = toId(uid);
    if (!uid || !peer) return () => {};
    const filter =
      `or(and(${C.requester}=eq.${uid},${C.addressee}=eq.${peer}),` +
      `and(${C.requester}=eq.${peer},${C.addressee}=eq.${uid}))`;
    const ch = supabase
      .channel(`conn:${uid}<->${peer}`)
      .on("postgres_changes", { event: "*", schema: "public", table: CONN_TABLE, filter }, () => fetchLatestConn(uid))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [peer, fetchLatestConn]);

  useEffect(() => {
    if (!myId || !peer) return;
    fetchLatestConn(myId);
    const off = subscribeConn(myId);
    return off;
  }, [myId, peer, fetchLatestConn, subscribeConn]);

  /* messages: fetch + realtime + send */
  const canSend = useMemo(
    () => !!myId && !!conn?.id && ACCEPTED.has(status) && !!text.trim() && !sending,
    [myId, conn?.id, status, text, sending]
  );

  const fetchMessages = useCallback(async () => {
    if (!conn?.id) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", conn.id)
      .order("created_at", { ascending: true });

    setItems(data || []);

    // mark messages addressed to me as read
    if (myId) {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("connection_id", conn.id)
        .eq("recipient", myId)
        .is("read_at", null);
    }
  }, [conn?.id, myId]);

  useEffect(() => {
    if (!conn?.id) return;
    fetchMessages();
    const ch = supabase
      .channel(`msgs:${conn.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${conn.id}` },
        () => fetchMessages())
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
      const payload = { connection_id: conn.id, sender: myId, recipient: recip, body: text.trim() };
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

  /* attachments: upload (optimistic progress) */
  const pickAttachment = async (file) => {
    try {
      if (!conn?.id || !file) return;
      if (file.size > MAX_UPLOAD_BYTES) { alert("File is too large (max 10MB)."); return; }
      if (!ALLOWED.test(file.type)) { alert("Images or PDFs only."); return; }

      setUploading(true);
      setUploadPct(5);

      // optimistic progress
      const tick = setInterval(() => {
        setUploadPct((p) => (p < 85 ? p + 5 : p < 90 ? p + 2 : p));
      }, 200);

      const { path } = await uploadChatFile(conn.id, file);

      clearInterval(tick);
      setUploadPct(95);

      const recip = otherPartyId(conn, myId);
      const meta = { name: file.name, type: file.type, size: file.size, path };
      const body = `[[file:${encodeURIComponent(JSON.stringify(meta))}]]`;

      const { error } = await supabase.from("messages").insert({
        connection_id: conn.id, sender: myId, recipient: recip, body,
      });
      if (error) throw error;

      setUploadPct(100);
      setTimeout(() => setUploadPct(0), 400);
    } catch (err) {
      alert(err.message ?? "Upload failed");
      console.error(err);
      setUploadPct(0);
    } finally {
      setUploading(false);
    }
  };

  /* attachments: delete (owner only) */
  const deleteAttachment = async (meta) => {
    if (!meta?.path || !conn?.id) return;
    setDeletingPaths((s) => { const n = new Set(s); n.add(meta.path); return n; });
    try {
      const { error: delErr } = await supabase.storage.from("chat-media").remove([meta.path]);
      if (delErr) throw delErr;

      const recip = otherPartyId(conn, myId);
      const tomb = `[[deleted:${encodeURIComponent(JSON.stringify({ path: meta.path, name: meta.name }))}]]`;
      const { error: msgErr } = await supabase.from("messages").insert({
        connection_id: conn.id, sender: myId, recipient: recip, body: tomb,
      });
      if (msgErr) throw msgErr;
    } catch (err) {
      alert(err.message ?? "Delete failed");
      console.error(err);
    } finally {
      setDeletingPaths((s) => { const n = new Set(s); n.delete(meta.path); return n; });
    }
  };

  /* drag & drop upload */
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) pickAttachment(f);
  }, [conn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* UI guards */
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

  /* connection controls */
  const connControls = (
    <div style={{ marginBottom: 10 }}>
      {status === "none" && <Btn onClick={requestConnect} label="Connect" disabled={busy} />}
      {status === "pending" && toId(conn?.[C.requester]) === myId && (
        <>
          <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
          <Btn tone="ghost" onClick={cancelPending} label="Cancel" disabled={busy} />
        </>
      )}
      {status === "pending" && toId(conn?.[C.addressee]) === myId && (
        <>
          <Btn onClick={() => acceptRequest()} label="Accept" disabled={busy} />
          <Btn tone="danger" onClick={rejectRequest} label="Reject" disabled={busy} />
        </>
      )}
      {ACCEPTED.has(status) && <Btn tone="danger" onClick={disconnect} label="Disconnect" disabled={busy} />}
      {(status === "rejected" || status === "disconnected") && <Btn onClick={reconnect} label="Reconnect" disabled={busy} />}
    </div>
  );

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        maxWidth: 720, margin: "12px auto", border: "1px solid var(--border)",
        borderRadius: 12, padding: 12, background: "#fff",
      }}
    >
      {/* header */}
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

      {/* controls */}
      <div style={{ marginBottom: 10 }}>{connControls}</div>

      {/* messages + composer */}
      {ACCEPTED.has(status) ? (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, maxHeight: 360 }}>
            <div
              ref={scrollerRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{
                border: "1px solid var(--border)", borderRadius: 12, padding: 12,
                overflowY: "auto", background: "#fff", minHeight: 140, maxHeight: 260,
              }}
            >
              {items.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>}

              {items.map((m) => {
                const mine = isMine(m);

                if (isDeletedAttachment(m.body)) {
                  const meta = parseDeleted(m.body);
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div style={{ maxWidth: 520, padding: "8px 10px", borderRadius: 12, border: "1px solid var(--border)", background: "#f3f4f6", fontSize: 13 }}>
                        Attachment deleted{meta?.name ? `: ${meta.name}` : ""}.
                      </div>
                    </div>
                  );
                }

                const meta = isAttachment(m.body) ? parseAttachment(m.body) : null;
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    {meta ? (
                      <AttachmentPreview
                        meta={meta}
                        mine={mine}
                        onDelete={mine ? deleteAttachment : undefined}
                        deleting={deletingPaths.has(meta?.path)}
                      />
                    ) : (
                      <div
                        style={{
                          maxWidth: 520, padding: "8px 10px", borderRadius: 12, border: "1px solid var(--border)",
                          background: mine ? "#eef6ff" : "#f8fafc", whiteSpace: "pre-wrap", wordBreak: "break-word",
                          fontSize: 14, lineHeight: 1.4,
                        }}
                      >
                        {/* linkified plain text */}
                        {linkifyJSX(m.body)}
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: mine ? "right" : "left" }}>
                          {new Date(m.created_at).toLocaleString()} {m.read_at ? "• Read" : ""}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* composer (Enter=send, Shift+Enter=newline) */}
            <form
              onSubmit={send}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <AttachmentButton onPick={pickAttachment} disabled={!conn?.id || uploading} />
              <textarea
                rows={1}
                placeholder={uploading ? "Uploading…" : "Type a message…"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                disabled={uploading}
                style={{
                  flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px",
                  fontSize: 14, resize: "none", lineHeight: 1.35, maxHeight: 120, overflowY: "auto",
                }}
              />
              <button
                type="submit"
                disabled={!canSend || uploading}
                style={{
                  padding: "10px 14px", borderRadius: 12, background: !canSend || uploading ? "#cbd5e1" : "#2563eb",
                  color: "#fff", border: "none", cursor: !canSend || uploading ? "not-allowed" : "pointer", fontWeight: 600,
                }}
              >
                Send
              </button>
            </form>

            {uploading && (
              <div style={{ marginTop: 6 }}>
                <ProgressBar percent={uploadPct} />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}



























