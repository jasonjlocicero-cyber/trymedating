// functions/notify_new_report.ts
// Email admins when a new report is created.
// If email envs are missing, gracefully fall back to logging in DB.
//
// Env (email mode):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY
//   REPORTS_EMAIL_FROM  e.g. "TryMeDating Reports <reports@yourdomain>"
//   REPORTS_EMAIL_TO    e.g. "you@x.com,mod@y.com"
// Optional:
//   REPORTS_NOTIFY_MODE = "email" | "log" | "off"   (default: "email")
//
// POST body: { report_id }  OR  { report: {...} }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Dict = Record<string, unknown>

function htmlEscape(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/<//g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toHtmlTable(obj: Dict) {
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
    if (!url || !srkey) throw new Error('Missing SUPABASE_URL or SERVICE_ROLE')

    const notifyMode = (Deno.env.get('REPORTS_NOTIFY_MODE') || 'email').toLowerCase()
    const admin = createClient(url, srkey)

    // Body can be { report_id } or { report: {...} }
    const body = await req.json().catch(() => ({} as Dict))
    const reportId: string | null = (body as Dict)['report_id'] as string ?? null
    let report: Dict | null = null

    if (reportId) {
      const { data, error } = await admin.from('reports').select('*').eq('id', reportId).maybeSingle()
      if (error) throw error
      report = (data ?? null) as Dict | null
    } else if (body && typeof body === 'object' && 'report' in body!) {
      report = (body as Dict)['report'] as Dict
    }

    if (!report) {
      return new Response(JSON.stringify({ error: 'No report payload' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } })
    }

    // Decide delivery mode
    const haveEmailCreds =
      !!Deno.env.get('RESEND_API_KEY') &&
      !!Deno.env.get('REPORTS_EMAIL_FROM') &&
      !!Deno.env.get('REPORTS_EMAIL_TO')

    const deliverByEmail = notifyMode === 'email' && haveEmailCreds
    const deliverByLog   = notifyMode === 'log' || !deliverByEmail
    const deliverOff     = notifyMode === 'off'

    // OFF: do nothing, but succeed (useful during dev)
    if (deliverOff) {
      return new Response(JSON.stringify({ ok: true, mode: 'off' }), {
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    // LOG fallback (no email creds or explicitly requested)
    if (deliverByLog) {
      // store raw payload (plus optional report_id if present)
      const { error: insErr } = await admin.from('report_notifications').insert({
        report_id: (report as Dict)['id'] ?? reportId ?? null,
        payload: report,
      })
      if (insErr) throw insErr

      return new Response(JSON.stringify({ ok: true, mode: 'log' }), {
        headers: { ...cors, 'content-type': 'application/json' }
      })
    }

    // EMAIL via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')!
    const from = Deno.env.get('REPORTS_EMAIL_FROM')!
    const toRaw = Deno.env.get('REPORTS_EMAIL_TO')!
    const subject = `New report${(report as Dict)['id'] ? ` #${(report as Dict)['id']}` : ''}`

    const html = `
      <div style="font:14px/1.5 system-ui; color:#111">
        <h2 style="margin:0 0 10px">New report received</h2>
        ${toHtmlTable(report as Dict)}
      </div>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: toRaw.split(',').map(s => s.trim()).filter(Boolean),
        subject,
        html,
        text: `New report:\n${JSON.stringify(report, null, 2)}`,
      }),
    })
    if (!emailRes.ok) {
      const t = await emailRes.text().catch(() => '')
      throw new Error(`Resend failed: ${emailRes.status} ${t}`)
    }

    return new Response(JSON.stringify({ ok: true, mode: 'email' }), {
      headers: { ...cors, 'content-type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'notify failed' }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' }
    })
  }
})

