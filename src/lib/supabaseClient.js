// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Read at build-time (Vite replaces these)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim()
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

console.log("[supabase env]", {
  mode: import.meta.env.MODE,
  hasUrl: !!SUPABASE_URL,
  urlHost: SUPABASE_URL ? new URL(SUPABASE_URL).host : null,
  hasAnonKey: !!SUPABASE_ANON_KEY,
  anonKeyPrefix: SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 6) + "…" : null,
})

// Loud, early failure if misconfigured
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Show masked values to help debug in console without leaking secrets
  console.error('Supabase: missing env vars', {
    hasUrl: !!SUPABASE_URL,
    hasAnonKey: !!SUPABASE_ANON_KEY,
  })
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in your Netlify environment variables and rebuild.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Avoid odd caches during auth
  global: {
    fetch: (input, init) => fetch(input, { cache: 'no-store', ...init }),
  },
})
