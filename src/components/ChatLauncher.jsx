// src/components/ChatLauncher.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import ChatDock from './ChatDock'

/**
 * Floating chat launcher that listens to:
 *  - window.dispatchEvent(new CustomEvent('open-chat', { detail: { partnerId, partnerName } }))
 *  - window.openChat(partnerId?, partnerName?)           // global fallback helper
 *
 * Renders a 💬 bubble in the bottom-right. Clicking the bubble toggles open/close.
 * When open with no partner selected, shows a small “recent chats” picker.
 */
export default function ChatLauncher() {
  const [me, setMe] = useState(null)
  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState(null)
  const [partnerName, setPartnerName] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [recent, setRecent] = useState([])
  const [err, setErr] = useState('')

  // Load current user
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (mounted) setMe(user || null)
    })()
    return () => { mounted = false }
  }, [])

  // Register event listener + global fallback
  useEffect(() => {
    function openFromEvent(ev) {
      const d = ev?.detail || {}
      if (d.partnerId) {
        setPartnerId(d.partnerId)
        setPartnerName(d.partnerName || '')
      }
      setOpen(true)
    }
    window.addEventListener('open-chat', openFromEvent)

    // global fallback for places where dispatch is awkward
    window.openChat = function (pId, pName = '') {
      if (pId) {
        setPartnerId(pId)
        setPartnerName(pName || '')
      }
      setOpen(true)
    }

    return () => {
      window.removeEventListener('open-chat', openFromEvent)
      // don’t delete window.openChat on unmount in case other code references it
    }
  }, [])

  // Load recent threads when inbox opens
  useEffect(() => {
    let cancel = false
    async function load() {
      if (!open || !me?.id) return
      setLoadingList(true); setErr('')
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('sender, receiver, created_at')
          .or(`sender.eq.${me.id},receiver.eq.${me.id}`)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error

        const seen = new Set()
        const orderedIds = []
        for (const m of data || []) {
          const other = m.sender === me.id ? m.receiver : m.sender
          if (!seen.has(other)) {
            seen.add(other)
            orderedIds.push(other)
          }
          if (orderedIds.length >= 12) break
        }
        if (orderedIds.length === 0) {
          if (!cancel) setRecent([])
          return
        }

        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle')
          .in('user_id', orderedIds)
        if (pErr) throw pErr

        const rank = new Map(orderedIds.map((id, i) => [id, i]))
        const list = (profs || [])
          .map(p => ({ id: p.user_id, display_name: p.display_name || '', handle: p.handle || '' }))
          .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))

        if (!cancel) setRecent(list)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load conversations')
      } finally {
        if (!cancel) setLoadingList(false)
      }
    }
    load()
    return () => { cancel = true }
  }, [open, me?.id])

  const canChat = !!(me?.id && partnerId)

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Messages"
        aria-label="Messages"
        style={{
          position:'fixed',
          right:16, bottom:16,
          width:56, height:56,
          borderRadius:'50%',
          border:'1px solid var(--border)',
          background:'#ffffff',
          boxShadow:'0 10px 24px rgba(0,0,0,0.12)',
          display:'grid', placeItems:'center',
          zIndex: 40, cursor:'pointer'
        }}
      >
        <span style={{ fontSize:24 }}>💬</span>
      </button>

      {/* Inbox picker */}
      {open && !partnerId && (
        <div
          style={{
            position:'fixed',
            right:16, bottom:80,
            width: 320, maxWidth:'calc(100vw - 24px)',
            background:'#fff',
            border:'1px solid var(--border)',
            borderRadius:12,
            boxShadow:'0 12px 32px rgba(0,0,0,0.12)',
            padding:12,
            zIndex: 45
          }}
        >
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:800 }}>Messages</div>
            <button className="btn btn-neutral" onClick={() => setOpen(false)} style={{ padding:'4px 8px' }}>✕</button>
          </div>

          {!me?.id && <div className="helper-error">Sign in to message.</div>}

          {me?.id && (
            <>
              <div className="helper-muted" style={{ marginBottom:8 }}>Pick a recent chat:</div>
              {err && <div className="helper-error" style={{ marginBottom:8 }}>{err}</div>}
              {loadingList && <div className="muted">Loading…</div>}
              {!loadingList && recent.length === 0 && (
                <div className="muted">No conversations yet. Open someone’s profile to start a chat.</div>
              )}

              <ul style={{ listStyle:'none', padding:0, margin:0, maxHeight:220, overflowY:'auto' }}>
                {recent.map(p => (
                  <li key={p.id}>
                    <button
                      className="btn btn-neutral"
                      style={{ width:'100%', justifyContent:'flex-start', marginBottom:6 }}
                      onClick={() => {
                        setPartnerId(p.id)
                        setPartnerName(p.display_name || (p.handle ? `@${p.handle}` : 'Friend'))
                      }}
                    >
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <div style={{
                          width:24, height:24, borderRadius:'50%',
                          background:'#eef2f7', display:'grid', placeItems:'center',
                          fontSize:12, fontWeight:700
                        }}>
                          {(p.display_name || p.handle || '?').slice(0,1).toUpperCase()}
                        </div>
                        <div style={{ textAlign:'left' }}>
                          <div style={{ fontWeight:700 }}>{p.display_name || 'Unnamed'}</div>
                          {p.handle && <div className="muted">@{p.handle}</div>}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Chat dock */}
      {open && canChat && (
        <ChatDock
          me={{ id: me.id }}
          partnerId={partnerId}
          partnerName={partnerName}
          onClose={() => {
            setOpen(false)
            // keep partnerId to reopen same thread quickly; clear if you prefer:
            // setPartnerId(null)
          }}
          onUnreadChange={() => {}}
        />
      )}
    </>
  )
}
