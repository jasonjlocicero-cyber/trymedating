// src/components/AppGuard.jsx
import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

/**
 * AppGuard
 * - Watches auth + route changes.
 * - If user is signed in but missing a handle, redirects to /onboarding.
 * - Skips certain public routes and avoids loops.
 */
export default function AppGuard() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [checking, setChecking] = useState(false)

  // routes we never redirect from
  const SKIP = [
    '/auth',
    '/onboarding',
    '/terms',
    '/privacy',
    '/contact',
    '/safety'
  ]
  const isPublicProfile = pathname.startsWith('/u/')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setChecking(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return

      // If not signed in, nothing to do
      if (!user) { setChecking(false); return }

      // Skip pages that should not redirect
      if (isPublicProfile || SKIP.includes(pathname)) {
        setChecking(false)
        return
      }

      // Check profile
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('handle')
        .eq('user_id', user.id)
        .maybeSingle()

      // If query fails, don't hard-block navigation
      if (error) { setChecking(false); return }

      // If no profile or no handle -> send to onboarding
      if (!prof?.handle) {
        nav('/onboarding', { replace: true })
      }

      setChecking(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      // When auth changes, re-run the guard quickly
      if (!session?.user) return
      // Avoid redirect loops by checking current route
      if (isPublicProfile || SKIP.includes(pathname)) return
      // Quick re-check
      supabase
        .from('profiles')
        .select('handle')
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.handle) nav('/onboarding', { replace: true })
        })
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [pathname])

  // Optional: show nothing; this component is invisible
  return null
}
