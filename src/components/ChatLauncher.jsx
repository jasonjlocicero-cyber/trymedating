// src/components/ChatLauncher.jsx
import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import ChatDock from './ChatDock'

// Small helper to fetch a display name/handle for a user id
async function fetchProfileName(userId) {
  if (!userId) return ''
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, handle, user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return ''
  return data.display_name || (data.handle ? `@${data.handle}` : '')
}

// ---- UI positioning + theme ----
const LAUNCHER_BOTTOM = 96 // px
const RIGHT_GUTTER = 28
const LAUNCHER_SIZE = 56

// keep a real gap between bubble and panel (bubble height 56 + ~16 gap)
const PANEL_BOTTOM = LAUNCHER_BOTTOM + (LAUNCHER_SIZE + 16)

// Brand primary (supports both new CSS var + legacy var; hard fallback updated to #2563eb)
const BRAND_TEAL = 'var(--brand-teal, var(--tmd-teal, #2563eb))'

// Layering (launcher always above the panel)
const Z_BACKDROP = 10030
const Z_PANEL = 10040
const Z_LAUNCHER = 10050
const Z_TOAST = 10060

// Simple error boundary so chat errors don't blank the whole app
class DockErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error) {
    console.error('[ChatDock] crashed:', error)
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--chat-panel-bg, var(--bg-light))',
            color: 'var(--text)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div style={{ fontWeight: 900 }}>Chat failed to load</div>
          <div className="muted">
            A component crashed while opening chat. Check console for details.
          </div>
          <button className="btn btn-neutral" onClick={this.props.onClose}>
            Close
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ChatLauncher({ disabled = false, onUnreadChange = () => {} }) {
  const [me, setMe] = useState(null)

  const [open, setOpen] = useState(false)
  const [partnerId, setPartnerId] = useState(null)
  const [partnerName, setPartnerName] = useState('')

  const [loadingList, setLoadingList] = useState(false)
  const [recent, setRecent] = useState([])
  const [err, setErr] = useState('')

  const [unreadLocal, setUnreadLocal] = useState(0)

  // New-message toast (shows only when dock is closed)
  const [toast, setToast] = useState(null)

  // --- responsive panel positioning (fixes cut-off on narrow screens) ---
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(max-width: 420px)')?.matches ?? false
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 420px)')
    const handler = () => setIsNarrow(!!mq.matches)

    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)

    handler()
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  const closeAll = useCallback(() => {
    setOpen(false)
    setPartnerId(null)
    setPartnerName('')
    setErr('')
  }, [])

  const backToList = useCallback(() => {
    setPartnerId(null)
    setPartnerName('')
  }, [])

  // ------- auth -------
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null)
    })
    return () => {
      alive = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // ------- unread count -------
  const computeUnread = useCallback(async (userId) => {
    if (!userId) {
      setUnreadLocal(0)
      onUnreadChange(0)
      return
    }

    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', userId)
      .is('read_at', null)

    if (error) {
      setUnreadLocal(0)
      onUnreadChange(0)
      return
    }

    const n = typeof count === 'number' ? count : 0
    setUnreadLocal(n)
    onUnreadChange(n)
  }, [onUnreadChange])

  useEffect(() => {
    computeUnread(me?.id)
  }, [me?.id, computeUnread])

  // Live bump on my recipient messages only
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase
      .channel(`messages-unread-${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `recipient=eq.${me.id}` },
        () => computeUnread(me.id)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [me?.id, computeUnread])

  // When opening/closing the panel, force a refresh so badge clears even if UPDATE events don’t fire
  useEffect(() => {
    if (!me?.id) return
    if (!open) return
    const t = setTimeout(() => computeUnread(me.id), 350)
    return () => clearTimeout(t)
  }, [open, me?.id, computeUnread])

  // Esc to close (desktop)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeAll])

  // ------- global opener + events (supports BOTH names) -------
  useEffect(() => {
    function openFromEvent(ev) {
      const d = ev?.detail || {}
      const id = d.partnerId ? String(d.partnerId) : null
      const name = d.partnerName || ''

      if (id) {
        setPartnerId(id)
        setPartnerName(name)
      } else {
        setPartnerId(null)
        setPartnerName('')
      }
      setOpen(true)
    }

    window.addEventListener('open-chat', openFromEvent)
    window.addEventListener('tryme:open-chat', openFromEvent)

    window.openChat = function (id, name = '') {
      const pid = id ? String(id) : null
      if (pid) {
        setPartnerId(pid)
        setPartnerName(name || '')
      } else {
        setPartnerId(null)
        setPartnerName('')
      }
      setOpen(true)
    }

    return () => {
      window.removeEventListener('open-chat', openFromEvent)
      window.removeEventListener('tryme:open-chat', openFromEvent)
    }
  }, [])

  // ------- ensure partnerName if missing -------
  useEffect(() => {
    let cancel = false
    async function hydrateName() {
      if (!partnerId) return
      if (partnerName) return
      const n = await fetchProfileName(partnerId)
      if (!cancel) setPartnerName(n || '')
    }
    hydrateName()
    return () => { cancel = true }
  }, [partnerId, partnerName])

  // ------- recent list when open -------
  useEffect(() => {
    let cancel = false
    async function loadRecent() {
      if (!open || !me?.id || partnerId) return
      setLoadingList(true)
      setErr('')
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('sender, recipient, created_at')
          .or(`sender.eq.${me.id},recipient.eq.${me.id}`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error

        const seen = new Set()
        const order = []
        for (const m of data || []) {
          const other = m.sender === me.id ? m.recipient : m.sender
          if (other && !seen.has(other)) {
            seen.add(other)
            order.push(other)
          }
          if (order.length >= 12) break
        }

        if (!order.length) {
          if (!cancel) setRecent([])
          return
        }

        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle')
          .in('user_id', order)

        if (pErr) throw pErr

        const rank = new Map(order.map((id, i) => [id, i]))
        const list = (profs || [])
          .map((p) => ({ id: p.user_id, display_name: p.display_name || '', handle: p.handle || '' }))
          .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))

        if (!cancel) setRecent(list)
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load conversations')
      } finally {
        if (!cancel) setLoadingList(false)
      }
    }
    loadRecent()
    return () => { cancel = true }
  }, [open, me?.id, partnerId])

  // ------- new-message toast when dock is closed -------
  useEffect(() => {
    if (!me?.id) return
    const ch = supabase
      .channel(`toast-${me.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me.id}` },
        async ({ new: m }) => {
          if (open) return
          const name = await fetchProfileName(m.sender)
          setToast({
            fromId: m.sender,
            fromName: name || 'New message',
            text: m.body?.startsWith?.('[[file:') ? 'Attachment' : (m.body || 'Message')
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [me?.id, open])

  const canChat = !!(me?.id && partnerId)

  // helper for safe-area offsets
  const bottomCss = `calc(${LAUNCHER_BOTTOM}px + env(safe-area-inset-bottom, 0px))`
  const rightCss = `calc(${RIGHT_GUTTER}px + env(safe-area-inset-right, 0px))`
  const panelBottomCss = `calc(${PANEL_BOTTOM}px + env(safe-area-inset-bottom, 0px))`
  const topCss = `calc(12px + env(safe-area-inset-top, 0px))`

  // On narrow screens, pin panel inside the viewport (prevents left-side cutoff)
  const panelLeftCss = `calc(12px + env(safe-area-inset-left, 0px))`
  const panelRightCss = `calc(12px + env(safe-area-inset-right, 0px))`
  const panelPos = isNarrow ? { left: panelLeftCss, right: panelRightCss } : { right: rightCss }

  const panelBg = 'var(--chat-panel-bg, var(--bg-light))'
  const panelBorder = '1px solid var(--border)'

  return (
    <>
      {/* Backdrop to make closing easy (tap outside) */}
      {open && (
        <div
          onClick={closeAll}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.10)',
            zIndex: Z_BACKDROP
          }}
        />
      )}

      {/* Floating launcher button (ALWAYS on top) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => {
            const next = !prev
            if (!next) {
              setPartnerId(null)
              setPartnerName('')
              setErr('')
            }
            return next
          })
        }}
        title="Messages"
        aria-label="Messages"
        style={{
          position: 'fixed',
          right: rightCss,
          bottom: bottomCss,
          width: LAUNCHER_SIZE,
          height: LAUNCHER_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: BRAND_TEAL,
          boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
          display: 'grid',
          placeItems: 'center',
          zIndex: Z_LAUNCHER,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1
        }}
      >
        <span style={{ fontSize: 24, color: '#fff' }}>💬</span>
      </button>

      {/* Inbox picker */}
      {open && !partnerId && (
        <div
          style={{
            position: 'fixed',
            ...panelPos,
            bottom: panelBottomCss,
            width: isNarrow ? 'auto' : 320,
            background: panelBg,
            border: panelBorder,
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            padding: 12,
            zIndex: Z_PANEL,
            color: 'var(--text)',
            maxHeight: `calc(100dvh - ${PANEL_BOTTOM}px - 24px)`,
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 900 }}>Messages</div>
            <button
              onClick={closeAll}
              aria-label="Close"
              title="Close"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: panelBorder,
                background: panelBg,
                color: 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          {!me?.id && <div className="helper-error">Sign in to message.</div>}

          {me?.id && (
            <>
              <div className="helper-muted" style={{ marginBottom: 8 }}>Pick a recent chat:</div>
              {err && <div className="helper-error" style={{ marginBottom: 8 }}>{err}</div>}
              {loadingList && <div className="muted">Loading…</div>}
              {!loadingList && recent.length === 0 && (
                <div className="muted">No conversations yet. Open someone’s profile to start a chat.</div>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 220, overflowY: 'auto' }}>
                {recent.map((p) => (
                  <li key={p.id}>
                    <button
                      className="btn btn-neutral"
                      style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                      onClick={() => {
                        setPartnerId(p.id)
                        setPartnerName(p.display_name || (p.handle ? `@${p.handle}` : ''))
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--text)'
                          }}
                        >
                          {(p.display_name || p.handle || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text)' }}>{p.display_name || 'Unnamed'}</div>
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

      {/* New-message toast (bottom-left) */}
      {toast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: 16,
            bottom: bottomCss,
            zIndex: Z_TOAST,
            background: '#111827',
            color: '#fff',
            padding: '10px 12px',
            borderRadius: 10,
            boxShadow: '0 10px 24px rgba(0,0,0,.2)',
            maxWidth: 280
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4 }}>{toast.fromName}</div>
          <div style={{ opacity: 0.9, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {toast.text}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                setPartnerId(String(toast.fromId))
                setPartnerName(toast.fromName || '')
                setOpen(true)
                setToast(null)
              }}
            >
              Open
            </button>
            <button className="btn btn-neutral" onClick={() => setToast(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Chat panel */}
      {open && canChat && (
        <div
          style={{
            position: 'fixed',
            ...panelPos,

            // ✅ Key fix:
            // On iPhone/narrow screens, clamp panel between safe-area top and the launcher gap.
            ...(isNarrow
              ? { top: topCss, bottom: panelBottomCss }
              : { bottom: panelBottomCss, height: 'min(70dvh, 520px)' }),

            width: isNarrow ? 'auto' : 360,
            zIndex: Z_PANEL,
            background: panelBg,
            border: panelBorder,
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            color: 'var(--text)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header (bigger touch targets for mobile) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 10px',
              borderBottom: panelBorder,
              background: panelBg
            }}
          >
            <button
              type="button"
              onClick={backToList}
              title="Back"
              aria-label="Back"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: panelBorder,
                background: panelBg,
                color: 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              ←
            </button>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {partnerName || 'Chat'}
              </div>
              <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {partnerId ? String(partnerId).slice(0, 8) : ''}
              </div>
            </div>

            <button
              type="button"
              onClick={closeAll}
              title="Close"
              aria-label="Close"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: panelBorder,
                background: panelBg,
                color: 'var(--text)',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          <DockErrorBoundary onClose={closeAll}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <ChatDock
                partnerId={partnerId}
                partnerName={partnerName}
                mode="embedded"
                onRead={() => computeUnread(me?.id)}
              />
            </div>
          </DockErrorBoundary>
        </div>
      )}
    </>
  )
}























