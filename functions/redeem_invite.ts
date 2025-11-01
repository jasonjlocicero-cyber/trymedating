// functions/redeem_invite.ts
// Verify the token (JWT), enforce one-time use via jti insert, and return pid (target user).
// Requires table:
//
// create table if not exists invite_used_jti (
//   jti text primary key,
//   used_at timestamptz default now()
// );

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jwtVerify } from 'jsr:@panva/jose@v4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } })
    }

    const jwtSecret = Deno.env.get('INVITE_JWT_SECRET')!
    if (!jwtSecret) throw new Error('Missing INVITE_JWT_SECRET')

    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(jwtSecret))
    // payload: { t:'tmdv1', pid: <user_id>, sub, jti, exp }
    const jti = String(payload?.jti || '')
    const pid = String((payload as any)?.pid || '')
    if (!jti || !pid) throw new Error('Invalid token payload')

    const url = Deno.env.get('SUPABASE_URL')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // needs row insert bypass
    const supabase = createClient(url, service)

    // one-time use: try to insert the jti; on conflict -> already used
    const { error: insErr } = await supabase
      .from('invite_used_jti')
      .insert({ jti })
    if (insErr) {
      // 23505 = unique violation -> already used
      return new Response(JSON.stringify({ error: 'Token already used' }), { status: 409, headers: { ...cors, 'content-type': 'application/json' } })
    }

    return new Response(JSON.stringify({ ok: true, pid }), { headers: { ...cors, 'content-type': 'application/json' } })
  } catch (e) {
    // Expired tokens or bad signature will land here
    return new Response(JSON.stringify({ error: e?.message || 'redeem failed' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } })
  }
})
