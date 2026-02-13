// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function isStandalonePWA() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "");
}

// VAPID key helper (base64url -> Uint8Array)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Avoid dumping HTML error pages into UI
function safeErrorText(e) {
  const msg = String(e?.message || e || "").trim();
  if (!msg) return "Unknown error";
  const lower = msg.toLowerCase();
  if (lower.includes("<!doctype html") || lower.includes("<html")) {
    return "Server returned an HTML error (likely a 404/500). Check your endpoint / Netlify function path.";
  }
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

export default function SettingsPage() {
  const nav = useNavigate();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Theme
  const [theme, setTheme] = useState(() => getTheme()); // "light" | "dark"
  function setThemeAndApply(next) {
    const applied = applyTheme(next);
    setTheme(applied);
  }

  // Notifications support (true Web Push requires PushManager)
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  // Default ON for everyone (device-local)
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(LS_NOTIF_ENABLED);
      if (v === null) return true; // ✅ default ON
      return v === "1";
    } catch {
      return true;
    }
  });

  const [notifMsg, setNotifMsg] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);

  // Push subscription state
  const [hasSub, setHasSub] = useState(false);
  const [endpointPreview, setEndpointPreview] = useState("");

  // Danger zone – delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  // Auth load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive) return;
        setMe(user || null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Keep localStorage in sync
  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTIF_ENABLED, notifEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [notifEnabled]);

  const getReg = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  }, []);

  const refreshPushState = useCallback(async () => {
    if (!supported) {
      setHasSub(false);
      setEndpointPreview("");
      return;
    }
    try {
      const reg = await getReg();
      const sub = await reg.pushManager.getSubscription();
      const ok = !!sub;
      setHasSub(ok);
      if (sub?.endpoint) {
        const s = sub.endpoint;
        setEndpointPreview(s.length > 64 ? s.slice(0, 64) + "…" : s);
      } else {
        setEndpointPreview("");
      }
    } catch {
      setHasSub(false);
      setEndpointPreview("");
    }
  }, [supported, getReg]);

  // Save subscription to DB (Fix #2: conflict on endpoint)
  const saveSubscription = useCallback(
    async (sub) => {
      if (!me?.id) throw new Error("Not signed in");
      if (!sub?.endpoint) throw new Error("Missing subscription endpoint");

      const json = typeof sub.toJSON === "function" ? sub.toJSON() : null;
      const keys = json?.keys || {};
      const endpoint = sub.endpoint;
      const p256dh = keys.p256dh;
      const auth = keys.auth;

      if (!p256dh || !auth) throw new Error("Missing subscription keys");

      const payload = {
        user_id: me.id,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      };

      // ✅ This requires a UNIQUE constraint/index on endpoint in Supabase:
      // create unique index ... on push_subscriptions(endpoint);
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(payload, { onConflict: "endpoint" });

      if (error) throw error;
      return endpoint;
    },
    [me?.id]
  );

  const ensureSubscribed = useCallback(
    async ({ force = false } = {}) => {
      setNotifMsg("");

      if (!supported) {
        setNotifMsg("Notifications aren’t supported on this browser/device.");
        setHasSub(false);
        setEndpointPreview("");
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        setNotifMsg("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local env, then rebuild.");
        return;
      }

      if (!me?.id) {
        setNotifMsg("Sign in to register this device for notifications.");
        return;
      }

      if (Notification.permission !== "granted") {
        setNotifMsg("Permission not granted. Turn notifications on first.");
        return;
      }

      setNotifBusy(true);
      try {
        const reg = await getReg();
        let sub = await reg.pushManager.getSubscription();

        if (force && sub) {
          try {
            await sub.unsubscribe();
          } catch {
            // ignore
          }
          sub = null;
        }

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        const endpoint = await saveSubscription(sub);

        setHasSub(true);
        setEndpointPreview(endpoint.length > 64 ? endpoint.slice(0, 64) + "…" : endpoint);
        setNotifMsg(force ? "Device re-registered for push ✅" : "Device registered for push ✅");
      } catch (e) {
        setHasSub(false);
        setEndpointPreview("");
        setNotifMsg(safeErrorText(e));
      } finally {
        setNotifBusy(false);
      }
    },
    [supported, me?.id, getReg, saveSubscription]
  );

  const disableAndUnsubscribe = useCallback(async () => {
    setNotifMsg("");
    if (!supported) return;

    setNotifBusy(true);
    try {
      const reg = await getReg();
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;

      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignore
        }
      }

      if (endpoint) {
        // Best-effort cleanup in DB
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }

      setHasSub(false);
      setEndpointPreview("");
      setNotifMsg("Notifications disabled on this device.");
    } catch (e) {
      setNotifMsg(safeErrorText(e));
    } finally {
      setNotifBusy(false);
    }
  }, [supported, getReg]);

  // Auto-refresh state and (if already granted) auto-register when default ON
  useEffect(() => {
    refreshPushState();

    // If default ON and permission already granted, try to ensure we have a subscription saved
    if (notifEnabled && supported && Notification.permission === "granted") {
      // Don’t force a permission prompt here (no user gesture)
      ensureSubscribed({ force: false }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, supported, me?.id]);

  async function testNotification() {
    setNotifMsg("");
    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }
    if (Notification.permission !== "granted") {
      setNotifMsg("Permission not granted. Turn notifications on first.");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("TryMeDating", {
        body: "Test notification ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/" },
      });
      setNotifMsg("Test notification sent.");
    } catch (e) {
      setNotifMsg(safeErrorText(e));
    }
  }

  async function toggleNotifications(next) {
    setNotifMsg("");

    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      setNotifEnabled(false);
      return;
    }

    if (next) {
      if (isIOS() && !isStandalonePWA()) {
        setNotifMsg("On iPhone: install the app (Share → Add to Home Screen) for best behavior.");
      }

      setNotifBusy(true);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotifEnabled(false);
          setNotifMsg("Permission denied. Enable notifications in your browser/device settings.");
          return;
        }
        setNotifEnabled(true);

        // ✅ Register device subscription + save to DB
        await ensureSubscribed({ force: false });
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(safeErrorText(e));
      } finally {
        setNotifBusy(false);
      }
    } else {
      setNotifEnabled(false);
      await disableAndUnsubscribe();
    }
  }

  async function handleDelete() {
    setDeleteMsg("");
    setDeleting(true);
    try {
      const res = await fetch("/.netlify/functions/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Delete failed (${res.status})`);
      }

      await supabase.auth.signOut();
      nav("/", { replace: true });
    } catch (e) {
      setDeleteMsg(safeErrorText(e));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "28px 0" }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Settings</h1>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const installed = isStandalonePWA();
  const vapidSet = !!VAPID_PUBLIC_KEY;

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 860 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Settings</h1>

      {/* ✅ Appearance */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-light)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Appearance</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Choose a theme for this device.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${theme === "light" ? "btn-primary" : "btn-neutral"} btn-pill`}
            onClick={() => setThemeAndApply("light")}
            aria-pressed={theme === "light"}
          >
            Light
          </button>

          <button
            type="button"
            className={`btn ${theme === "dark" ? "btn-primary" : "btn-neutral"} btn-pill`}
            onClick={() => setThemeAndApply("dark")}
            aria-pressed={theme === "dark"}
          >
            Dark
          </button>
        </div>

        <div className="helper-muted" style={{ marginTop: 10 }}>
          Saved as <code>{theme}</code>.
        </div>
      </section>

      {/* Notifications */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-light)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Notifications</div>

        {!supported ? (
          <div className="muted">This device/browser doesn’t support notifications.</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>
              Default is <b>ON</b>. You’ll still need to allow permission on each device.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontWeight: 800,
                }}
              >
                <input
                  type="checkbox"
                  checked={notifEnabled}
                  disabled={notifBusy}
                  onChange={(e) => toggleNotifications(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                Enable notifications
              </label>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={testNotification}
                  disabled={!notifEnabled || notifBusy || Notification.permission !== "granted"}
                >
                  Test notification
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={() => ensureSubscribed({ force: true })}
                  disabled={
                    notifBusy ||
                    !notifEnabled ||
                    Notification.permission !== "granted" ||
                    !vapidSet
                  }
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Permission: <code>{Notification.permission}</code> • Subscription:{" "}
              <code>{hasSub ? "yes" : "no"}</code> • Installed: <code>{installed ? "yes" : "no"}</code> •
              VAPID key: <code>{vapidSet ? "set" : "missing"}</code>
              {isIOS() ? <> • iPhone tip: install to Home Screen for best results</> : null}
            </div>

            {hasSub && endpointPreview ? (
              <div className="helper-muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                Endpoint:<br />
                <code style={{ wordBreak: "break-all" }}>{endpointPreview}</code>
              </div>
            ) : null}

            {!vapidSet ? (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                Missing <code>VITE_VAPID_PUBLIC_KEY</code>. Add it to Netlify + local <code>.env</code>, then rebuild.
              </div>
            ) : null}

            {notifMsg ? (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {notifMsg}
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Account overview */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-light)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Account</div>
        <div className="muted">Signed in as</div>
        <div style={{ marginTop: 4 }}>
          <code>{me?.email || me?.id}</code>
        </div>
      </section>

      {/* Danger zone */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-light)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#b91c1c" }}>
          Danger zone
        </div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Permanently delete your account and all associated data. This cannot be undone.
        </div>

        {!showDeleteConfirm ? (
          <button className="btn btn-accent" type="button" onClick={() => setShowDeleteConfirm(true)}>
            Delete my account
          </button>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 8,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              padding: 12,
              maxWidth: 560,
              background: "var(--bg-light)",
            }}
          >
            <label className="form-label" style={{ fontWeight: 700 }}>
              Type <code>DELETE</code> to confirm
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-accent"
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText.trim() !== "DELETE"}
              >
                {deleting ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                className="btn btn-neutral"
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmText("");
                  setDeleteMsg("");
                }}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
            {deleteMsg ? (
              <div className="helper-error" style={{ marginTop: 4 }}>
                {deleteMsg}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}



















