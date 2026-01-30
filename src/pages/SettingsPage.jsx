// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

// Client-side VAPID public key (base64url)
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function isStandalonePWA() {
  // iOS Safari uses navigator.standalone, others use display-mode
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
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || "";
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

  // Notifications support
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    );
  }, []);

  // ✅ DEFAULT ON for every device unless user explicitly turned it off on THAT device
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_NOTIF_ENABLED);
      if (raw === null) return true; // default ON
      return raw === "1";
    } catch {
      return true;
    }
  });

  const [notifMsg, setNotifMsg] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [hasSub, setHasSub] = useState(false);

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
    } catch {
      // ignore
    }
  }, [notifEnabled]);

  async function refreshSubscriptionState() {
    if (!supported) {
      setHasSub(false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg?.pushManager) {
        setHasSub(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setHasSub(!!sub);
    } catch {
      setHasSub(false);
    }
  }

  async function registerDeviceSubscription({ allowPrompt } = { allowPrompt: false }) {
    setNotifMsg("");

    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      setHasSub(false);
      return false;
    }

    // iOS note: push works best (and often only) when installed to home screen
    if (isIOS() && !isStandalonePWA()) {
      setNotifMsg("On iPhone: install the app (Share → Add to Home Screen) for best notification behavior.");
      // still continue; some states can still work, but iOS is inconsistent
    }

    if (!VAPID_PUBLIC_KEY) {
      setNotifMsg("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local env, then rebuild.");
      return false;
    }

    // Permission path
    if (Notification.permission !== "granted") {
      if (!allowPrompt) {
        // Don’t prompt automatically (browsers punish this). Just show guidance.
        setNotifMsg("Notifications are ON by default, but you still need to allow permission on this device.");
        return false;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotifMsg("Permission denied. Enable notifications in your browser/iOS settings.");
        setNotifEnabled(false);
        setHasSub(false);
        return false;
      }
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg?.pushManager) {
        setNotifMsg("PushManager unavailable on this device/browser.");
        setHasSub(false);
        return false;
      }

      // Get or create subscription
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }

      // Save subscription server-side
      const token = await getAccessToken();
      if (!token) {
        setNotifMsg("You must be signed in to enable notifications.");
        setHasSub(false);
        return false;
      }

      const res = await fetch("/.netlify/functions/push-subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: sub }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Subscribe failed (${res.status})`);
      }

      setHasSub(true);
      setNotifEnabled(true);
      setNotifMsg("Notifications enabled on this device.");
      return true;
    } catch (e) {
      setHasSub(false);
      setNotifMsg(e?.message || "Failed to enable notifications.");
      return false;
    }
  }

  async function unsubscribeDevice() {
    if (!supported) {
      setHasSub(false);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Try to tell server (optional endpoint)
        try {
          const token = await getAccessToken();
          await fetch("/.netlify/functions/push-unsubscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
        } catch {}

        await sub.unsubscribe().catch(() => {});
      }
    } catch {}
    setHasSub(false);
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
        body: "Test notification ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/" },
      });
      setNotifMsg("Test notification sent.");
    } catch (e) {
      setNotifMsg(e?.message || "Failed to send test notification.");
    }
  }

  async function toggleNotifications(next) {
    setNotifMsg("");
    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      setNotifEnabled(false);
      setHasSub(false);
      return;
    }

    setNotifBusy(true);
    try {
      if (next) {
        // User gesture: we’re allowed to prompt here
        await registerDeviceSubscription({ allowPrompt: true });
      } else {
        // Turning off on this device
        setNotifEnabled(false);
        setNotifMsg("Notifications disabled on this device.");
        await unsubscribeDevice();
      }
    } finally {
      setNotifBusy(false);
    }
  }

  // ✅ On load: if default ON and permission already granted, auto-register silently
  useEffect(() => {
    if (!supported) return;
    (async () => {
      await refreshSubscriptionState();

      if (notifEnabled && Notification.permission === "granted") {
        // No prompt needed. Just ensure it’s registered and saved server-side.
        await registerDeviceSubscription({ allowPrompt: false });
      } else if (notifEnabled && Notification.permission !== "granted") {
        // Default ON, but we can’t auto-prompt.
        // Leave enabled, show a helpful message only if user is on iOS not installed.
        if (isIOS() && !isStandalonePWA()) {
          setNotifMsg("On iPhone: install the app (Share → Add to Home Screen) for best notification behavior.");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <div className="muted" style={{ marginBottom: 10 }}>
              Default is <b>ON</b>. You’ll still need to allow permission on each device.
              {isIOS() ? <> (Best on iPhone when installed to Home Screen.)</> : null}
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

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  onClick={() => registerDeviceSubscription({ allowPrompt: true })}
                  disabled={notifBusy || !notifEnabled}
                  title="Re-register this device"
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Permission: <code>{Notification.permission}</code>
              {" • "}Subscription: <code>{hasSub ? "yes" : "no"}</code>
              {" • "}Installed: <code>{isStandalonePWA() ? "yes" : "no"}</code>
              {" • "}VAPID key: <code>{VAPID_PUBLIC_KEY ? "set" : "missing"}</code>
            </div>

            {notifMsg && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {notifMsg}
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















