// functions/export_reports_csv.ts
// Deno Edge Function: export the 'reports' table to CSV with optional date filters.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return 'id\n' // minimal header
  // union of all keys to be safe
  const keys = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set }, new Set<string>())).sort()
  const header = keys.join(',')
  const lines = rows.map(r => keys.map(k => csvEscape(r[k])).join(','))
  return [header, ...lines].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url   = Deno.env.get('SUPABASE_URL')!
    const srkey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!url || !srkey) throw new Error('Missing SUPABASE_URL or SERVICE_ROLE')

    const admin = createClient(url, srkey)
    const u = new URL(req.url)
    const since = u.searchParams.get('since')
    const until = u.searchParams.get('until')

    let q = admin.from('reports').select('*').order('created_at', { ascending: false })
    if (since) q = q.gte('created_at', since)
    if (until) q = q.lte('created_at', until)

    const { data, error } = await q
    if (error) throw error

    const csv = toCSV((data || []) as Record<string, unknown>[])
    const filename = `reports-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`

    return new Response(csv, {
      headers: {
        ...cors,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'export failed' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})
