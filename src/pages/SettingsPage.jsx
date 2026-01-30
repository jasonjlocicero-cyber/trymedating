// src/pages/SettingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { applyTheme, getTheme } from "../lib/theme";

const LS_NOTIF_ENABLED = "tmd_notifications_enabled";

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

function readLsBool(key, defaultValue) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return defaultValue;
    return v === "1";
  } catch {
    return defaultValue;
  }
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

  // Notifications support (API availability only)
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    );
  }, []);

  // ✅ DEFAULT ON:
  // If the user has never set this before, we treat notifications as ON (preference),
  // and we persist that to localStorage on first load.
  const [notifEnabled, setNotifEnabled] = useState(() =>
    readLsBool(LS_NOTIF_ENABLED, true)
  );

  const [notifMsg, setNotifMsg] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);

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

  // ✅ First-visit: if LS key is missing, lock in default ON immediately.
  useEffect(() => {
    try {
      const existing = localStorage.getItem(LS_NOTIF_ENABLED);
      if (existing === null) localStorage.setItem(LS_NOTIF_ENABLED, "1");
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep localStorage in sync
  useEffect(() => {
    try {
      localStorage.setItem(LS_NOTIF_ENABLED, notifEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [notifEnabled]);

  const perm = supported ? Notification.permission : "unsupported";
  const ios = isIOS();
  const standalone = typeof window !== "undefined" ? isStandalonePWA() : false;

  const canShowSystemNotif =
    supported && notifEnabled && Notification.permission === "granted";

  async function requestPermission() {
    setNotifMsg("");
    if (!supported) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      return;
    }

    // iOS guidance: push-style UX is best when installed to Home Screen
    if (ios && !standalone) {
      setNotifMsg(
        "On iPhone: install the app (Share → Add to Home Screen) for best notification behavior."
      );
      // Still allow requesting permission; user may proceed.
    }

    setNotifBusy(true);
    try {
      const nextPerm = await Notification.requestPermission();
      if (nextPerm !== "granted") {
        setNotifMsg(
          "Permission not granted. On iPhone, check iOS Settings → Notifications, and also make sure the app is installed to Home Screen."
        );
        return;
      }
      setNotifMsg("Permission granted ✅");
    } catch (e) {
      setNotifMsg(e?.message || "Failed to request notification permission.");
    } finally {
      setNotifBusy(false);
    }
  }

  async function testNotification() {
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
      setNotifMsg("Permission not granted yet. Tap “Grant permission”.");
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

  function toggleNotifications(next) {
    setNotifMsg("");
    if (!supported && next) {
      setNotifMsg("Notifications aren’t supported on this browser/device.");
      setNotifEnabled(false);
      return;
    }
    setNotifEnabled(next);

    // If they turn it ON but permission isn’t granted, guide them.
    if (next && supported && Notification.permission !== "granted") {
      setNotifMsg("Notifications are ON. Tap “Grant permission” to allow alerts.");
    }

    if (!next) {
      setNotifMsg("Notifications disabled on this device.");
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
          <div className="muted">
            This device/browser doesn’t support notifications.
          </div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              Notifications are <b>ON by default</b>. To receive system alerts, you must also grant permission.
              <br />
              <span style={{ fontSize: 13 }}>
                Note: Without real Web Push, system alerts only work reliably while the app is open. iPhone background alerts
                require the installed PWA + Web Push setup.
              </span>
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
                  className="btn btn-primary btn-pill"
                  type="button"
                  onClick={requestPermission}
                  disabled={!notifEnabled || notifBusy || Notification.permission === "granted"}
                >
                  {Notification.permission === "granted" ? "Permission granted" : "Grant permission"}
                </button>

                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={testNotification}
                  disabled={!canShowSystemNotif || notifBusy}
                >
                  Test notification
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Status:{" "}
              <code>
                pref={notifEnabled ? "on" : "off"} • perm={perm} • iOS={ios ? "yes" : "no"} • pwa={standalone ? "yes" : "no"}
              </code>
            </div>

            {ios ? (
              <div className="helper-muted" style={{ marginTop: 10 }}>
                iPhone notes: install to Home Screen for best behavior. If you don’t see alerts, check iOS Settings → Notifications
                and make sure TryMeDating is allowed.
              </div>
            ) : null}

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













