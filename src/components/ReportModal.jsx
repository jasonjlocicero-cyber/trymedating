// src/components/ReportModal.jsx
import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ReportModal({ open, onClose, targetId, targetLabel = '' }) {
  const [reason, setReason] = useState('harassment')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  if (!open) return null

  const canSubmit = !!targetId && !saving

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSaving(true); setErr(''); setMsg('')
    try {
      const { data: meRes } = await supabase.auth.getUser()
      const me = meRes?.user
      if (!me?.id) throw new Error('Please sign in to report.')

      // Insert into `reports` (schema: reporter, reported, reason, details)
      const { error } = await supabase.from('reports').insert({
        reporter: me.id,
        reported: targetId,
        reason,
        details: (details || '').slice(0, 1000)
      })
      if (error) throw error
      setMsg('Thanks — your report was submitted.')
      setTimeout(() => {
        onClose?.()
        setMsg('')
        setDetails('')
        setReason('harassment')
      }, 800)
    } catch (e2) {
      setErr(e2.message || 'Could not submit report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'grid', placeItems: 'center', zIndex: 9999
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 'min(520px, 92vw)',
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 12, padding: 16, display: 'grid', gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Report user</div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-neutral"
            style={{ padding: '6px 10px', borderRadius: 8 }}
          >
            Close
          </button>
        </div>

        {targetLabel && (
          <div className="muted" style={{ fontSize: 13 }}>
            You are reporting: <strong>{targetLabel}</strong>
          </div>
        )}

        <div>
          <div className="field-label">Reason</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['harassment', 'Harassment'],
              ['spam', 'Spam'],
              ['impersonation', 'Impersonation'],
              ['inappropriate', 'Inappropriate content'],
              ['other', 'Other'],
            ].map(([val, label]) => (
              <label key={val} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="reason"
                  value={val}
                  checked={reason === val}
                  onChange={() => setReason(val)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label">Details (optional)</div>
          <textarea
            rows={4}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Describe what happened…"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px' }}
          />
          <div className="helper-muted">Please don’t include private info. Max ~1000 chars.</div>
        </div>

        {err && <div className="helper-error">{err}</div>}
        {msg && <div className="helper-success">{msg}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-neutral" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || saving}>
            {saving ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>
  )
}
