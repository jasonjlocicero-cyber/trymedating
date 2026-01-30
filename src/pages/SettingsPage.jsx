// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

// ✅ Provide your VAPID public key (base64 URL-safe) via env var
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_TMD_VAPID_PUBLIC_KEY ||
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "";

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

function urlBase64ToUint8Array(base64String) {
  // VAPID keys are URL-safe base64 (with - and _). Convert to normal base64 first.
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
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
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  // ✅ Default ON for new installs/devices
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(LS_NOTIF_ENABLED);
      if (v === null) return true; // default ON
      return v === "1";
    } catch {
      return true;
    }
  });

  const [notifMsg, setNotifMsg] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [subInfo, setSubInfo] = useState(null); // PushSubscription JSON (if present)

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

  async function getSWReg() {
    // Ensure SW is ready
    const reg = await navigator.serviceWorker.ready;
    return reg;
  }

  async function getExistingSubscription() {
    if (!supported) return null;
    try {
      const reg = await getSWReg();
      const sub = await reg.pushManager.getSubscription();
      return sub || null;
    } catch {
      return null;
    }
  }

  async function saveSubscriptionToBackend(subscription) {
    // ✅ Recommended: Netlify function that stores subscription for this user
    // You’ll add this next if it doesn’t exist yet.
    const payload = {
      subscription,
    };

    const res = await fetch("/.netlify/functions/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `push-subscribe failed (${res.status})`);
    }
  }

  async function deleteSubscriptionFromBackend(endpoint) {
    const res = await fetch("/.netlify/functions/push-unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint }),
    });

    // If the function isn’t there yet, don’t hard-fail turning off locally.
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `push-unsubscribe failed (${res.status})`);
    }
  }

  async function ensurePushSubscribed() {
    if (!supported) throw new Error("Notifications aren’t supported on this device/browser.");
    if (!VAPID_PUBLIC_KEY) {
      throw new Error("Missing VAPID public key. Set VITE_TMD_VAPID_PUBLIC_KEY in Netlify.");
    }

    const perm = Notification.permission;
    if (perm !== "granted") {
      throw new Error("Permission not granted yet.");
    }

    const reg = await getSWReg();

    // Existing?
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    // Subscribe new
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });

    return sub;
  }

  async function syncSubscriptionState() {
    if (!supported) {
      setSubInfo(null);
      return;
    }
    const sub = await getExistingSubscription();
    setSubInfo(sub ? sub.toJSON?.() || sub : null);
  }

  // On load: if toggle is ON and permission already granted, ensure we’re subscribed (no prompts).
  useEffect(() => {
    if (!supported) return;

    (async () => {
      await syncSubscriptionState();

      if (!notifEnabled) return;
      if (Notification.permission !== "granted") return;

      try {
        const sub = await ensurePushSubscribed();
        setSubInfo(sub?.toJSON?.() || sub);

        // Try to store it (if the function exists)
        try {
          await saveSubscriptionToBackend(sub);
        } catch {
          // Don’t spam; just keep local subscription and show guidance only if user opens settings.
        }
      } catch {
        // Ignore silent errors on background sync
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

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
      // Prefer showing via SW (more consistent in PWAs)
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
      return;
    }

    if (next) {
      // iOS guidance: push-style UX is best when installed to Home Screen
      if (isIOS() && !isStandalonePWA()) {
        setNotifMsg(
          "On iPhone: install the app (Share → Add to Home Screen) for reliable notifications."
        );
        // still allow enabling; user can proceed
      }

      setNotifBusy(true);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotifEnabled(false);
          setNotifMsg("Permission denied. Enable notifications in your device/browser settings.");
          return;
        }

        // ✅ Actually create/ensure a PushSubscription (this was missing)
        const sub = await ensurePushSubscribed();
        setSubInfo(sub?.toJSON?.() || sub);

        // ✅ Store subscription for backend push sending
        try {
          await saveSubscriptionToBackend(sub);
          setNotifMsg("Notifications enabled (push subscribed).");
        } catch (e) {
          // Still enabled locally, but backend storage is needed for “closed app” push.
          setNotifMsg(
            "Enabled locally, but backend push storage isn’t set yet. Next step: add Netlify function push-subscribe so notifications work when the app is closed."
          );
        }

        setNotifEnabled(true);
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(e?.message || "Failed to enable notifications.");
      } finally {
        setNotifBusy(false);
      }
    } else {
      // Turning off: unsubscribe from push + stop showing
      setNotifBusy(true);
      try {
        const reg = await getSWReg();
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
          setSubInfo(null);

          // Best-effort backend cleanup
          try {
            await deleteSubscriptionFromBackend(endpoint);
          } catch {
            // ok
          }
        }
        setNotifEnabled(false);
        setNotifMsg("Notifications disabled on this device.");
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(e?.message || "Failed to disable notifications.");
      } finally {
        setNotifBusy(false);
      }
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
              Default is ON. You’ll be prompted for permission the first time you enable it.
              Best results on iPhone when installed to Home Screen.
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

              <button
                className="btn btn-neutral btn-pill"
                type="button"
                onClick={testNotification}
                disabled={!notifEnabled || notifBusy || Notification.permission !== "granted"}
              >
                Test notification
              </button>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Permission: <code>{Notification.permission}</code>
              {isIOS() ? (
                <>
                  {" "}
                  • iPhone tip: <strong>Install to Home Screen</strong> for reliable notifications
                </>
              ) : null}
            </div>

            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              Push subscription:{" "}
              <code>{subInfo?.endpoint ? "active" : "none"}</code>
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














