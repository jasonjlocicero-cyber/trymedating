// functions/redeem_invite.ts
// Verify invite JWT and enforce one-time redemption using a JTI ledger.
//
// ENV required: INVITE_JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Notes:
// - Works for signed-in OR anonymous callers.
// - Returns { issuer } on success.
// - CORS aligned with your mint_invite.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { jwtVerify } from 'jsr:@panva/jose@v4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

type RedeemBody = { token?: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token } = (await req.json().catch(() => ({}))) as RedeemBody
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    const jwtSecret = Deno.env.get('INVITE_JWT_SECRET')
    if (!jwtSecret) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: INVITE_JWT_SECRET' }), {
        status: 500,
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    // Verify JWT signature + exp
    const secret = new TextEncoder().encode(jwtSecret)
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })

    // Expected claims from your mint_invite: { t: 'tmdv1', pid: <issuer uuid> }
    const jti = (payload as any)?.jti as string | undefined
    const pid = (payload as any)?.pid as string | undefined
    const typ = (payload as any)?.t as string | undefined

    if (!jti || !pid || typ !== 'tmdv1') {
      return new Response(JSON.stringify({ error: 'Invalid token payload' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    // We’ll attempt to stamp used_at for this jti exactly once.
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(url, serviceKey)

    // Make sure the row exists (idempotent upsert of JTI)
    await sb.from('invite_jti_ledger').upsert({ jti, issuer: pid }, { onConflict: 'jti' })

    // Now set used_at only if not already used/revoked
    const { data: updated, error: updErr } = await sb
      .from('invite_jti_ledger')
      .update({ used_at: new Date().toISOString() })
      .eq('jti', jti)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('jti, issuer, used_at')
      .maybeSingle()

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    if (!updated) {
      // Already used or revoked — surface a clean error
      return new Response(JSON.stringify({ error: 'Token already used or revoked' }), {
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    // Success: return the issuer (the person being connected to)
    return new Response(JSON.stringify({ issuer: pid }), {
      headers: { ...cors, 'content-type': 'application/json' }
    })
  } catch (e) {
    const msg = e?.message || 'redeem failed'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})

