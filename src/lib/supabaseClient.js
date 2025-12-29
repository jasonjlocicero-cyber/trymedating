// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

function cleanEnv(value) {
  if (value == null) return ''
  return String(value)
    .replace(/^\uFEFF/, '')          // strip BOM
    .replace(/\u0000/g, '')          // strip null bytes (UTF-16 issues)
    .trim()
    .replace(/^['"]+|['"]+$/g, '')   // strip wrapping quotes
}

const SUPABASE_URL = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const SUPABASE_ANON_KEY = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

// Helpful debug (does NOT print the full key)
console.log('[Supabase env]', {
  mode: import.meta.env.MODE,
  hasUrl: !!SUPABASE_URL,
  urlPreview: SUPABASE_URL ? SUPABASE_URL.slice(0, 32) + '…' : null,
  hasAnonKey: !!SUPABASE_ANON_KEY,
  anonKeyPrefix: SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 6) + '…' : null,
})

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase is not configured locally.\n' +
      'Make sure you have a .env.local in the project root with:\n' +
      'VITE_SUPABASE_URL=...\n' +
      'VITE_SUPABASE_ANON_KEY=...\n' +
      'Then STOP and re-run npm run dev.'
  )
}

try {
  // Validate before createClient so you get a clear error
  new URL(SUPABASE_URL)
} catch {
  throw new Error(`Invalid VITE_SUPABASE_URL: "${SUPABASE_URL}"`)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

