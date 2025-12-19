// src/desktop/useDesktopDeepLinks.js
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function useDesktopDeepLinks() {
  const navigate = useNavigate()

  useEffect(() => {
    const d = window?.desktop
    if (!d?.isElectron || !d?.onDeepLink) return

    const unsub = d.onDeepLink((payload) => {
      // payload can be { url } or a string depending on your main process
      const url = typeof payload === 'string' ? payload : payload?.url
      if (!url) return

      try {
        const u = new URL(url)

        // Map tryme://… -> your React routes
        // tryme://connect?token=XYZ  => /connect?token=XYZ
        if (u.hostname === 'connect' || u.pathname === '/connect') {
          navigate(`/connect${u.search || ''}`)
          return
        }

        // tryme://u?handle=jason OR tryme://u/jason => /u/jason
        if (u.hostname === 'u' || u.pathname.startsWith('/u/')) {
          const handle = u.searchParams.get('handle') || u.pathname.split('/').pop()
          if (handle) navigate(`/u/${handle}`)
          return
        }

        // fallback
        navigate('/')
      } catch (e) {
        console.warn('[desktop] bad deep link:', url, e)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [navigate])
}
