// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

function isStandalonePWA() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "");
}

// VAPID public key must be URL-safe base64 (no padding)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function SettingsPage() {
  const nav = useNavigate();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  // Theme
  const [theme, setTheme] = useState(() => getTheme()); // "light" | "dark"
  function setThemeAndApply(next) {
    const applied = applyTheme(next);
    setTheme(applied);
  }

  // Env
  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

  // Support
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    );
  }, []);

  const pushSupported = useMemo(() => {
    return supported && "PushManager" in window;
  }, [supported]);

  // Default notifications ON (device still needs permission)
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

  // Push state
  const [subscription, setSubscription] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subMsg, setSubMsg] = useState("");

  // Danger zone – delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

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
    } catch {}
  }, [notifEnabled]);

  // Load current push subscription (if any)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!alive) return;
        setSubscription(sub || null);
      } catch {
        if (!alive) return;
        setSubscription(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pushSupported]);

  async function saveSubscriptionToDB(sub) {
    if (!me?.id || !sub) return;
    const json = sub.toJSON?.() || {};
    const endpoint = sub.endpoint;
    const p256dh = json?.keys?.p256dh || null;
    const auth = json?.keys?.auth || null;

    // Requires unique index on (user_id, endpoint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: me.id,
          endpoint,
          p256dh,
          auth,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" }
      );

    if (error) throw error;
  }

  async function ensurePushSubscribed({ forceResubscribe = false } = {}) {
    setSubMsg("");
    if (!pushSupported) {
      setSubMsg("Push isn’t supported on this device/browser.");
      return null;
    }
    if (!VAPID_PUBLIC_KEY) {
      setSubMsg("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local .env and rebuild.");
      return null;
    }
    if (Notification.permission !== "granted") {
      setSubMsg("Permission is not granted. Enable notifications first.");
      return null;
    }

    setSubBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();

      if (forceResubscribe && sub) {
        try {
          await sub.unsubscribe();
        } catch {}
        sub = null;
      }

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      setSubscription(sub);

      // Save to DB so the server can send push while app is closed
      await saveSubscriptionToDB(sub);

      setSubMsg(forceResubscribe ? "Device re-registered for push ✅" : "Push subscription is active ✅");
      return sub;
    } catch (e) {
      setSubMsg(e?.message || "Failed to create/save push subscription.");
      return null;
    } finally {
      setSubBusy(false);
    }
  }

  async function testNotificationLocal() {
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
        body: "Local test notification ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/" },
      });
      setNotifMsg("Local test notification sent.");
    } catch (e) {
      setNotifMsg(e?.message || "Failed to send test notification.");
    }
  }

  async function toggleNotifications(next) {
    setNotifMsg("");
    setSubMsg("");

    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      setNotifEnabled(false);
      return;
    }

    if (next) {
      if (isIOS() && !isStandalonePWA()) {
        setNotifMsg(
          "On iPhone: install the app (Share → Add to Home Screen) for best push behavior."
        );
      }

      setNotifBusy(true);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotifEnabled(false);
          setNotifMsg("Permission denied. Enable notifications in device/browser settings.");
          return;
        }

        setNotifEnabled(true);
        setNotifMsg("Notifications enabled.");

        // If user enables notifications, immediately ensure push subscription exists
        await ensurePushSubscribed({ forceResubscribe: false });
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(e?.message || "Failed to enable notifications.");
      } finally {
        setNotifBusy(false);
      }
    } else {
      setNotifEnabled(false);
      setNotifMsg("Notifications disabled on this device.");
      // (We do not auto-unsubscribe here; user can re-register later.)
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
      setDeleteMsg(e.message || "Delete failed");
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
  const permission = supported ? Notification.permission : "unsupported";
  const hasSub = !!subscription;
  const endpointShort = subscription?.endpoint
    ? String(subscription.endpoint).slice(0, 55) + "…"
    : "";

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 860 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Settings</h1>

      {/* Appearance */}
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
            <div className="muted" style={{ marginBottom: 10 }}>
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
                  onClick={testNotificationLocal}
                  disabled={!notifEnabled || notifBusy}
                >
                  Test notification
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={() => ensurePushSubscribed({ forceResubscribe: true })}
                  disabled={!notifEnabled || notifBusy || subBusy}
                  title="Unsubscribe + resubscribe + save subscription"
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              Permission: <code>{permission}</code> • Subscription:{" "}
              <code>{hasSub ? "yes" : "no"}</code> • Installed:{" "}
              <code>{installed ? "yes" : "no"}</code> • VAPID key:{" "}
              <code>{VAPID_PUBLIC_KEY ? "set" : "missing"}</code>
              {isIOS() ? <> • iPhone tip: must be installed for background push</> : null}
            </div>

            {endpointShort ? (
              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                Endpoint: <code>{endpointShort}</code>
              </div>
            ) : null}

            {notifMsg && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {notifMsg}
              </div>
            )}

            {subMsg && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {subMsg}
              </div>
            )}
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
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
          >
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
            {deleteMsg && (
              <div className="helper-error" style={{ marginTop: 4 }}>
                {deleteMsg}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

















