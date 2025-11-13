// functions/notify_new_report.ts
// Deno Edge Function: email admins when a new report is created.
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
//               REPORTS_EMAIL_FROM (e.g. "TryMeDating Reports <reports@yourdomain>")
//               REPORTS_EMAIL_TO (comma-separated list: "you@x.com,mod@y.com")

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type ReportRow = Record<string, unknown>

function htmlEscape(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toHtmlTable(obj: Record<string, unknown>) {
  const rows = Object.entries(obj).map(([k, v]) =>
    `<tr><th style="text-align:left; padding:6px 10px; border:1px solid #eee;">${htmlEscape(k)}</th><td style="padding:6px 10px; border:1px solid #eee;">${htmlEscape(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`
  ).join('')
  return `<table style="border-collapse:collapse; font:14px/1.4 system-ui;">${rows}</table>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url   = Deno.env.get('SUPABASE_URL')!
    const srkey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')!
    const from  = Deno.env.get('REPORTS_EMAIL_FROM')!
    const toRaw = Deno.env.get('REPORTS_EMAIL_TO')!

    if (!url || !srkey) throw new Error('Missing SUPABASE_URL or SERVICE_ROLE')
    if (!resendKey || !from || !toRaw) throw new Error('Missing RESEND or email envs')

    const admin = createClient(url, srkey)

    // Body can be { report_id } or { report: {...} }
    const body = await req.json().catch(() => ({}))
    const reportId: string | null = body.report_id ?? null
    let report: ReportRow | null = null

    if (reportId) {
      const { data, error } = await admin.from('reports').select('*').eq('id', reportId).maybeSingle()
      if (error) throw error
      report = data as ReportRow | null
    } else if (body.report && typeof body.report === 'object') {
      report = body.report as ReportRow
    }

    if (!report) {
      return new Response(JSON.stringify({ error: 'No report payload' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } })
    }

    const subject = `New report${report.id ? ` #${report.id}` : ''}`
    const html = `
      <div style="font:14px/1.5 system-ui; color:#111">
        <h2 style="margin:0 0 10px">New report received</h2>
        ${toHtmlTable(report)}
      </div>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${resendKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: toRaw.split(',').map(s => s.trim()).filter(Boolean),
        subject,
        html,
        text: `New report:\n${JSON.stringify(report, null, 2)}`
      })
    })

    if (!emailRes.ok) {
      const t = await emailRes.text().catch(() => '')
      throw new Error(`Resend failed: ${emailRes.status} ${t}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'content-type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'notify failed' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})
