// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

// Client-side VAPID public key (must be injected at build time)
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim();

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

function clampMsg(s, max = 240) {
  const str = String(s || "").replace(/\s+/g, " ").trim();
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buf) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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

  // Push support
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  // Default ON for users who have never set it on this device
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

  const [permission, setPermission] = useState(() => {
    try {
      return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
    } catch {
      return "unsupported";
    }
  });

  const [installed, setInstalled] = useState(() => {
    try {
      return isStandalonePWA();
    } catch {
      return false;
    }
  });

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

  // Track permission/installed/subscription status
  async function refreshPushStatus() {
    try {
      setPermission(Notification.permission);
    } catch {
      setPermission("unsupported");
    }
    try {
      setInstalled(isStandalonePWA());
    } catch {
      setInstalled(false);
    }

    if (!supported) {
      setHasSub(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setHasSub(!!sub);
    } catch {
      setHasSub(false);
    }
  }

  useEffect(() => {
    refreshPushStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function saveSubscriptionToDb(subscription) {
    if (!me?.id) throw new Error("Not signed in.");
    if (!subscription?.endpoint) throw new Error("Missing subscription endpoint.");

    const p256dh = arrayBufferToBase64(subscription.getKey("p256dh"));
    const auth = arrayBufferToBase64(subscription.getKey("auth"));

    const row = {
      user_id: me.id,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent || null,
      updated_at: new Date().toISOString(),
    };

    // Try a couple common conflict keys so this works with different schemas
    let r = await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (r.error) {
      r = await supabase.from("push_subscriptions").upsert(row, { onConflict: "user_id,endpoint" });
    }
    if (r.error) {
      // last resort
      const ins = await supabase.from("push_subscriptions").insert(row);
      if (ins.error && ins.error.code === "23505") {
        const up = await supabase
          .from("push_subscriptions")
          .update(row)
          .eq("user_id", me.id)
          .eq("endpoint", row.endpoint);
        if (up.error) throw up.error;
      } else if (ins.error) {
        throw ins.error;
      }
    }
  }

  async function deleteSubscriptionFromDb(endpoint) {
    if (!me?.id || !endpoint) return;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", me.id)
      .eq("endpoint", endpoint);

    // If RLS blocks this, we don’t hard-fail the UI — but we do surface it.
    if (error) throw error;
  }

  async function ensureSubscribed({ force = false, silent = false } = {}) {
    if (!supported) throw new Error("Notifications aren’t supported on this device/browser.");
    if (!VAPID_PUBLIC_KEY) {
      throw new Error("Missing VITE_VAPID_PUBLIC_KEY. Add it to Netlify + local .env, then rebuild.");
    }
    if (Notification.permission !== "granted") {
      throw new Error("Permission not granted. Enable notifications first.");
    }

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (sub && force) {
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

    await saveSubscriptionToDb(sub);
    await refreshPushStatus();

    if (!silent) setNotifMsg("Device registered for push notifications ✅");
  }

  async function disableNotifications() {
    setNotifMsg("");
    setNotifBusy(true);
    try {
      setNotifEnabled(false);

      if (!supported) return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignore
        }
        try {
          await deleteSubscriptionFromDb(sub.endpoint);
        } catch (e) {
          setNotifMsg(
            clampMsg(
              `Disabled on this device, but could not remove server subscription (RLS/policy). ${e?.message || ""}`
            )
          );
        }
      }

      await refreshPushStatus();
      if (!notifMsg) setNotifMsg("Notifications disabled on this device.");
    } finally {
      setNotifBusy(false);
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
        setNotifMsg("On iPhone: install the app (Share → Add to Home Screen) for best notification behavior.");
        // still allow enabling; user can proceed
      }

      setNotifBusy(true);
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);

        if (perm !== "granted") {
          setNotifEnabled(false);
          setNotifMsg("Permission denied. Enable notifications in your browser/iOS settings.");
          return;
        }

        setNotifEnabled(true);

        // Create + save a PushSubscription (this is the missing piece on Android right now)
        await ensureSubscribed({ force: false, silent: true });
        setNotifMsg("Notifications enabled ✅");
      } catch (e) {
        setNotifEnabled(false);
        setNotifMsg(clampMsg(e?.message || "Failed to enable notifications."));
      } finally {
        setNotifBusy(false);
      }
    } else {
      await disableNotifications();
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
        body: "Test notification ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/" },
      });
      setNotifMsg("Test notification sent.");
    } catch (e) {
      setNotifMsg(clampMsg(e?.message || "Failed to send test notification."));
    }
  }

  async function reregisterDevice() {
    setNotifMsg("");
    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }
    if (Notification.permission !== "granted") {
      setNotifMsg("Permission not granted. Turn notifications on first.");
      return;
    }
    setNotifBusy(true);
    try {
      await ensureSubscribed({ force: true, silent: false });
    } catch (e) {
      setNotifMsg(clampMsg(e?.message || "Failed to re-register device."));
    } finally {
      setNotifBusy(false);
    }
  }

  // If user has notifications ON and permission already granted, try to self-heal “Subscription: no”
  useEffect(() => {
    if (!supported) return;
    if (!notifEnabled) return;
    if (!me?.id) return;
    if (Notification.permission !== "granted") return;
    if (hasSub) return;
    if (!VAPID_PUBLIC_KEY) return;

    (async () => {
      try {
        await ensureSubscribed({ silent: true });
      } catch {
        // silent
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, notifEnabled, me?.id, hasSub]);

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
              <b>Default is ON.</b> You’ll still need to allow permission on each device.
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
                  onClick={reregisterDevice}
                  disabled={!notifEnabled || notifBusy || Notification.permission !== "granted"}
                  title="Refresh your device subscription (useful after reinstall/updates)"
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Permission: <code>{permission}</code> • Subscription: <code>{hasSub ? "yes" : "no"}</code> • Installed:{" "}
              <code>{installed ? "yes" : "no"}</code> • VAPID key: <code>{VAPID_PUBLIC_KEY ? "set" : "missing"}</code>
              {isIOS() ? <> • iPhone tip: install to Home Screen for best results</> : null}
            </div>

            {!VAPID_PUBLIC_KEY && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                Missing <code>VITE_VAPID_PUBLIC_KEY</code>. Add it to Netlify + your local <code>.env</code>, then rebuild.
              </div>
            )}

            {notifEnabled && Notification.permission !== "granted" && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                Notifications are ON, but permission is <code>{Notification.permission}</code>. Toggle OFF then ON to prompt again,
                or enable permission in your device/browser settings.
              </div>
            )}

            {notifMsg && (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {clampMsg(notifMsg)}
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
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
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
















