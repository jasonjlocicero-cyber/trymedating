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
  const [theme, setTheme] = useState(() => getTheme());
  const setThemeAndApply = (next) => setTheme(applyTheme(next));

  // Env
  const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    []
  );

  // default ON
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(LS_NOTIF_ENABLED);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Delete account UI (keep your existing delete-account function if you have it)
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTIF_ENABLED, notifEnabled ? "1" : "0");
    } catch {}
  }, [notifEnabled]);

  // Load current browser subscription
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported) return;
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
  }, [supported]);

  async function replaceDbSubscription(sub) {
    if (!me?.id || !sub) return;

    const json = sub.toJSON?.() || {};
    const endpoint = sub.endpoint;
    const p256dh = json?.keys?.p256dh || null;
    const auth = json?.keys?.auth || null;

    // ✅ THE KEY FIX:
    // wipe prior rows for this user so the server never pushes to stale endpoints
    // (we can support multi-device later; right now we need reliability)
    const del = await supabase.from("push_subscriptions").delete().eq("user_id", me.id);
    if (del.error) throw del.error;

    const ins = await supabase.from("push_subscriptions").insert({
      user_id: me.id,
      endpoint,
      p256dh,
      auth,
      created_at: new Date().toISOString(),
    });
    if (ins.error) throw ins.error;
  }

  async function ensureSubscribed({ forceResubscribe = false } = {}) {
    setMsg("");
    if (!supported) {
      setMsg("Push is not supported on this device/browser.");
      return null;
    }
    if (!VAPID_PUBLIC_KEY) {
      setMsg("Missing VITE_VAPID_PUBLIC_KEY (client). Add it in Netlify + local .env and rebuild.");
      return null;
    }
    if (Notification.permission !== "granted") {
      setMsg("Permission is not granted. Enable notifications first.");
      return null;
    }

    setBusy(true);
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

      // ✅ persist for server-side push
      await replaceDbSubscription(sub);

      setMsg(forceResubscribe ? "Device re-registered ✅" : "Push subscription is active ✅");
      return sub;
    } catch (e) {
      setMsg(e?.message || "Failed to create/save push subscription.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotifications(next) {
    setMsg("");

    if (!supported) {
      setNotifEnabled(false);
      setMsg("Notifications aren’t supported on this device/browser.");
      return;
    }

    if (next) {
      setBusy(true);
      try {
        // iOS note (doesn't block)
        if (isIOS() && !isStandalonePWA()) {
          setMsg("On iPhone: install to Home Screen for background push.");
        }

        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setNotifEnabled(false);
          setMsg("Permission denied. Enable notifications in device/browser settings.");
          return;
        }

        setNotifEnabled(true);
        // ✅ immediately ensure server has the current subscription
        await ensureSubscribed({ forceResubscribe: true });
      } catch (e) {
        setNotifEnabled(false);
        setMsg(e?.message || "Failed to enable notifications.");
      } finally {
        setBusy(false);
      }
    } else {
      setNotifEnabled(false);
      setMsg("Notifications disabled on this device.");
      // Optional: also unsubscribe + remove from DB
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {}
      try {
        if (me?.id) await supabase.from("push_subscriptions").delete().eq("user_id", me.id);
      } catch {}
      setSubscription(null);
    }
  }

  async function testLocalNotification() {
    setMsg("");
    if (!supported) return setMsg("Not supported.");
    if (Notification.permission !== "granted") return setMsg("Permission not granted.");

    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("TryMeDating", {
        body: "Local notification test ✅",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "tmd-test",
        data: { url: "/" },
      });
      setMsg("Local test sent.");
    } catch (e) {
      setMsg(e?.message || "Local test failed.");
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
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      await supabase.auth.signOut();
      nav("/", { replace: true });
    } catch (e) {
      setDeleteMsg(e?.message || "Delete failed");
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
    ? String(subscription.endpoint).slice(0, 70) + "…"
    : "";

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 860 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Settings</h1>

      {/* Appearance */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Appearance</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Choose a theme for this device.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${theme === "light" ? "btn-primary" : "btn-neutral"} btn-pill`}
            onClick={() => setThemeAndApply("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`btn ${theme === "dark" ? "btn-primary" : "btn-neutral"} btn-pill`}
            onClick={() => setThemeAndApply("dark")}
          >
            Dark
          </button>
        </div>
        <div className="helper-muted" style={{ marginTop: 10 }}>
          Saved as <code>{theme}</code>.
        </div>
      </section>

      {/* Notifications */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Notifications</div>

        {!supported ? (
          <div className="muted">This device/browser doesn’t support push notifications.</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              Default is <b>ON</b>. You still need to allow permission on each device.
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={notifEnabled}
                  disabled={busy}
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
                  disabled={!notifEnabled || busy}
                >
                  Test notification
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={() => ensureSubscribed({ forceResubscribe: true })}
                  disabled={!notifEnabled || busy}
                  title="Unsubscribe + resubscribe + replace server record"
                >
                  Re-register device
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
              Permission: <code>{permission}</code> • Subscription: <code>{hasSub ? "yes" : "no"}</code> • Installed:{" "}
              <code>{installed ? "yes" : "no"}</code> • VAPID key: <code>{VAPID_PUBLIC_KEY ? "set" : "missing"}</code>
            </div>

            {endpointShort ? (
              <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                Endpoint: <code>{endpointShort}</code>
              </div>
            ) : null}

            {msg ? (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                {msg}
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Account */}
      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Account</div>
        <div className="muted">Signed in as</div>
        <div style={{ marginTop: 4 }}>
          <code>{me?.email || me?.id}</code>
        </div>
      </section>

      {/* Danger zone */}
      <section className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#b91c1c" }}>Danger zone</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Permanently delete your account and all associated data. This cannot be undone.
        </div>

        {!showDeleteConfirm ? (
          <button className="btn btn-accent btn-pill" type="button" onClick={() => setShowDeleteConfirm(true)}>
            Delete my account
          </button>
        ) : (
          <div style={{ display: "grid", gap: 8, border: "1px dashed var(--border)", borderRadius: 12, padding: 12, maxWidth: 560 }}>
            <label style={{ fontWeight: 700 }}>
              Type <code>DELETE</code> to confirm
            </label>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-accent btn-pill"
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText.trim() !== "DELETE"}
              >
                {deleting ? "Deleting…" : "Yes, delete my account"}
              </button>
              <button
                className="btn btn-neutral btn-pill"
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
            {deleteMsg ? <div className="helper-error">{deleteMsg}</div> : null}
          </div>
        )}
      </section>
    </div>
  );
}


















