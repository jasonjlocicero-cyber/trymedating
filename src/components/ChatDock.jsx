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
const otherPartyId = (row, my) =>
  row?.[C.requester] === my ? row?.[C.addressee] : row?.[C.requester];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = /^(image\/.*|application\/pdf)$/; // allowed attachments
const bannerKey = (myId, peer) => `tmd_prev_sessions_banner_hidden:${myId || ""}:${peer || ""}`;

/* open/close tokens built programmatically to avoid parser tripping on [[...]] */
const OPEN = "[".repeat(2);     // "[["
const CLOSE = "]".repeat(2);    // "]]"
const tagStart = (t) => OPEN + t + ":"; // e.g. "[[file:"
const betweenTags = (body, t) =>
  body.slice(tagStart(t).length, -CLOSE.length);

/* ---------- human-readable file size ---------- */
function humanSize(bytes) {
  if (!(bytes > 0)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const fixed = n >= 100 || i === 0 ? 0 : 1;
  return `${n.toFixed(fixed)} ${units[i]}`;
}

/* ---------------- message body encodings & parsing ---------------- */
const isDeletedAttachment = (b) => typeof b === "string" && b.startsWith(tagStart("deleted"));
const parseDeleted = (b) => {
  try {
    return JSON.parse(decodeURIComponent(b.slice(tagStart("deleted").length, -CLOSE.length)));
  } catch {
    return null;
  }
};

/** Normalize various historical/legacy attachment formats into a common meta */
function getAttachmentMeta(body) {
  if (typeof body !== "string") return null;

  // Canonical: [[file:<json>]]
  if (body.startsWith(tagStart("file"))) {
    try {
      return JSON.parse(decodeURIComponent(betweenTags(body, "file")));
    } catch {}
  }

  // Legacy A: [[media:<json>]]
  if (body.startsWith(tagStart("media"))) {
    try {
      const v = JSON.parse(decodeURIComponent(betweenTags(body, "media")));
      return {
        name: v.name || v.filename || v.path?.split("/")?.pop(),
        type: v.type || v.mime,
        size: v.size || v.bytes,
        path: v.path || undefined,
        url: v.url || undefined,
      };
    } catch {}
  }

  // Legacy B: [[image:<url>]] or [[img:<url>]]
  if (body.startsWith(tagStart("image")) || body.startsWith(tagStart("img"))) {
    const which = body.startsWith(tagStart("image")) ? "image" : "img";
    const raw = decodeURIComponent(betweenTags(body, which));
    if (raw.startsWith("http")) {
      return { url: raw, name: raw.split("/").pop(), type: "image/*" };
    }
  }

  // Legacy C: [[filepath:<storage-relative-path>]]
  if (body.startsWith(tagStart("filepath"))) {
    const p = decodeURIComponent(betweenTags(body, "filepath"));
    return { path: p, name: p.split("/").pop() };
  }

  // Legacy D: direct public storage URL in plain text
  const urlMatch = body.match(
    /https?:\/\/[^\s]+\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/([^\s\]]+)/
  );
  if (urlMatch) {
    const url = body.trim();
    const bucket = urlMatch[1];
    const path = urlMatch[2].replace(/\]+$/, "");
    return { url, path, bucket, name: path.split("/").pop() };
  }

  return null;
}

/* ----------------------------- linkifying ---------------------------- */
function linkifyJSX(text) {
  if (!text) return null;
  const LINK_RE =
    /((https?:\/\/|www\.)[^\s<]+)|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})/gi;
  const out = [];
  let last = 0,
    m,
    key = 0;
  while ((m = LINK_RE.exec(text))) {
    const raw = m[0];
    const pre = text.slice(last, m.index);
    if (pre) out.push(pre);
    const trimmed = raw.replace(/[)\].,!?;:]+$/g, "");
    const trailing = raw.slice(trimmed.length);
    const isUrl = !!m[1];
    const href = isUrl
      ? trimmed.startsWith("www.")
        ? `https://${trimmed}`
        : trimmed
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
  <span
    style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: color,
      color: "#111",
    }}
  >
    {txt}
  </span>
);

function ProgressBar({ percent }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  return (
    <div style={{ width: "100%", height: 8, background: "#eee", borderRadius: 8 }}>
      <div style={{ width: `${p}%`, height: 8, borderRadius: 8, background: "#2563eb" }} />
    </div>
  );
}

