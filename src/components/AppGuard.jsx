// src/components/AppGuard.jsx
import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function AppGuard() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [checking, setChecking] = useState(false)

  const SKIP = ['/auth', '/onboarding', '/terms', '/privacy', '/contact', '/safety']
  const isPublicProfile = pathname.startsWith('/u/')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setChecking(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return

      if (!user) { setChecking(false); return }

      if (isPublicProfile || SKIP.includes(pathname)) {
        setChecking(false)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('handle, interests')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!prof?.handle || !Array.isArray(prof.interests) || prof.interests.length < 1) {
        nav('/onboarding', { replace: true })
      }

      setChecking(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) return
      if (isPublicProfile || SKIP.includes(pathname)) return
      supabase
        .from('profiles')
        .select('handle, interests')
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.handle || !Array.isArray(data.interests) || data.interests.length < 1) {
            nav('/onboarding', { replace: true })
          }
        })
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [pathname])

  return null
}

