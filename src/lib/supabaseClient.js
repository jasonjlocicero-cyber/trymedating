// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Read at build-time (Vite replaces these)
const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const SUPABASE_URL = rawUrl?.trim()
const SUPABASE_ANON_KEY = rawKey?.trim()

// Loud, early failure if misconfigured
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Missing env vars:', {
    mode: import.meta.env.MODE,
    hasUrl: !!SUPABASE_URL,
    hasAnonKey: !!SUPABASE_ANON_KEY
  })
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// Validate URL format
let urlHost = null
try {
  urlHost = new URL(SUPABASE_URL).host
} catch (e) {
  console.error('[Supabase] Invalid VITE_SUPABASE_URL:', SUPABASE_URL)
  throw e
}

// Helpful debug (safe-ish: does not print the full key)
console.log('[supabase env]', {
  mode: import.meta.env.MODE,
  hasUrl: true,
  urlHost,
  hasAnonKey: true,
  anonKeyPrefix: SUPABASE_ANON_KEY.slice(0, 6) + '…'
})

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  // Avoid odd caches during auth
  global: {
    fetch: (input, init) => fetch(input, { cache: 'no-store', ...init })
  }
})

