import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Guard so the app doesn't crash if env vars aren't set yet
export const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null
