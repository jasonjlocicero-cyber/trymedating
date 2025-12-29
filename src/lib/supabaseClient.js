// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Helpful debug without leaking the key
console.log('[supabase env]', {
  mode: import.meta.env.MODE,
  hasUrl: !!SUPABASE_URL,
  urlHost: SUPABASE_URL ? (() => { try { return new URL(SUPABASE_URL).host } catch { return 'invalid' } })() : null,
  hasAnonKey: !!SUPABASE_ANON_KEY,
  anonKeyLen: SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.length : 0,
})

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase is not configured locally. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (repo root), then restart the dev server.'
  )
}

try {
  new URL(SUPABASE_URL)
} catch {
  throw new Error(`Invalid VITE_SUPABASE_URL: ${SUPABASE_URL}`)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (input, init) => fetch(input, { cache: 'no-store', ...init }),
  },
})