/* ---------- compact PDF card (thumbnail-style) ---------- */
function PdfThumb({ url, name = "document.pdf" }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none" }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 72,
          border: "1px solid var(--border)",
          borderRadius: 6,
          display: "grid",
          placeItems: "center",
          background: "#fff",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 2h7l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#ef4444" />
          <path d="M13 2v5h5" fill="#fff" opacity="0.35" />
          <text x="12" y="18" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
            PDF
          </text>
        </svg>
      </div>
      <div style={{ display: "grid" }}>
        <span
          style={{
            fontWeight: 600,
            color: "#111",
            maxWidth: 360,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        <span style={{ fontSize: 12, color: "#374151" }}>Open</span>
      </div>
    </a>
  );
}

/** Attachment bubble: signed URL when path available; falls back to direct URL (legacy). */
function AttachmentPreview({ meta, mine, onDelete, deleting }) {
  const [url, setUrl] = useState(meta?.url || null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (meta?.url && !meta?.path) {
        setUrl(meta.url);
        return;
      }
      if (meta?.path) {
        try {
          const u = await signedUrlForPath(meta.path, 3600); // 1h
          if (alive) setUrl(u);
        } catch {}
      }
    }
    refresh();
    const id = setInterval(() => setRefreshTick((n) => n + 1), 55 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [meta?.path, meta?.url, refreshTick]);

  const handleImgError = () => setRefreshTick((n) => n + 1);
  const canDelete = !!meta?.path && !!onDelete;

  const isPDF =
    (meta?.type && meta.type.toLowerCase() === "application/pdf") ||
    /\.pdf$/i.test(meta?.name || "") ||
    (meta?.url && /\.pdf(?:$|\?)/i.test(meta.url));

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
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 13 }}>
          Attachment: {meta?.name || "file"}
          {meta?.size ? ` (${humanSize(meta.size)})` : ""}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {meta?.path && (
            <button
              type="button"
              title="Refresh link"
              onClick={() => setRefreshTick((n) => n + 1)}
              style={{
                border: "1px solid var(--border)",
                background: "#f3f4f6",
                color: "#111",
                borderRadius: 8,
                padding: "4px 8px",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ⟳
            </button>
          )}
          {mine && canDelete && (
            <button
              type="button"
              onClick={() => onDelete(meta)}
              disabled={deleting}
              title="Delete attachment"
              style={{
                border: "1px solid var(--border)",
                background: deleting ? "#cbd5e1" : "#fee2e2",
                color: "#111",
                borderRadius: 8,
                padding: "4px 8px",
                cursor: deleting ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* body */}
      <div style={{ marginTop: 6 }}>
        {url ? (
          isPDF ? (
            <PdfThumb url={url} name={meta?.name || "document.pdf"} />
          ) : meta?.type?.startsWith?.("image/") ||
            /\.(png|jpe?g|gif|webp|svg)$/i.test(meta?.name || "") ? (
            <img
              src={url}
              alt={meta?.name || "image"}
              onError={handleImgError}
              style={{ maxWidth: 360, borderRadius: 8 }}
            />
          ) : (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setRefreshTick((n) => n + 1)}
              style={{ fontWeight: 600 }}
            >
              Open file
            </a>
          )
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Link unavailable</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ ChatDock ------------------------------ */
export default function ChatDock({ peerId: peerIdProp }) {
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

  // sessions count (for banner)
  const [sessionCount, setSessionCount] = useState(1);

  // NEW: banner visibility persisted per pair
  const [hidePrevBanner, setHidePrevBanner] = useState(false);

  const scrollerRef = useRef(null);
  const [autoTried, setAutoTried] = useState(false);

  // TYPING: state/refs
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  // Delete-last state
  const [deleteBusy, setDeleteBusy] = useState(false);

  /* Accept peerId from route (prop) */
  useEffect(() => {
    if (peerIdProp && typeof peerIdProp === "string") {
      setPeer(peerIdProp);
    }
  }, [peerIdProp]);

  /* auth */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* when peer/myId change, load banner hidden flag */
  useEffect(() => {
    if (!myId || !peer) {
      setHidePrevBanner(false);
      return;
    }
    try {
      const stored = localStorage.getItem(bannerKey(myId, peer));
      setHidePrevBanner(stored === "1");
    } catch {
      setHidePrevBanner(false);
    }
  }, [myId, peer]);

  const dismissBanner = () => {
    setHidePrevBanner(true);
    try {
      localStorage.setItem(bannerKey(myId, peer), "1");
    } catch {}
  };

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
  const fetchLatestConn = useCallback(
    async (uid) => {
      uid = toId(uid);
      if (!uid || !peer) return;
      const pairOr =
        `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),` +
        `and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid})`;
      let q = supabase.from(CONN_TABLE).select("*").or(pairOr);
      q = q.order(C.updatedAt, { ascending: false }).order(C.createdAt, { ascending: false });
      const { data } = await q.limit(1);
      setConn(data?.[0] ?? null);
    },
    [peer]
  );

  const subscribeConn = useCallback(
    (uid) => {
      uid = toId(uid);
      if (!uid || !peer) return () => {};
      const filter = `or=(and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid}))`;
      const ch = supabase
        .channel(`conn:${uid}<->${peer}`)
        .on("postgres_changes", { event: "*", schema: "public", table: CONN_TABLE, filter }, () =>
          fetchLatestConn(uid)
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

  // Light polling as a safety net
  useEffect(() => {
    if (!myId || !peer) return;
    const id = setInterval(() => fetchLatestConn(myId), 4000);
    return () => clearInterval(id);
  }, [myId, peer, fetchLatestConn]);

  /* ---------------------- messages: fetch + realtime ---------------------- */
  const fetchAllConnIdsForPair = useCallback(async () => {
    if (!myId || !peer) return [];
    const pairOr =
      `and(${C.requester}.eq.${myId},${C.addressee}.eq.${peer}),` +
      `and(${C.requester}.eq.${peer},${C.addressee}.eq.${myId})`;
    const { data } = await supabase
      .from(CONN_TABLE)
      .select("id")
      .or(pairOr)
      .order(C.createdAt, { ascending: true });
    return (data || []).map((r) => r.id);
  }, [myId, peer]);

  const fetchMessages = useCallback(async () => {
    if (!myId || !peer) return;
    const connIds = await fetchAllConnIdsForPair();
    setSessionCount(connIds.length); // banner count
    if (!connIds.length) {
      setItems([]);
      return;
    }

    const { data } = await supabase
      .from("messages")
      .select("*")
      .in("connection_id", connIds)
      .order("created_at", { ascending: true });

    setItems(data || []);

    // mark all unread (for me) across the pair as read
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("connection_id", connIds)
      .eq("recipient", myId)
      .is("read_at", null);
  }, [fetchAllConnIdsForPair, myId, peer]);

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

  /* ----------------------- TYPING: realtime broadcast --------------------- */
  useEffect(() => {
    if (!conn?.id) return;
    const ch = supabase.channel(`typing:${conn.id}`, {
      config: { broadcast: { self: true } },
    });

    ch.on("broadcast", { event: "typing" }, (payload) => {
      const uid = payload?.payload?.userId;
      if (uid && uid !== myId) {
        setPeerTyping(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 2500);
      }
    });

    ch.subscribe();
    typingChannelRef.current = ch;

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
      typingChannelRef.current = null;
      clearTimeout(typingTimeoutRef.current);
    };
  }, [conn?.id, myId]);

  const sendTyping = () => {
    const now = Date.now();
    if (!typingChannelRef.current) return;
    if (now - lastTypingSentRef.current < 1000) return; // 1s throttle
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: myId },
    });
    lastTypingSentRef.current = now;
  };

  /* -------------------------------- send -------------------------------- */
  const canSend = useMemo(
    () => !!myId && !!conn?.id && ACCEPTED.has(status) && !!text.trim() && !sending,
    [myId, conn?.id, status, text, sending]
  );

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

  const isMine = (m) => m.sender === myId || m.sender_id === myId;

  // COPY: clipboard helper
  const copyBody = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt || "");
    } catch {}
  };

  /* -------------------- attachments: upload / delete -------------------- */
  const pickAttachment = async (file) => {
    try {
      if (!conn?.id || !file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert("File is too large (max 10MB).");
        return;
      }
      if (!ALLOWED.test(file.type)) {
        alert("Images or PDFs only.");
        return;
      }

      setUploading(true);
      setUploadPct(5);

      const tick = setInterval(() => {
        setUploadPct((p) => (p < 85 ? p + 5 : p < 90 ? p + 2 : p));
      }, 200);

      const { path } = await uploadChatFile(conn.id, file);

      clearInterval(tick);
      setUploadPct(95);

      const recip = otherPartyId(conn, myId);
      const meta = { name: file.name, type: file.type, size: file.size, path };
      const body = tagStart("file") + encodeURIComponent(JSON.stringify(meta)) + CLOSE;

      const { error } = await supabase.from("messages").insert({
        connection_id: conn.id,
        sender: myId,
        recipient: recip,
        body,
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

  const deleteAttachment = async (meta) => {
    if (!meta?.path || !conn?.id) return;
    setDeletingPaths((s) => {
      const n = new Set(s);
      n.add(meta.path);
      return n;
    });
    try {
      const { error: delErr } = await supabase.storage.from("chat-media").remove([meta.path]);
      if (delErr) throw delErr;

      const recip = otherPartyId(conn, myId);
      const tomb =
        tagStart("deleted") +
        encodeURIComponent(JSON.stringify({ path: meta.path, name: meta.name })) +
        CLOSE;
      const { error: msgErr } = await supabase.from("messages").insert({
        connection_id: conn.id,
        sender: myId,
        recipient: recip,
        body: tomb,
      });
      if (msgErr) throw msgErr;
    } catch (err) {
      alert(err.message ?? "Delete failed");
      console.error(err);
    } finally {
      setDeletingPaths((s) => {
        const n = new Set(s);
        n.delete(meta.path);
        return n;
      });
    }
  };

  /* ------------------------------ drag & drop ------------------------------ */
  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) pickAttachment(f);
    },
    [conn?.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ---------- actions (defined BEFORE connControls) ---------- */
  const requestConnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      // Reuse existing row if previously disconnected/rejected
      const pairOr =
        `and(${C.requester}.eq.${myId},${C.addressee}.eq.${peer}),` +
        `and(${C.requester}.eq.${peer},${C.addressee}.eq.${myId})`;
      const { data: prev } = await supabase
        .from(CONN_TABLE)
        .select("*")
        .or(pairOr)
        .order(C.updatedAt, { ascending: false })
        .order(C.createdAt, { ascending: false })
        .limit(1);

      const row = prev?.[0];
      if (row && (row[C.status] === "disconnected" || row[C.status] === "rejected")) {
        const payload = {
          [C.status]: "pending",
          [C.requester]: myId,
          [C.addressee]: peer,
          [C.updatedAt]: new Date().toISOString(),
        };
        const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", row.id).select();
        if (error) throw error;
        setConn(Array.isArray(data) ? data[0] : data);
        return;
      }

      // If the other side already requested me, accept that one
      if (
        row &&
        row[C.status] === "pending" &&
        toId(row[C.requester]) === peer &&
        toId(row[C.addressee]) === myId
      ) {
        await acceptRequest(row.id);
        return;
      }

      // Otherwise, create fresh pending
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(CONN_TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to connect.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (id = conn?.id) => {
    const cid = toId(id);
    if (!cid) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "accepted", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to accept.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async () => {
    if (!conn || conn[C.status] !== "pending") return;
    setBusy(true);
    try {
      const payload = { [C.status]: "rejected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to reject.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    if (!conn || conn[C.status] !== "pending") return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to cancel.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED.has(conn[C.status])) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to disconnect.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // Reuse the SAME row on reconnect so connection_id stays stable
  const reconnect = async () => {
    if (!conn || !myId || !peer) return;
    setBusy(true);
    try {
      const payload = {
        [C.status]: "pending",
        [C.requester]: myId,
        [C.addressee]: peer,
        [C.updatedAt]: new Date().toISOString(),
      };
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message || "Failed to reconnect.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  /* -------- Delete my last message (calls RPC) -------- */
  const canDeleteLast = useMemo(
    () => !!myId && !!conn?.id && items.some((m) => isMine(m)),
    [myId, conn?.id, items]
  );

  const deleteMyLastMessage = async () => {
    if (!conn?.id || !myId) return;
    if (!confirm("Delete your last message for this conversation?")) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase.rpc("tmd_delete_last_message", { p_connection_id: conn.id });
      if (error) throw error;
      await fetchMessages(); // refresh list
    } catch (e) {
      // If function is missing, surface a helpful hint but don’t break UI
      alert(e?.message || "Failed to delete last message.");
      console.error("[delete last message]", e);
    } finally {
      setDeleteBusy(false);
    }
  };

  /* connection controls (AFTER actions) */
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
      {ACCEPTED.has(status) && (
        <Btn tone="danger" onClick={disconnect} label="Disconnect" disabled={busy} />
      )}
      {(status === "rejected" || status === "disconnected") && (
        <Btn onClick={reconnect} label="Reconnect" disabled={busy} />
      )}
    </div>
  );

  /* UI guards */
  if (!me) {
    return (
      <div
        style={{
          maxWidth: 720,
          margin: "12px auto",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div className="muted" style={{ fontSize: 13 }}>
          Please sign in to use chat.
        </div>
      </div>
    );
  }
  if (!peer) {
    return (
      <div
        style={{
          maxWidth: 720,
          margin: "12px auto",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Messages</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Loading your latest conversation…
        </div>
      </div>
    );
  }

  /* UI */
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        maxWidth: 720,
        margin: "12px auto",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
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
          {/* sessions banner (dismissible, persisted per pair) */}
          {sessionCount > 1 && !hidePrevBanner && (
            <div
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                color: "#374151",
                background: "#f8fafc",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>Showing messages from previous sessions ({sessionCount})</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={dismissBanner}
                style={{
                  border: "1px solid var(--border)",
                  background: "#fff",
                  color: "#111",
                  borderRadius: 6,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                  lineHeight: 1,
                }}
                title="Hide this notice"
              >
                ×
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, maxHeight: 360 }}>
            <div
              ref={scrollerRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                overflowY: "auto",
                background: "#fff",
                minHeight: 140,
                maxHeight: 260,
              }}
            >
              {items.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>}

              {items.map((m) => {
                const mine = isMine(m);

                if (isDeletedAttachment(m.body)) {
                  const meta = parseDeleted(m.body);
                  return (
                    <div
                      key={m.id}
                      style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}
                    >
                      <div
                        style={{
                          maxWidth: 520,
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "#f3f4f6",
                          fontSize: 13,
                        }}
                      >
                        Attachment deleted{meta?.name ? `: ${meta.name}` : ""}.
                      </div>
                    </div>
                  );
                }

                const meta = getAttachmentMeta(m.body);
                return (
                  <div
                    key={m.id}
                    style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}
                  >
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
                        {linkifyJSX(m.body)}

                        <div
                          style={{
                            marginTop: 6,
                            display: "flex",
                            justifyContent: mine ? "flex-end" : "space-between",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {/* COPY button */}
                          <button
                            type="button"
                            onClick={() => copyBody(m.body)}
                            title="Copy message"
                            style={{
                              border: "1px solid var(--border)",
                              background: "#fff",
                              color: "#111",
                              borderRadius: 8,
                              padding: "2px 8px",
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            Copy
                          </button>

                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.6,
                              textAlign: mine ? "right" : "left",
                            }}
                          >
                            {new Date(m.created_at).toLocaleString()} {m.read_at ? "• Read" : ""}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* TYPING hint */}
            {peerTyping && (
              <div style={{ fontSize: 12, color: "#6b7280", margin: "0 0 0 6px" }}>
                The other person is typing…
              </div>
            )}

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
                onChange={(e) => {
                  setText(e.target.value);
                  sendTyping(); // TYPING: fire a broadcast ping
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={uploading}
                style={{
                  flex: 1,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                  resize: "none",
                  lineHeight: 1.35,
                  maxHeight: 120,
                  overflowY: "auto",
                }}
              />

              {/* Delete my last message (safe guard by canDeleteLast) */}
              <button
                type="button"
                onClick={deleteMyLastMessage}
                disabled={!canDeleteLast || deleteBusy || uploading}
                title="Delete your last message in this conversation"
                className="btn btn-neutral btn-pill"
                style={{
                  opacity: !canDeleteLast || deleteBusy || uploading ? 0.6 : 1,
                }}
              >
                {deleteBusy ? "Deleting…" : "Delete last"}
              </button>

              <button
                type="submit"
                disabled={!canSend || uploading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: !canSend || uploading ? "#cbd5e1" : "#2563eb",
                  color: "#fff",
                  border: "none",
                  cursor: !canSend || uploading ? "not-allowed" : "pointer",
                  fontWeight: 600,
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





































