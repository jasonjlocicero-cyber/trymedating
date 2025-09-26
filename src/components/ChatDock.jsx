// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ChatDock() {
  const [me, setMe] = useState(null)
  const [windows, setWindows] = useState([])
  const [open, setOpen] = useState(false)
  const [isCompact, setIsCompact] = useState(false) // small screens tweak

  // --- responsive placement for Close FAB ---
  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth < 480)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // auth
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Public API
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle }) => {
        if (!handle) return
        setOpen(true)

        const { data: prof } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url')
          .eq('handle', handle.toLowerCase())
          .maybeSingle()
        if (!prof?.user_id) { alert('User not found'); return }

        const next = {
          key: `u:${prof.user_id}`,
          userId: prof.user_id,
          handle: prof.handle,
          display_name: prof.display_name || prof.handle,
          avatar_url: prof.avatar_url || '',
          messages: [],
          input: '',
          canSend: false,
          banner: { tone: 'info', text: 'Checking permissions…' },
          iBlockedThem: false,
          lastSentAt: 0,
          cooldownMs: 2000,
          // report UI
          reportOpen: false,
          reportReason: '',
          reportContext: 'chat',
          reportBusy: false,
          reportNotice: '',
          reportError: ''
        }

        setWindows(wins => {
          if (wins.some(w => w.userId === next.userId)) return wins
          return [next, ...wins].slice(0, 4)
        })

        await refreshWindowPerms(prof.user_id)
        await loadHistory(prof.user_id)
      },
      closeAll: () => { setWindows([]); setOpen(false) }
    }
    return () => { delete window.trymeChat }
  }, [me])

  async function refreshWindowPerms(partnerId) {
    if (!me?.id || !partnerId) return
    const { data: conns } = await supabase
      .from('connections')
      .select('user_1, user_2')
      .or(`user_1.eq.${me.id},user_2.eq.${me.id}`)
    const connected = (conns || []).some(
      r => (r.user_1 === me.id && r.user_2 === partnerId) || (r.user_2 === me.id && r.user_1 === partnerId)
    )

    const { data: myBlocks } = await supabase
      .from('blocks')
      .select('blocked')
      .eq('blocker', me.id)
    const iBlockedThem = (myBlocks || []).some(b => b.blocked === partnerId)

    setWindows(wins => wins.map(w => {
      if (w.userId !== partnerId) return w
      if (iBlockedThem) return { ...w, iBlockedThem: true, canSend: false, banner: { tone: 'danger', text: 'You have blocked this user.' } }
      if (!connected) return { ...w, iBlockedThem: false, canSend: false, banner: { tone: 'info', text: 'You are not connected. Ask them to scan your QR first.' } }
      return { ...w, iBlockedThem: false, canSend: true, banner: null }
    }))
  }

  async function loadHistory(partnerId) {
    if (!me?.id || !partnerId) return
    const { data } = await supabase
      .from('messages')
      .select('id, sender, recipient, body, created_at')
      .or(`and(sender.eq.${me.id},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${me.id})`)
      .order('created_at', { ascending: true })
    setWindows(wins => wins.map(w => w.userId === partnerId ? { ...w, messages: data || [] } : w))
  }

  async function sendMessage(partnerId) {
    if (!me?.id) { alert('Please sign in.'); return }
    const w = windows.find(x => x.userId === partnerId)
    if (!w || !w.canSend) return
    const text = (w.input || '').trim()
    if (!text) return
    if (text.length > 500) {
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, banner: { tone: 'danger', text: 'Message too long (max 500 chars).' } } : x))
      return
    }

    const now = Date.now()
    const elapsed = now - (w.lastSentAt || 0)
    if (elapsed < w.cooldownMs) {
      const waitLeft = Math.ceil((w.cooldownMs - elapsed) / 1000)
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, banner: { tone: 'info', text: `Please wait ${waitLeft}s…` } } : x))
      return
    }

    const temp = { id: `temp_${now}`, sender: me.id, recipient: partnerId, body: text, created_at: new Date().toISOString() }
    setWindows(wins => wins.map(x => x.userId === partnerId ? { ...x, input: '', messages: [...x.messages, temp], lastSentAt: now } : x))

    const { error } = await supabase.from('messages').insert({ sender: me.id, recipient: partnerId, body: text })
    if (error) {
      setWindows(wins => wins.map(x => x.userId === partnerId ? { ...x, messages: x.messages.filter(m => m.id !== temp.id), banner: { tone: 'danger', text: 'Message blocked.' }, canSend: false } : x))
    } else {
      loadHistory(partnerId)
    }
  }

  async function unblockUser(partnerId) {
    if (!me?.id) return
    const ok = confirm('Unblock this user? They will not be able to message you unless you connect again.')
    if (!ok) return
    await supabase.from('blocks').delete().eq('blocker', me.id).eq('blocked', partnerId)
    await refreshWindowPerms(partnerId)
  }

  function closeWindow(id) { setWindows(wins => wins.filter(w => w.userId !== id)) }
  function toggleReport(id, open) { setWindows(wins => wins.map(w => w.userId === id ? { ...w, reportOpen: open, reportNotice: '', reportError: '' } : w)) }
  function setReportField(id, key, val) { setWindows(wins => wins.map(w => w.userId === id ? { ...w, [key]: val } : w)) }

  async function submitReport(partnerId) {
    if (!me?.id) { alert('Please sign in.'); return }
    const w = windows.find(x => x.userId === partnerId)
    if (!w) return
    const reason = (w.reportReason || '').trim()
    if (!reason) { setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, reportError: 'Please describe the issue.' } : x)); return }
    setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, reportBusy: true, reportError: '', reportNotice: '' } : x))
    const { error } = await supabase.rpc('submit_report', { p_reported: partnerId, p_reason: reason, p_context: w.reportContext || 'chat' })
    if (error) {
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, reportBusy: false, reportError: error.message || 'Could not submit report.' } : x))
    } else {
      setWindows(ws => ws.map(x => x.userId === partnerId ? { ...x, reportBusy: false, reportNotice: 'Report submitted. Thank you.', reportReason: '', reportOpen: false } : x))
    }
  }

  // --- layout styles ---
  const CARD_WIDTH = 320
  const DOCK_GAP = 12

  const dockStyle = useMemo(() => ({
    position: 'fixed',
    right: 16,
    bottom: 16,
    zIndex: 40,
    display: open ? 'grid' : 'none',
    gap: DOCK_GAP
  }), [open])

  // Place the Close FAB so it doesn't overlap the dock:
  // - normal: to the LEFT of the rightmost chat column (card width + gap)
  // - compact screens: above the dock (to avoid covering inputs)
  const closeFabStyle = useMemo(() => {
    if (!open) return null
    if (isCompact) {
      return {
        position: 'fixed',
        right: 16,
        bottom: 16 + 56, // sit just above the dock area
        zIndex: 41,
        background: '#111827', color: '#fff',
        border: 'none', borderRadius: 9999, padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 700, cursor: 'pointer'
      }
    }
    return {
      position: 'fixed',
      right: 16 + CARD_WIDTH + DOCK_GAP, // shift left of the dock
      bottom: 16,
      zIndex: 41,
      background: '#111827', color: '#fff',
      border: 'none', borderRadius: 9999, padding: '10px 14px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 700, cursor: 'pointer'
    }
  }, [open, isCompact])

  const openFabStyle = {
    position: 'fixed', right: 16, bottom: 16, zIndex: 41,
    background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
    color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.2)', fontWeight: 800, cursor: 'pointer'
  }

  return (
    <>
      {/* Launcher / Close FAB */}
      {!open ? (
        <button onClick={() => setOpen(true)} style={openFabStyle} aria-label="Open messages">Messages</button>
      ) : (
        <button onClick={() => setOpen(false)} style={closeFabStyle} aria-label="Close messages" title="Close">Close</button>
      )}

      <div style={dockStyle}>
        {/* EMPTY STATE */}
        {open && windows.length === 0 && (
          <div className="card" style={{ width: CARD_WIDTH }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Messages</div>
            {!me ? (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                Please <Link to="/auth">sign in</Link> to start chatting.
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                No conversations yet. Open a profile from your <Link to="/network">Network</Link> to start a chat.
              </div>
            )}
          </div>
        )}

        {/* CHAT WINDOWS */}
        {windows.map(w => (
          <div key={w.key} className="card" style={{ width: CARD_WIDTH, padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={w.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%91%A4'}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
                <div style={{ fontWeight: 700 }}>{w.display_name}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {w.iBlockedThem && <button className="btn" onClick={() => unblockUser(w.userId)}>Unblock</button>}
                <button className="btn" onClick={() => toggleReport(w.userId, !w.reportOpen)}>{w.reportOpen ? 'Cancel' : 'Report'}</button>
                <button className="btn" onClick={() => closeWindow(w.userId)}>×</button>
              </div>
            </div>

            {/* Banner */}
            {w.banner && (
              <div style={{
                padding: '8px 12px', fontSize: 12,
                color: w.banner.tone === 'danger' ? '#b91c1c' : '#374151',
                background: w.banner.tone === 'danger'
                  ? 'color-mix(in oklab, #fee2e2, white 50%)'
                  : 'color-mix(in oklab, var(--bg-soft), white 40%)',
                borderBottom: '1px solid var(--border)'
              }}>
                {w.banner.text}
              </div>
            )}

            {/* Report panel */}
            {w.reportOpen && (
              <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                {w.reportNotice && <div style={{ color: 'var(--secondary)', marginBottom: 6 }}>{w.reportNotice}</div>}
                {w.reportError && <div style={{ color: '#b91c1c', marginBottom: 6 }}>{w.reportError}</div>}
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Report this user</div>
                <textarea
                  rows={3}
                  placeholder="Describe what happened…"
                  value={w.reportReason}
                  onChange={(e)=>setReportField(w.userId, 'reportReason', e.target.value)}
                />
                <div style={{ display:'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-primary" disabled={w.reportBusy} onClick={() => submitReport(w.userId)}>
                    {w.reportBusy ? 'Submitting…' : 'Submit report'}
                  </button>
                  <button className="btn" onClick={() => toggleReport(w.userId, false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Messages */}
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: 12, display: 'grid', gap: 8 }}>
              {w.messages.map(m => {
                const mine = m.sender === me?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      background: mine ? 'var(--primary)' : '#f3f4f6',
                      color: mine ? '#fff' : '#111827',
                      borderRadius: 12,
                      padding: '8px 10px',
                      maxWidth: 220,
                      wordBreak: 'break-word'
                    }}>
                      {m.body}
                    </div>
                  </div>
                )
              })}
              {w.messages.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>No messages yet.</div>
              )}
            </div>

            {/* Composer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
              <form onSubmit={(e)=>{ e.preventDefault(); sendMessage(w.userId) }} style={{ display: 'grid', gap: 6 }}>
                <textarea
                  rows={1}
                  maxLength={500}
                  value={w.input}
                  onChange={e => setWindows(ws => ws.map(x => x.userId === w.userId ? { ...x, input: e.target.value } : x))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(w.userId)
                    }
                  }}
                  placeholder={w.canSend ? 'Type a message… (Shift+Enter = newline)' : 'Messaging disabled'}
                  disabled={!w.canSend}
                  style={{ resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {w.input.length > 450 && `${w.input.length}/500`}
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={!w.canSend}>Send</button>
                </div>
              </form>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}







