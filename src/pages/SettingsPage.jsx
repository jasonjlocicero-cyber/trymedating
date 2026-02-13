// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
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

// VAPID helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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

  // Notifications support
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  // ✅ Default ON (first time on a device)
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(LS_NOTIF_ENABLED);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  const [notifBusy, setNotifBusy] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");

  const [permission, setPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unknown"
  );
  const [hasSub, setHasSub] = useState(false);
  const [endpointPreview, setEndpointPreview] = useState("");
  const vapidSet = !!VAPID_PUBLIC_KEY;

  // Danger zone – delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
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

  // Persist localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTIF_ENABLED, notifEnabled ? "1" : "0");
    } catch {}
  }, [notifEnabled]);

  async function refreshSubStatus() {
    if (!supported) return;
    try {
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setHasSub(!!sub);
      if (sub?.endpoint) {
        setEndpointPreview(sub.endpoint.slice(0, 60) + (sub.endpoint.length > 60 ? "…" : ""));
      } else {
        setEndpointPreview("");
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refreshSubStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // If default is ON, we still can’t request permission silently.
  // But we *can* keep UI as ON and prompt only on user action (toggle / re-register).
  useEffect(() => {
    refreshSubStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled]);

  async function saveSubscriptionToDB(userId, sub) {
    const json = sub.toJSON?.() || {};
    const endpoint = json.endpoint || sub.endpoint;
    const p256dh = json.keys?.p256dh || "";
    const auth = json.keys?.auth || "";

    const row = {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
    };

    // ✅ This MUST match a UNIQUE constraint:
    // UNIQUE(user_id, endpoint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "user_id,endpoint" });

    if (error) throw error;
  }

  async function registerDevice({ force = false } = {}) {
    setNotifMsg("");

    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }
    if (!vapidSet) {
      setNotifMsg("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local env, then rebuild.");
      return;
    }
    if (!me?.id) {
      setNotifMsg("Please sign in first.");
      return;
    }

    setNotifBusy(true);
    try {
      // Permission (must be triggered by a user gesture)
      let perm = Notification.permission;
      if (perm !== "granted") {
        perm = await Notification.requestPermission();
      }
      setPermission(perm);

      if (perm !== "granted") {
        setNotifMsg("Permission not granted. Enable notifications in your device/browser settings.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      // Force means: unsubscribe old one, then re-subscribe
      if (force) {
        const existing = await reg.pushManager.getSubscription();
        try {
          await existing?.unsubscribe?.();
        } catch {}
      }

      // Subscribe (or reuse)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await saveSubscriptionToDB(me.id, sub);

      setNotifEnabled(true);
      setNotifMsg("Device registered for push notifications ✅");
      await refreshSubStatus();
    } catch (e) {
      const msg = e?.message || String(e);

      // 🔥 This is the exact error you screenshot’d
      if (/no unique or exclusion constraint/i.test(msg) || /ON CONFLICT/i.test(msg)) {
        setNotifMsg(
          "DB is missing the UNIQUE constraint for UPSERT.\n" +
          "Fix in Supabase SQL editor:\n" +
          "ALTER TABLE public.push_subscriptions\n" +
          "ADD CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint);"
        );
      } else {
        setNotifMsg(msg);
      }
    } finally {
      setNotifBusy(false);
    }
  }

  async function toggleNotifications(next) {
    setNotifMsg("");

    if (!supported) {
      setNotifEnabled(false);
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }

    // iOS guidance
    if (next && isIOS() && !isStandalonePWA()) {
      setNotifMsg("On iPhone: install the app (Share → Add to Home Screen) for best notification behavior.");
      // still proceed; user may be in installed context on iOS later
    }

    if (next) {
      await registerDevice({ force: false });
    } else {
      // App-level OFF (we’ll keep it simple: don’t auto-unsubscribe; just stop using push)
      setNotifEnabled(false);
      setNotifMsg("Notifications disabled on this device (app setting).");
    }
  }

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
        body: "Test notification ✅ (this is local, not server push)",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/settings" },
      });
      setNotifMsg("Test notification sent (local).");
    } catch (e) {
      setNotifMsg(e?.message || "Failed to send test notification.");
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
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
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
                  disabled={notifBusy || Notification.permission !== "granted"}
                >
                  Test notification
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={() => registerDevice({ force: true })}
                  disabled={notifBusy}
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              Permission: <code>{permission}</code> • Subscription:{" "}
              <code>{hasSub ? "yes" : "no"}</code> • Installed: <code>{installed ? "yes" : "no"}</code>{" "}
              • VAPID key: <code>{vapidSet ? "set" : "missing"}</code>
              {endpointPreview ? (
                <>
                  <br />
                  Endpoint: <code>{endpointPreview}</code>
                </>
              ) : null}
              {isIOS() ? (
                <>
                  <br />
                  iPhone tip: push only works best when installed to Home Screen.
                </>
              ) : null}
            </div>

            {notifMsg && (
              <div className="helper-muted" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                {notifMsg}
              </div>
            )}
          </>
        )}
      </section>

      {/* Account */}
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
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#b91c1c" }}>Danger zone</div>
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
















