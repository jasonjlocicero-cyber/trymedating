// src/desktop/useDesktopDeepLinks.js
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function normalizeTrymeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null

  // Windows/Electron sometimes includes quotes or trailing args
  let s = raw.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '')

  // Sometimes argv contains: tryme://... plus other tokens; keep only the scheme url
  const idx = s.indexOf('tryme:')
  if (idx > 0) s = s.slice(idx)

  // Some flows produce single-slash form: tryme:/connect?... normalize to tryme://connect?...
  // URL() can parse tryme:/connect as protocol=tryme: pathname=/connect and hostname=""
  // We’ll keep it and handle both hostname and pathname below.

  return s
}

export default function useDesktopDeepLinks() {
  const navigate = useNavigate()

  useEffect(() => {
    const d = window?.desktop
    if (!d?.isElectron || typeof d?.onDeepLink !== 'function') return

    const unsub = d.onDeepLink((payload) => {
      const raw = typeof payload === 'string' ? payload : payload?.url
      const url = normalizeTrymeUrl(raw)
      if (!url) return

      try {
        const u = new URL(url)
        if (u.protocol !== 'tryme:') return

        // We accept either form:
        // tryme://connect?token=XYZ  => hostname="connect"
        // tryme:/connect?token=XYZ   => pathname="/connect"
        const host = (u.hostname || '').toLowerCase()
        const path = (u.pathname || '').toLowerCase()

        // connect
        if (host === 'connect' || path === '/connect') {
          navigate(`/connect${u.search || ''}`)
          return
        }

        // user profile (handle)
        // tryme://u?handle=jason OR tryme://u/jason OR tryme:/u/jason
        if (host === 'u' || path.startsWith('/u/')) {
          const handle =
            u.searchParams.get('handle') ||
            (path.startsWith('/u/') ? u.pathname.split('/').pop() : null)

          if (handle) {
            navigate(`/u/${handle}`)
            return
          }
        }

        // chat
        // tryme://chat/<peerId> OR tryme:/chat/<peerId>
        if (host === 'chat' || path.startsWith('/chat')) {
          // if host is "chat" then pathname is "/<peerId>"
          // if path is "/chat/<peerId>" it’s already complete
          const next =
            host === 'chat'
              ? `/chat${u.pathname || ''}${u.search || ''}`
              : `${u.pathname || '/chat'}${u.search || ''}`

          navigate(next)
          return
        }

        // fallback: go home
        navigate('/')
      } catch (e) {
        console.warn('[desktop] bad deep link:', raw, e)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [navigate])
}

