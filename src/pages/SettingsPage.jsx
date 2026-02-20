// src/pages/Settings.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { isStandaloneDisplayMode, onDisplayModeChange } from '../lib/pwa'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buf) {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, value: text }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Settings() {
  // ===== Theme =====
  const [theme, setTheme] = useState(() => localStorage.getItem('tmd:theme') || 'dark')
  const applyTheme = (t) => {
    setTheme(t)
    localStorage.setItem('tmd:theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.dataset.theme = t
  }

  useEffect(() => {
    applyTheme(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===== Auth/User =====
  const [user, setUser] = useState(null)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data?.user || null)
      setUserEmail(data?.user?.email || '')
    })()
    return () => {
      mounted = false
    }
  }, [])

  // ===== PWA / Push status =====
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
  const hasVapidKey = !!vapidPublicKey

  const pushSupported = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    )
  }, [])

  const [installed, setInstalled] = useState(isStandaloneDisplayMode())
  useEffect(() => {
    const unsub = onDisplayModeChange((isInstalled) => setInstalled(!!isInstalled))
    setInstalled(isStandaloneDisplayMode())
    return () => unsub?.()
  }, [])

  const [enabled, setEnabled] = useState(() => {
    const v = localStorage.getItem('tmd:push:enabled')
    return v === null ? true : v === 'true'
  })

  const [permission, setPermission] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    return Notification.permission
  })

  const [subscription, setSubscription] = useState(null)
  const [endpointPreview, setEndpointPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // SW diagnostics
  const [swInfo, setSwInfo] = useState({
    controller: '',
    active: '',
    waiting: '',
    scope: '',
  })

  const lastSavedEndpointRef = useRef('')

  const refreshPermission = () => {
    if (!('Notification' in window)) return setPermission('unsupported')
    setPermission(Notification.permission)
  }

  const refreshSwInfo = async () => {
    if (!('serviceWorker' in navigator)) {
      setSwInfo({ controller: '', active: '', waiting: '', scope: '' })
      return
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const controller = navigator.serviceWorker.controller?.scriptURL || ''
      const active = reg?.active?.scriptURL || ''
      const waiting = reg?.waiting?.scriptURL || ''
      const scope = reg?.scope || ''
      setSwInfo({ controller, active, waiting, scope })
    } catch {
      setSwInfo({ controller: '', active: '', waiting: '', scope: '' })
    }
  }

  const waitForControllerChange = async (timeoutMs = 6000) => {
    if (!('serviceWorker' in navigator)) return false
    return await new Promise((resolve) => {
      let done = false
      const t = setTimeout(() => {
        if (done) return
        done = true
        resolve(false)
      }, timeoutMs)

      const onChange = () => {
        if (done) return
        done = true
        clearTimeout(t)
        navigator.serviceWorker.removeEventListener('controllerchange', onChange)
        resolve(true)
      }

      navigator.serviceWorker.addEventListener('controllerchange', onChange)
    })
  }

  const activateWaitingIfAny = async (reg) => {
    if (!reg?.waiting) return false
    try {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      const changed = await waitForControllerChange(6000)
      await wait(250)
      return changed
    } catch {
      return false
    }
  }

  const getRegistration = async ({ activateWaiting = true } = {}) => {
    // Always work at root scope for PWA push
    let reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    }

    // If there’s a waiting SW, activate it (optional)
    if (activateWaiting) {
      await activateWaitingIfAny(reg)
      reg = await navigator.serviceWorker.getRegistration('/')
    }

    // Ensure ready
    try {
      await navigator.serviceWorker.ready
    } catch {}

    return reg
  }

  const refreshSubscription = async () => {
    if (!pushSupported) {
      setSubscription(null)
      setEndpointPreview('')
      return
    }
    try {
      const reg = await getRegistration({ activateWaiting: false })
      const sub = await reg.pushManager.getSubscription()
      setSubscription(sub)
      const ep = sub?.endpoint || ''
      setEndpointPreview(ep ? `${ep.slice(0, 70)}${ep.length > 70 ? '…' : ''}` : '')
      if (ep) lastSavedEndpointRef.current = ep
    } catch (e) {
      setSubscription(null)
      setEndpointPreview('')
      setErrorMsg(e?.message || String(e))
    }
  }

  useEffect(() => {
    refreshPermission()
    refreshSubscription()
    refreshSwInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushSupported])

  // ===== DB write helpers =====
  const saveSubscriptionToDb = async (sub) => {
    if (!user?.id) throw new Error('Not signed in')
    if (!sub?.endpoint) throw new Error('Missing subscription endpoint')

    const row = {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: arrayBufferToBase64(sub.getKey('p256dh')),
      auth: arrayBufferToBase64(sub.getKey('auth')),
      updated_at: new Date().toISOString(),
    }

    // Primary path: upsert by endpoint (requires UNIQUE constraint on endpoint)
    const upsertAttempt = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
    if (!upsertAttempt.error) return true

    // Fallback path (prevents “ON CONFLICT…” crash if constraint is missing)
    const msg = upsertAttempt.error?.message || ''
    if (msg.toLowerCase().includes('on conflict')) {
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', row.endpoint)
      const ins = await supabase.from('push_subscriptions').insert(row)
      if (ins.error) throw ins.error
      return true
    }

    throw upsertAttempt.error
  }

  const deleteSubscriptionFromDb = async (endpoint) => {
    if (!user?.id || !endpoint) return
    await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  }

  // ===== Main actions =====
  const ensureSubscribed = async ({ forceReregister = false } = {}) => {
    setBusy(true)
    setErrorMsg('')
    setStatusMsg('')

    try {
      if (!pushSupported) throw new Error('Push not supported in this browser/device context.')
      if (!hasVapidKey) {
        throw new Error('Missing VITE_VAPID_PUBLIC_KEY (client). Add it to Netlify + local .env, then rebuild.')
      }
      if (!user?.id) throw new Error('You must be signed in to enable notifications.')

      // Permission
      refreshPermission()
      let p = Notification.permission
      if (p !== 'granted') {
        p = await Notification.requestPermission()
        setPermission(p)
      }
      if (p !== 'granted') {
        throw new Error('Notification permission is not granted. Enable it in device/browser settings.')
      }

      // Ensure SW is registered and (optionally) activated
      // This prevents the “site updated in background” situation from being the only thing you see.
      const reg = await getRegistration({ activateWaiting: true })
      await refreshSwInfo()

      let sub = await reg.pushManager.getSubscription()

      if (forceReregister && sub) {
        try {
          await sub.unsubscribe()
        } catch {}
        sub = null
      }

      if (!sub) {
        const appServerKey = urlBase64ToUint8Array(vapidPublicKey)
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        })
      }

      setSubscription(sub)
      setEndpointPreview(sub?.endpoint ? `${sub.endpoint.slice(0, 70)}${sub.endpoint.length > 70 ? '…' : ''}` : '')

      await saveSubscriptionToDb(sub)

      lastSavedEndpointRef.current = sub.endpoint
      setStatusMsg(forceReregister ? 'Device re-registered and saved.' : 'Subscription saved.')
      return true
    } catch (e) {
      setErrorMsg(e?.message || String(e))
      return false
    } finally {
      setBusy(false)
      refreshPermission()
      refreshSubscription()
      refreshSwInfo()
    }
  }

  const disableNotifications = async () => {
    setBusy(true)
    setErrorMsg('')
    setStatusMsg('')
    try {
      if (!pushSupported) return

      const reg = await getRegistration({ activateWaiting: false })
      const sub = await reg.pushManager.getSubscription()

      if (sub?.endpoint) await deleteSubscriptionFromDb(sub.endpoint)

      if (sub) {
        try {
          await sub.unsubscribe()
        } catch {}
      }

      setSubscription(null)
      setEndpointPreview('')
      setStatusMsg('Notifications disabled on this device.')
    } catch (e) {
      setErrorMsg(e?.message || String(e))
    } finally {
      setBusy(false)
      refreshPermission()
      refreshSubscription()
      refreshSwInfo()
    }
  }

  const onToggleEnabled = async (next) => {
    setEnabled(next)
    localStorage.setItem('tmd:push:enabled', String(next))
    setErrorMsg('')
    setStatusMsg('')

    if (next) {
      await ensureSubscribed({ forceReregister: false })
    } else {
      await disableNotifications()
    }
  }

  const activateUpdateNow = async () => {
    setBusy(true)
    setErrorMsg('')
    setStatusMsg('')
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers not supported here.')
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg?.waiting) {
        setStatusMsg('No waiting service worker found.')
        return
      }
      const ok = await activateWaitingIfAny(reg)
      await refreshSwInfo()
      setStatusMsg(ok ? 'Activated update (controller changed).' : 'Tried to activate update, but controller did not change.')
    } catch (e) {
      setErrorMsg(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const testNotification = async () => {
    setTestBusy(true)
    setErrorMsg('')
    setStatusMsg('')
    try {
      if (!user?.id) throw new Error('Not signed in')

      const res = await fetch('/.netlify/functions/push-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: user.id,
          body: `🔔 Test notification @ ${new Date().toLocaleTimeString()}`,
        }),
      })

      const text = await res.text()
      const parsed = safeJsonParse(text)

      if (!res.ok) {
        throw new Error(
          parsed.ok
            ? `Test failed (${res.status}): ${parsed.value?.error || JSON.stringify(parsed.value)}`
            : `Test failed (${res.status}): ${String(parsed.value).slice(0, 160)}`
        )
      }

      setStatusMsg(parsed.ok ? `Test request sent. Server: ${JSON.stringify(parsed.value)}` : 'Test request sent.')
    } catch (e) {
      setErrorMsg(e?.message || String(e))
    } finally {
      setTestBusy(false)
    }
  }

  useEffect(() => {
    if (!enabled) return
    if (!user?.id) return
    refreshSubscription()
    refreshSwInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id])

  const subscriptionYesNo = subscription?.endpoint ? 'yes' : 'no'
  const installedYesNo = installed ? 'yes' : 'no'
  const vapidYesNo = hasVapidKey ? 'set' : 'missing'

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 980 }}>
        <h1 className="h1">Settings</h1>

        {/* Appearance */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2 className="h2">Appearance</h2>
            <p className="muted">Choose a theme for this device.</p>

            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <button
                className={`btn btn-pill ${theme === 'light' ? 'btn-primary' : 'btn-neutral'}`}
                onClick={() => applyTheme('light')}
                type="button"
              >
                Light
              </button>
              <button
                className={`btn btn-pill ${theme === 'dark' ? 'btn-primary' : 'btn-neutral'}`}
                onClick={() => applyTheme('dark')}
                type="button"
              >
                Dark
              </button>
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Saved as <b>{theme}</b>.
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2 className="h2">Notifications</h2>
            <p className="muted">
              Default is <b>ON</b>. You still need to allow permission on each device.
            </p>

            {!pushSupported && (
              <div className="muted" style={{ marginTop: 10 }}>
                Push is not supported in this browser context.
              </div>
            )}

            <label className="row" style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={!!enabled}
                onChange={(e) => onToggleEnabled(e.target.checked)}
                disabled={!pushSupported || busy}
              />
              <span style={{ fontWeight: 700 }}>Enable notifications</span>
            </label>

            <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-neutral btn-pill"
                type="button"
                onClick={testNotification}
                disabled={!enabled || !pushSupported || testBusy || busy}
              >
                {testBusy ? 'Testing…' : 'Test notification'}
              </button>

              <button
                className="btn btn-neutral btn-pill"
                type="button"
                onClick={() => ensureSubscribed({ forceReregister: true })}
                disabled={!enabled || !pushSupported || busy}
              >
                {busy ? 'Working…' : 'Re-register device'}
              </button>

              <button
                className="btn btn-neutral btn-pill"
                type="button"
                onClick={activateUpdateNow}
                disabled={!pushSupported || busy}
              >
                {busy ? 'Working…' : 'Activate update'}
              </button>
            </div>

            <div className="muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
              Permission: <b>{permission}</b> • Subscription: <b>{subscriptionYesNo}</b> • Installed: <b>{installedYesNo}</b> • VAPID key:{' '}
              <b>{vapidYesNo}</b>
            </div>

            {/* SW diagnostics */}
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
              <div>
                SW controller: <span style={{ wordBreak: 'break-all' }}>{swInfo.controller || '—'}</span>
              </div>
              <div>
                SW active: <span style={{ wordBreak: 'break-all' }}>{swInfo.active || '—'}</span>
              </div>
              <div>
                SW waiting: <span style={{ wordBreak: 'break-all' }}>{swInfo.waiting || '—'}</span>
              </div>
              <div>
                SW scope: <span style={{ wordBreak: 'break-all' }}>{swInfo.scope || '—'}</span>
              </div>
            </div>

            {endpointPreview && (
              <div className="muted" style={{ marginTop: 10 }}>
                Endpoint: <span style={{ wordBreak: 'break-all' }}>{endpointPreview}</span>
              </div>
            )}

            {statusMsg && (
              <div className="muted" style={{ marginTop: 12 }}>
                {statusMsg}
              </div>
            )}

            {errorMsg && (
              <div style={{ marginTop: 12, color: 'var(--colorDanger, #ef4444)', fontWeight: 600 }}>
                {errorMsg}
              </div>
            )}

            <div className="muted" style={{ marginTop: 12 }}>
              <b>Note:</b> If you’re seeing <i>“This site has been updated in the background”</i>, that’s Chrome reporting a service worker update —
              not your push message. The buttons above help ensure the correct SW is active before subscribing/testing.
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2 className="h2">Account</h2>
            <div className="muted">Signed in as</div>
            <div style={{ marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {userEmail || '—'}
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2 className="h2" style={{ color: 'var(--colorDanger, #ef4444)' }}>
              Danger zone
            </h2>
            <p className="muted">Permanently delete your account and all associated data. This cannot be undone.</p>
            <button
              className="btn btn-pill"
              style={{ background: 'var(--colorDanger, #ef4444)', color: '#fff' }}
              type="button"
              onClick={() => alert('Account deletion is not wired in this Settings page file.')}
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}




















