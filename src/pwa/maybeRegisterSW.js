// src/pwa/maybeRegisterSW.js
export default async function maybeRegisterSW({ isElectron } = {}) {
  try {
    if (isElectron) return
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

    const mod = await import('virtual:pwa-register')
    const registerSW = mod?.registerSW
    if (typeof registerSW !== 'function') return

    let swRegistration = null

    const emitPushState = (extra = {}) => {
      try {
        const detail = {
          supported: isPushSupported(),
          permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
          hasVapidKey: Boolean(getVapidPublicKey()),
          ...extra
        }
        window.dispatchEvent(new CustomEvent('tmd:push-state', { detail }))
      } catch {
        // ignore
      }
    }

    const getDeviceId = () => {
      try {
        const key = 'tmd_device_id'
        let id = localStorage.getItem(key)
        if (!id) {
          id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString()
          localStorage.setItem(key, id)
        }
        return id
      } catch {
        return null
      }
    }

    const urlBase64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const rawData = atob(base64)
      const outputArray = new Uint8Array(rawData.length)
      for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
      return outputArray
    }

    const isStandaloneDisplayMode = () => {
      // iOS + some browsers
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(display-mode: standalone)').matches
        : false
      const iosStandalone = typeof navigator !== 'undefined' && navigator.standalone === true
      return mq || iosStandalone
    }

    const isIOS = () => {
      try {
        const ua = navigator.userAgent || ''
        return /iPad|iPhone|iPod/.test(ua)
      } catch {
        return false
      }
    }

    const isPushSupported = () => {
      return (
        typeof window !== 'undefined' &&
        'PushManager' in window &&
        'Notification' in window &&
        'serviceWorker' in navigator
      )
    }

    const getVapidPublicKey = () => {
      // Put your PUBLIC VAPID key here as a Vite env var:
      // VITE_VAPID_PUBLIC_KEY=...
      return import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
    }

    const postJSON = async (url, body) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const text = await res.text().catch(() => '')
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (!res.ok) {
        const msg = json?.error || json?.message || text || `HTTP ${res.status}`
        throw new Error(msg)
      }
      return json
    }

    const ensureSubscription = async ({ userId = null, prompt = false } = {}) => {
      if (!isPushSupported()) {
        emitPushState({ subscribed: false, reason: 'unsupported' })
        return { ok: false, reason: 'unsupported' }
      }

      // iOS web push: must be installed (standalone) + user gesture for prompt
      if (isIOS() && !isStandaloneDisplayMode()) {
        emitPushState({ subscribed: false, reason: 'ios_not_installed' })
        return { ok: false, reason: 'ios_not_installed' }
      }

      if (!swRegistration) {
        emitPushState({ subscribed: false, reason: 'no_sw_registration' })
        return { ok: false, reason: 'no_sw_registration' }
      }

      const vapidPublicKey = getVapidPublicKey()
      if (!vapidPublicKey) {
        emitPushState({ subscribed: false, reason: 'missing_vapid_public_key' })
        return { ok: false, reason: 'missing_vapid_public_key' }
      }

      // Permission handling:
      // - NEVER prompt automatically on load (especially iOS).
      // - Only prompt when explicitly requested (user gesture).
      if (typeof Notification === 'undefined') {
        emitPushState({ subscribed: false, reason: 'notification_unsupported' })
        return { ok: false, reason: 'notification_unsupported' }
      }

      if (Notification.permission !== 'granted') {
        if (!prompt) {
          emitPushState({ subscribed: false, reason: 'permission_not_granted' })
          return { ok: false, reason: 'permission_not_granted' }
        }

        const permission = await Notification.requestPermission().catch(() => 'denied')
        if (permission !== 'granted') {
          emitPushState({ subscribed: false, reason: 'permission_denied' })
          return { ok: false, reason: 'permission_denied' }
        }
      }

      // Subscribe (or reuse existing)
      const existing = await swRegistration.pushManager.getSubscription()
      const sub =
        existing ||
        (await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        }))

      // Persist subscription server-side (Netlify Function)
      const deviceId = getDeviceId()
      await postJSON('/.netlify/functions/push-subscribe', {
        subscription: sub,
        deviceId,
        userId
      })

      emitPushState({ subscribed: true })
      return { ok: true, subscribed: true }
    }

    const disableSubscription = async () => {
      if (!swRegistration) return { ok: false, reason: 'no_sw_registration' }
      const sub = await swRegistration.pushManager.getSubscription()
      if (!sub) {
        emitPushState({ subscribed: false })
        return { ok: true, subscribed: false }
      }

      try {
        await sub.unsubscribe()
      } catch {
        // ignore
      }

      // Optional: you can implement this function later to delete server-side records
      // await postJSON('/.netlify/functions/push-unsubscribe', { endpoint: sub.endpoint, deviceId: getDeviceId() })

      emitPushState({ subscribed: false })
      return { ok: true, subscribed: false }
    }

    // Expose a tiny global API so you can wire this into a button immediately:
    // - window.tmdPush.enable({ userId }) MUST be called from a user click/tap for iOS reliability.
    // - window.tmdPush.ensure({ userId }) will only subscribe if permission already granted (no prompt).
    window.tmdPush = {
      enable: async ({ userId = null } = {}) => ensureSubscription({ userId, prompt: true }),
      ensure: async ({ userId = null } = {}) => ensureSubscription({ userId, prompt: false }),
      disable: async () => disableSubscription(),
      status: async () => {
        const supported = isPushSupported()
        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
        const hasVapidKey = Boolean(getVapidPublicKey())
        let subscribed = false
        try {
          if (swRegistration) {
            const s = await swRegistration.pushManager.getSubscription()
            subscribed = Boolean(s)
          }
        } catch {
          subscribed = false
        }
        const state = { supported, permission, hasVapidKey, subscribed }
        emitPushState(state)
        return state
      }
    }

    registerSW({
      immediate: true,

      // Newer plugin versions support onRegisteredSW; older use onRegistered.
      onRegisteredSW(_swUrl, reg) {
        swRegistration = reg || null
        emitPushState()
        // No prompt here. If permission already granted, we can ensure quietly:
        ensureSubscription({ prompt: false }).catch(() => {})
      },

      onRegistered(reg) {
        swRegistration = reg || null
        emitPushState()
        // No prompt here. If permission already granted, we can ensure quietly:
        ensureSubscription({ prompt: false }).catch(() => {})
      },

      onRegisterError(err) {
        console.warn('[PWA] SW register error:', err)
        emitPushState({ reason: 'sw_register_error' })
      }
    })

    emitPushState()
  } catch (err) {
    // If PWA plugin isn't included in this build, this import can fail — that's fine.
    console.warn('[PWA] SW setup skipped:', err)
    try {
      window.dispatchEvent(
        new CustomEvent('tmd:push-state', {
          detail: { supported: false, permission: 'unsupported', reason: 'sw_setup_skipped' }
        })
      )
    } catch {
      // ignore
    }
  }
}




