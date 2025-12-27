// src/routes/Connect.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useChat } from "../chat/ChatContext";

/* ---------- constants / helpers ---------- */
const CONN_TABLE = "connections";
const C = {
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  decidedAt: "updated_at", // we sort by updated first, then created
};

/* ---------- component ---------- */
export default function Connect({ me }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { openChat } = useChat();

  const authed = !!me?.id;

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("unknown"); // 'unknown' | 'invalid' | 'self' | 'blocked' | 'none' | 'pending' | 'accepted' | 'rejected' | 'disconnected'
  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");
  const [recipientId, setRecipientId] = useState("");

  // cache a friendly label for the bubble title
  const recipientLabelRef = useRef("");
  const openedOnceRef = useRef(false);

  // Resolve recipient: prefer short-lived token, else fall back to ?to= / ?u=
  const token = sp.get("token");
  const legacyId = sp.get("to") || sp.get("u") || "";

  const hasRecipient = useMemo(() => !!recipientId, [recipientId]);

  /* ---------- bubble-only opener ---------- */
  function openChatBubble(partnerId, partnerName = "") {
    if (!partnerId) return;

    if (typeof openChat === "function") {
      openChat(partnerId, partnerName || "");
      return;
    }

    if (typeof window.openChat === "function") {
      window.openChat(partnerId, partnerName || "");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("open-chat", { detail: { partnerId, partnerName: partnerName || "" } })
    );
  }

  /* ---------- small helpers ---------- */

  // Check "I blocked them" (RLS may hide the reverse direction).
  async function iBlockedThem(a, b) {
    if (!a || !b) return false;
    const { data, error } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker", a)
      .eq("blocked", b)
      .maybeSingle();
    if (error && error.code !== "PGRST116") console.warn("[blocks check]", error.message);
    return !!data?.id;
  }

  // Find the latest connection row (either direction)
  async function getLatestConnection(a, b) {
    const pairOr =
      `and(${C.requester}.eq.${a},${C.addressee}.eq.${b}),` +
      `and(${C.requester}.eq.${b},${C.addressee}.eq.${a})`;
    const { data, error } = await supabase
      .from(CONN_TABLE)
      .select("*")
      .or(pairOr)
      .order(C.decidedAt, { ascending: false })
      .order(C.createdAt, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  }

  // Create a fresh pending request (me -> recipient)
  async function createPending(a, b) {
    const payload = { [C.requester]: a, [C.addressee]: b, [C.status]: "pending" };
    const { error } = await supabase.from(CONN_TABLE).insert(payload);
    if (error && error.code !== "23505") throw error; // ignore dup-insert race
    return true;
  }

  // Return a friendly name/handle for chat bubble title
  async function fetchRecipientLabel(uid) {
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, display_name")
        .eq("user_id", uid)
        .maybeSingle();
      return prof?.display_name || (prof?.handle ? `@${prof.handle}` : "") || "";
    } catch {
      return "";
    }
  }

  /* ---------- resolve recipient (token redeem or legacy id) ---------- */
  useEffect(() => {
    let cancelled = false;

    async function resolveRecipient() {
      setErrorText("");
      setMessage("");

      // Redeem short-lived token first
      if (token) {
        const { data, error } = await supabase.rpc("tmd_redeem_qr_token", { p_token: token });
        if (cancelled) return;

        if (error || !data) {
          console.warn("[redeem token]", error);
          setStatus("invalid");
          setErrorText("This invite has expired or is invalid.");
          setRecipientId("");
          return;
        }

        setRecipientId(String(data));
        return;
      }

      // Legacy: direct user id via ?to= or ?u=
      if (legacyId) {
        setRecipientId(legacyId);
        return;
      }

      setStatus("invalid");
      setErrorText("This link is missing a valid invite token or user id.");
    }

    resolveRecipient();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, legacyId]);

  /* ---------- once we know the recipient, decide and act ---------- */
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!hasRecipient) return;

      // cache label (best-effort)
      recipientLabelRef.current = await fetchRecipientLabel(recipientId);

      if (!authed) {
        setStatus("none"); // UI will prompt to sign in
        return;
      }

      if (recipientId === me.id) {
        setStatus("self");
        return;
      }

      // my-side block check (reverse direction is enforced by RLS anyway)
      if (await iBlockedThem(me.id, recipientId)) {
        if (cancelled) return;
        setStatus("blocked");
        setMessage("You have blocked this user. Unblock to send requests.");
        return;
      }

      try {
        const existing = await getLatestConnection(me.id, recipientId);
        if (cancelled) return;

        // Always try opening the bubble once we know who this is
        if (!openedOnceRef.current) {
          openedOnceRef.current = true;
          openChatBubble(recipientId, recipientLabelRef.current);
        }

        if (!existing) {
          // Create pending request me -> recipient
          setBusy(true);
          try {
            await createPending(me.id, recipientId);
            setStatus("pending");
            setMessage("Request sent — opening chat…");
            openChatBubble(recipientId, recipientLabelRef.current);
          } finally {
            setBusy(false);
          }
          return;
        }

        // We have some relationship already
        setStatus(existing[C.status] || "none");

        if (existing[C.status] === "pending") {
          setMessage("Request is pending — check the chat to accept/reject.");
        } else if (existing[C.status] === "accepted") {
          setMessage("You are connected — chat is open.");
        } else if (existing[C.status] === "rejected") {
          setMessage("This request was declined.");
        } else if (existing[C.status] === "disconnected") {
          setMessage("This connection was disconnected. You can send a new request.");
        }
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setErrorText(e.message || "Failed to process invite.");
        setStatus("none");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRecipient, authed, me?.id, recipientId]);

  /* ---------- explicit action (rarely needed now) ---------- */
  async function requestConnection() {
    if (!authed) {
      nav("/auth");
      return;
    }
    if (!recipientId || recipientId === me.id) {
      setStatus(recipientId === me.id ? "self" : "invalid");
      return;
    }
    if (await iBlockedThem(me.id, recipientId)) {
      setStatus("blocked");
      setMessage("You have blocked this user. Unblock to send requests.");
      return;
    }

    setBusy(true);
    try {
      await createPending(me.id, recipientId);
      setStatus("pending");
      setMessage("Request sent — opening chat…");
      openChatBubble(recipientId, recipientLabelRef.current);
    } catch (e) {
      console.error(e);
      setStatus("blocked");
      setMessage("Unable to request. One side may have blocked the other.");
    } finally {
      setBusy(false);
    }
  }

  function goHomeWithChatOpen() {
    if (recipientId) openChatBubble(recipientId, recipientLabelRef.current);
    nav("/");
  }

  /* ---------- UI ---------- */
  return (
    <div className="container" style={{ padding: 24, maxWidth: 680 }}>
      <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Connect</h2>

      {status === "invalid" && (
        <div className="muted" style={{ marginTop: 8 }}>
          This invite is invalid or expired.
        </div>
      )}
      {status === "self" && (
        <div className="muted" style={{ marginTop: 8 }}>
          You can’t connect with yourself.
        </div>
      )}
      {status === "blocked" && (
        <div className="muted" style={{ marginTop: 8 }}>
          Connection disabled: one side has a block in place.
        </div>
      )}
      {errorText && (
        <div className="muted" style={{ color: "#b91c1c", marginTop: 8 }}>
          {errorText}
        </div>
      )}
      {message && !errorText && (
        <div className="muted" style={{ marginTop: 8 }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status === "accepted" ? (
          <>
            <span className="muted">You’re already connected! 🎉</span>
            <button className="btn btn-primary btn-pill" onClick={goHomeWithChatOpen}>
              Open chat
            </button>
            <Link className="btn btn-neutral btn-pill" to="/">
              Back home
            </Link>
          </>
        ) : status === "pending" ? (
          <>
            <span className="muted">Request sent — waiting for acceptance.</span>
            <button className="btn btn-primary btn-pill" onClick={goHomeWithChatOpen}>
              Open chat
            </button>
            <Link className="btn btn-neutral btn-pill" to="/">
              Done
            </Link>
          </>
        ) : status === "rejected" ? (
          <>
            <span className="muted">This request was declined.</span>
            <button className="btn btn-primary btn-pill" onClick={requestConnection} disabled={busy}>
              {busy ? "Sending…" : "Send again"}
            </button>
            <Link className="btn btn-neutral btn-pill" to="/">
              Back
            </Link>
          </>
        ) : status === "disconnected" ? (
          <>
            <span className="muted">This connection was disconnected.</span>
            <button className="btn btn-primary btn-pill" onClick={requestConnection} disabled={busy}>
              {busy ? "Sending…" : "Request again"}
            </button>
            <Link className="btn btn-neutral btn-pill" to="/">
              Back
            </Link>
          </>
        ) : status === "none" || status === "unknown" ? (
          <>
            {!authed && (
              <>
                <span className="muted">Please sign in to send a request.</span>
                <Link className="btn btn-primary btn-pill" to="/auth">
                  Sign in
                </Link>
              </>
            )}
            {authed && (
              <>
                <button
                  className="btn btn-primary btn-pill"
                  onClick={requestConnection}
                  disabled={busy || !recipientId}
                >
                  {busy ? "Sending…" : "Request to connect"}
                </button>
                <Link className="btn btn-neutral btn-pill" to="/">
                  Cancel
                </Link>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}







