// netlify/functions/delete-account.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE

// Basic CORS headers so the browser can call this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' }
  }

  try {
    // Expect Authorization: Bearer <access_token>
    const authHeader = event.headers.authorization || event.headers.Authorization
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return { statusCode: 401, headers: corsHeaders, body: 'Missing bearer token' }
    }
    const accessToken = authHeader.split(' ')[1]

    // Service role client (admin privileges)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Verify the token → get user id
    const { data: userData, error: getUserErr } = await admin.auth.getUser(accessToken)
    if (getUserErr || !userData?.user) {
      return { statusCode: 401, headers: corsHeaders, body: 'Invalid token' }
    }
    const targetUserId = userData.user.id

    // 1) Delete profile row
    await admin.from('profiles').delete().eq('user_id', targetUserId)

    // 2) Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId)
    if (delErr) {
      return { statusCode: 500, headers: corsHeaders, body: 'Failed to delete account' }
    }

    return { statusCode: 200, headers: corsHeaders, body: 'ok' }
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: e.message }
  }
}
