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

// Base64 URL -> Uint8Array (required by PushManager.subscribe)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
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

  // ---- Push / Notification config ----
  const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
  const hasVapid = !!VAPID_PUBLIC;

  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      window.isSecureContext &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  // ✅ Default ON for first-time devices
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

  // status
  const [installed, setInstalled] = useState(() => (typeof window !== "undefined" ? isStandalonePWA() : false));
  const [subscribed, setSubscribed] = useState(false);
  const [subEndpoint, setSubEndpoint] = useState("");

  // Danger zone – delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  useEffect(() => {
    setInstalled(isStandalonePWA());
  }, []);

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

  async function refreshPushStatus() {
    if (!supported) {
      setSubscribed(false);
      setSubEndpoint("");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      setSubEndpoint(sub?.endpoint || "");
    } catch {
      setSubscribed(false);
      setSubEndpoint("");
    }
  }

  // Upsert subscription row for this user/device
  async function upsertSubscriptionForUser(userId, sub) {
    if (!userId || !sub) return;
    const json = sub.toJSON(); // IMPORTANT: includes base64url keys
    const endpoint = json?.endpoint;
    const p256dh = json?.keys?.p256dh;
    const auth = json?.keys?.auth;

    if (!endpoint || !p256dh || !auth) throw new Error("Subscription keys missing.");

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent || "",
        updated_at: new Date().toISOString(),
      },
      // Common patterns:
      // - if you have UNIQUE(endpoint): use onConflict: "endpoint"
      // - if you have UNIQUE(user_id,endpoint): use onConflict: "user_id,endpoint"
      { onConflict: "endpoint" }
    );

    if (error) throw error;
  }

  async function removeThisDeviceSubscription(userId, sub) {
    if (!userId) return;
    const endpoint = sub?.endpoint;
    if (!endpoint) return;

    // remove only this device
    await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  }

  // Ensure device has a valid Push subscription (optionally force-new)
  async function ensurePushSubscription({ forceNew = false } = {}) {
    if (!supported) throw new Error("Notifications aren’t supported on this browser/device.");
    if (!hasVapid) throw new Error("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local env, then rebuild.");
    if (!me?.id) throw new Error("You must be signed in.");

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();

    if (forceNew && sub) {
      try {
        await removeThisDeviceSubscription(me.id, sub);
      } catch {}
      try {
        await sub.unsubscribe();
      } catch {}
      sub = null;
    }

    if (!sub) {
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    await upsertSubscriptionForUser(me.id, sub);
    await refreshPushStatus();
    return sub;
  }

  async function testLocalNotification() {
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
        body: "Local test notification ✅ (this does NOT test server push)",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-local-test",
        data: { url: "/connections" },
      });
      setNotifMsg("Local test notification sent.");
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
      if (isIOS() && !isStandalonePWA()) {
        setNotifMsg("On iPhone: install the app (Share → Add to Home Screen). iOS push works best when installed.");
      }

      setNotifBusy(true);
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotifEnabled(false);
          setNotifMsg("Permission denied. Enable notifications in your browser/device settings.");
          await refreshPushStatus();
          return;
        }

        setNotifEnabled(true);

        // If permission granted, actually subscribe + save to Supabase
        await ensurePushSubscription({ forceNew: false });

        setNotifMsg("Notifications enabled + device registered.");
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(e?.message || "Failed to enable notifications.");
      } finally {
        setNotifBusy(false);
      }
    } else {
      // Turn off only on THIS device
      setNotifBusy(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          try {
            await removeThisDeviceSubscription(me?.id, sub);
          } catch {}
          try {
            await sub.unsubscribe();
          } catch {}
        }
        setNotifEnabled(false);
        await refreshPushStatus();
        setNotifMsg("Notifications disabled on this device.");
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(e?.message || "Failed to disable notifications.");
      } finally {
        setNotifBusy(false);
      }
    }
  }

  async function reregisterDevice() {
    setNotifMsg("");
    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }
    if (!notifEnabled) {
      setNotifMsg("Turn notifications on first.");
      return;
    }
    if (Notification.permission !== "granted") {
      setNotifMsg("Permission not granted. Turn notifications on first.");
      return;
    }

    setNotifBusy(true);
    try {
      await ensurePushSubscription({ forceNew: true });
      setNotifMsg("Device re-registered (fresh subscription saved).");
    } catch (e) {
      setNotifMsg(e?.message || "Failed to re-register device.");
    } finally {
      setNotifBusy(false);
    }
  }

  // Auto-register if:
  // - default ON (or user turned ON)
  // - permission already granted
  // - we have VAPID key
  // This fixes “I enabled but subscription is still no”.
  useEffect(() => {
    if (!me?.id) return;
    refreshPushStatus();

    if (!supported) return;
    if (!notifEnabled) return;
    if (!hasVapid) return;
    if (Notification.permission !== "granted") return;

    // Best-effort: ensure subscribed + saved
    (async () => {
      try {
        setNotifBusy(true);
        await ensurePushSubscription({ forceNew: false });
      } catch {
        // swallow; status row will help diagnose
      } finally {
        setNotifBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, supported, notifEnabled, hasVapid]);

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
          <div className="muted">
            This device/browser doesn’t support push notifications (or the site isn’t in a secure context).
          </div>
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
                  onClick={testLocalNotification}
                  disabled={!notifEnabled || notifBusy}
                >
                  Test notification
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={reregisterDevice}
                  disabled={!notifEnabled || notifBusy}
                  title="Forces a fresh push subscription + re-saves it"
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Permission: <code>{Notification.permission}</code> • Subscription:{" "}
              <code>{subscribed ? "yes" : "no"}</code> • Installed: <code>{installed ? "yes" : "no"}</code> • VAPID key:{" "}
              <code>{hasVapid ? "set" : "missing"}</code>
              {isIOS() ? <> • iPhone tip: install to Home Screen for best results</> : null}
            </div>

            {!hasVapid && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                Missing <code>VITE_VAPID_PUBLIC_KEY</code>. Add it to Netlify env vars + your local <code>.env</code>, then rebuild.
              </div>
            )}

            {!!subEndpoint && (
              <div className="helper-muted" style={{ marginTop: 10, fontSize: 12, overflowWrap: "anywhere" }}>
                Endpoint: <code>{subEndpoint.slice(0, 72)}…</code>
              </div>
            )}

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
















