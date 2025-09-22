// netlify/functions/delete-account.js
const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false }
})

exports.handler = async (event) => {
  // CORS preflight (optional but handy if you ever call cross-origin)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const authHeader = event.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Missing token' }) }

    const { user_id } = JSON.parse(event.body || '{}')
    if (!user_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing user_id' }) }

    // Verify the token belongs to the same user (prevents deleting others)
    const { data: userFromToken, error: tokenErr } = await supabase.auth.getUser(token)
    if (tokenErr || !userFromToken?.user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) }
    }
    if (userFromToken.user.id !== user_id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    // Delete profile row first (optional; auth deletion will cascade if FK on delete cascade is set)
    await supabase.from('profiles').delete().eq('user_id', user_id)

    // Delete the auth user (service role required)
    const { error: delErr } = await supabase.auth.admin.deleteUser(user_id)
    if (delErr) {
      return { statusCode: 500, body: JSON.stringify({ error: delErr.message }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || 'Server error' }) }
  }
}
