// src/components/Header.jsx
import React, { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

// Default ON if missing
function ensureNotifDefaultOn() {
  try {
    const v = localStorage.getItem(LS_NOTIF_ENABLED);
    if (v === null) localStorage.setItem(LS_NOTIF_ENABLED, "1");
  } catch {
    // ignore
  }
}

function notifPrefOn() {
  try {
    const v = localStorage.getItem(LS_NOTIF_ENABLED);
    // missing => ON
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function formatNotifBody(raw) {
  if (!raw) return "New message";

  // attachments in your canonical encoding: [[file:<json>]]
  if (typeof raw === "string" && raw.startsWith("[[file:")) {
    try {
      const inner = raw.slice("[[file:".length, -2); // strip "[[file:" and "]]"
      const meta = JSON.parse(decodeURIComponent(inner));
      return `Sent an attachment${meta?.name ? `: ${meta.name}` : ""}`;
    } catch {
      return "Sent an attachment";
    }
  }

  // deleted tombstone: [[deleted:<json>]]
  if (typeof raw === "string" && raw.startsWith("[[deleted:")) {
    return "Deleted an attachment";
  }

  // Keep it short so it looks good in system notifications
  const s = String(raw).trim();
  if (s.length <= 120) return s;
  return s.slice(0, 117) + "…";
}

async function showSystemNotification({ title, body, tag, url }) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const payload = {
    body: body || "New message",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: tag || "tmd-msg",
    renotify: true,
    data: { url: url || "/messages" },
  };

  // Prefer SW notifications (more consistent in PWA)
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title || "TryMeDating", payload);
        return;
      }
    }
  } catch {
    // fall through to Notification constructor
  }

  // Fallback (works in many browsers, less consistent in PWAs)
  try {
    // Some browsers ignore "data" here — SW click handler is ideal long-term.
    // eslint-disable-next-line no-new
    new Notification(title || "TryMeDating", payload);
  } catch {
    // ignore
  }
}

export default function Header({ me, onSignOut }) {
  const lastNotifiedIdRef = useRef(null);

  // ✅ Make notifications default ON for every user/device (no Settings visit required)
  useEffect(() => {
    ensureNotifDefaultOn();
  }, []);

  // ✅ Global-ish message listener (Header is on basically every page)
  useEffect(() => {
    const uid = me?.id ? String(me.id) : "";
    if (!uid) return;

    // Don’t even subscribe if pref is OFF (saves realtime noise)
    // Still okay if user flips it later; they can refresh or revisit.
    if (!notifPrefOn()) return;

    const supported =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator;

    if (!supported) return;

    const ch = supabase
      .channel(`tmd-notifs:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient=eq.${uid}`,
        },
        async (payload) => {
          try {
            const row = payload?.new;
            if (!row) return;

            // Avoid duplicates
            if (row.id && lastNotifiedIdRef.current === row.id) return;
            lastNotifiedIdRef.current = row.id || null;

            // Ignore self-sent (paranoia)
            const sender = String(row.sender || row.sender_id || "");
            if (sender && sender === uid) return;

            // Respect preference at runtime
            if (!notifPrefOn()) return;

            // If permission isn’t granted, nothing we can do without a user gesture
            if (Notification.permission !== "granted") return;

            // Optional: suppress if they’re already on the chat page and active
            const path = window.location?.pathname || "";
            const onChatRoute = path.startsWith("/messages") || path.startsWith("/chat");
            const active = document.visibilityState === "visible";

            if (onChatRoute && active) return;

            const body = formatNotifBody(row.body);
            const title = "TryMeDating";
            const tag = `tmd-msg-${row.connection_id || row.id || "x"}`;
            const url = "/messages"; // safe default

            await showSystemNotification({ title, body, tag, url });
          } catch {
            // ignore
          }
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [me?.id]);

  return (
    <header
      className="site-header"
      style={{
        background: "var(--bg-light)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 4px rgba(0,0,0,.04)",
        // ✅ keeps header content below iPhone notch/status bar
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          // ✅ a touch more vertical padding so buttons aren’t cramped
          padding: "12px 0",
        }}
      >
        {/* Brand (icon + wordmark) */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-0.2px",
            lineHeight: 1,
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
          }}
        >
          {/* Heart + wristband logo (inline SVG) */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 64 64"
            aria-hidden="true"
            focusable="false"
            style={{ display: "block", flex: "0 0 auto" }}
          >
            <path
              d="M32 55
                 C29 52 21 46 16 42
                 C9 36 6 31 6 25
                 C6 19 11 14 17 14
                 C21 14 25 16 28 20
                 C31 16 35 14 39 14
                 C45 14 50 19 50 25
                 C50 33 44 38 37 43
                 C35 45 33.5 46.1 32 47.2
                 Z"
              fill="none"
              stroke="var(--brand-coral)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <g transform="rotate(-18 40 42)">
              <ellipse
                cx="40"
                cy="42"
                rx="18"
                ry="9"
                fill="none"
                stroke="var(--brand-teal)"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <ellipse cx="40" cy="42" rx="13" ry="6.5" fill="var(--bg-light)" />
            </g>
            <path
              d="M21 39 C23 40 25 42 27 44"
              fill="none"
              stroke="var(--bg-light)"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>

          <span style={{ whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </span>
        </Link>

        {/* Nav */}
        <nav
          aria-label="Main"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <NavLink
            to="/"
            end
            className="btn btn-neutral btn-pill"
            style={{
              // ✅ force true centering for the label on all devices
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,

              // ✅ ALWAYS teal (not just when active)
              background: "var(--brand-teal)",
              color: "#fff",
              borderColor: "var(--brand-teal-700)",

              // ✅ slightly larger tap target without pushing into the notch
              minHeight: 44,
              padding: "10px 14px",
            }}
          >
            Home
          </NavLink>

          {me ? (
            <button
              type="button"
              onClick={onSignOut}
              className="btn btn-accent btn-pill"
              title="Sign out"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                minHeight: 44,
                padding: "10px 14px",
              }}
            >
              Sign out
            </button>
          ) : (
            <NavLink
              to="/auth"
              className="btn btn-primary btn-pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                minHeight: 44,
                padding: "10px 14px",
              }}
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}































