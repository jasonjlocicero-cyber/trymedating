// src/pages/SettingsPage.jsx
import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [connCount, setConnCount] = useState(0)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteCreatedAt, setInviteCreatedAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const inviteLink = useMemo(
    () => (inviteCode ? `${window.location.origin}/connect?code=${inviteCode}` : ''),
    [inviteCode]
  )

  // Load user
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        navigate('/auth?next=' + encodeURIComponent('/settings'))
        return
      }
      setMe(user)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) navigate('/auth?next=' + encodeURIComponent('/settings'))
      setMe(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [navigate])

  // Load dashboard stats
  useEffect(() => {
    if (!me?.id) return
    ;(async () => {
      setLoading(true); setErr('')

      // 1) Connection count (count exact, head request)
      const { count: cCount, error: cErr } = await supabase
        .from('connections')
        .select('user_1, user_2', { count: 'exact', head: true })
        .or(`user_1.eq.${me.id},user_2.eq.${me.id}`)
      if (cErr) setErr(cErr.message)
      setConnCount(cCount || 0)

      // 2) Active invite
      const { data: invite, error: iErr } = await supabase
        .from('invite_codes')
        .select('code, created_at')
        .eq('owner', me.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (iErr) setErr(iErr.message || '')
      setInviteCode(invite?.code || '')
      setInviteCreatedAt(invite?.created_at || null)

      setLoading(false)
    })()
  }, [me?.id])

  // Actions
  async function rotateInvite() {
    setBusy(true)
    const { data, error } = await supabase.rpc('rotate_invite')
    setBusy(false)
    if (error) { alert(error.message || 'Could not rotate invite'); return }
    setInviteCode(data || '')
    setInviteCreatedAt(new Date().toISOString())
  }

  async function revokeInvite() {
    if (!me?.id) return
    setBusy(true)
    const { error } = await supabase
      .from('invite_codes')
      .update({ status: 'revoked' })
      .eq('owner', me.id)
      .eq('status', 'active')
    setBusy(false)
    if (error) { alert(error.message || 'Could not revoke invite'); return }
    setInviteCode('')
    setInviteCreatedAt(null)
  }

  async function onSignOut() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="container" style={{ padding: '32px 0' }}>
      <h1 style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--secondary)' }}>Account</span>{' '}
        <span style={{ color: 'var(--primary)' }}>Settings</span>
      </h1>

      {loading && <div className="card">Loading…</div>}
      {err && <div className="card" style={{ borderColor: '#e11d48', color: '#e11d48' }}>{err}</div>}

      {!loading && (
        <>
          {/* Connections summary */}
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>My Network</div>
            <div style={{ fontSize: 32, fontWeight: 800 }}>{connCount}</div>
            <div style={{ color: 'var(--muted)' }}>Total connections</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Link className="btn btn-primary" to="/network">Open Network</Link>
              <Link className="btn" to="/invite">Share my QR</Link>
            </div>
          </div>

          {/* Invite status */}
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Invite Status</div>
            {inviteCode ? (
              <>
                <div style={{ wordBreak: 'break-all' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Active invite link</div>
                  <div>{inviteLink}</div>
                  {inviteCreatedAt && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                      Created: {new Date(inviteCreatedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a className="btn" href={inviteLink} target="_blank" rel="noreferrer">Open</a>
                  <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                    Copy link
                  </button>
                  <button className="btn" onClick={rotateInvite} disabled={busy}>
                    Generate new invite
                  </button>
                  <button className="btn" onClick={revokeInvite} disabled={busy}>
                    Revoke invite
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: 'var(--muted)' }}>No active invite</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={rotateInvite} disabled={busy}>
                    Generate new invite
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Account controls */}
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Account</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn" to="/auth?mode=reset">Change password</Link>
              <button className="btn" onClick={onSignOut}>Sign out</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Need to edit your public info? Go to <Link to="/profile">Profile</Link>.
            </div>
          </div>
        </>
      )}
    </div>
  )
}


