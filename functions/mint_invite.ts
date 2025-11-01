// functions/mint_invite.ts
// Deno Edge Function
// Create a short-lived (5 min) one-time invite token (JWT with jti).
// ENV required: INVITE_JWT_SECRET

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT } from 'jsr:@panva/jose@v4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const jwtSecret = Deno.env.get('INVITE_JWT_SECRET')!
    if (!jwtSecret) throw new Error('Missing INVITE_JWT_SECRET')

    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    })

    // Auth: who is minting?
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'content-type': 'application/json' } })
    }

    const jti = crypto.randomUUID()
    const exp = Math.floor(Date.now() / 1000) + 5 * 60 // 5 minutes

    const token = await new SignJWT({ t: 'tmdv1', pid: user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setJti(jti)
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(jwtSecret))

    return new Response(JSON.stringify({ token, exp }), {
      headers: { ...cors, 'content-type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'mint failed' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})
