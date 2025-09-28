// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { track } from '../lib/analytics'

export default function ChatDock() {
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState(null)

  // threads & messages
  const [threads, setThreads] = useState([]) // [{ other_id, other_handle, other_name, last_body, last_at }]
  const [selected, setSelected] = useState(null) // { other_id, other_handle, other_name }
  const [messages, setMessages] = useState([]) // current thread messages
  const [loadingThread, setLoadingThread] = useState(false)

  // compose
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // unread
  const [unreadByUser, setUnreadByUser] = useState({}) // { other_id: count }

  const listRef = useRef(null)

  // auth bootstrap
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setMe(user || null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // load recent threads when I’m known
  useEffect(() => {
    if (!me?.id) return
    loadRecentThreads()
  }, [me?.id])

  // realtime: incoming messages to me
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase
      .channel('messages_realtime_dock')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${me.id}`
      }, async (payload) => {
        const msg = payload.new
        // bump unread for that sender if not currently focused on them
        if (!selected || selected.other_id !== msg.sender_id || !open) {
          setUnreadByUser(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }))
        }

        // update thread list top item
        await loadRecentThreads()

        // if we’re currently in the thread with that sender, append + scroll
        if (selected && selected.other_id === msg.sender_id) {
          setMessages(prev => {
            const next = [...prev, msg]
            return next.sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
          })
          scrollToBottomSoon()
        }

        // analytics
        track('Message Received', { from: msg.sender_id })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [me?.id, selected, open])

  async function loadRecentThreads() {
    if (!me?.id) return
    // get last 100 messages where I am sender or recipient
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id,sender_id,recipient_id,body,created_at')
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return

    // build map of other participant -> newest msg
    const latestByOther = new Map()
    ;(msgs || []).forEach(m => {
      const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id
      if (!latestByOther.has(otherId)) {
        latestByOther.set(otherId, m)
      }
    })

    const others = Array.from(latestByOther.keys())
    if (others.length === 0) {
      setThreads([])
      return
    }

    // fetch profiles for display
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, handle, display_name')
      .in('user_id', others)

    const profById = Object.fromEntries((profs || []).map(p => [p.user_id, p]))
    const rows = Array.from(latestByOther.entries()).map(([other_id, m]) => {
      const p = profById[other_id] || {}
      return {
        other_id,
        other_handle: p.handle || shortId(other_id),
        other_name: p.display_name || p.handle || shortId(other_id),
        last_body: m.body,
        last_at: m.created_at
      }
    }).sort((a,b) => new Date(b.last_at) - new Date(a.last_at))

    setThreads(rows)
  }

  async function openThread(t) {
    setSelected(t)
    setUnreadByUser(prev => ({ ...prev, [t.other_id]: 0 }))
    await loadThreadMessages(t.other_id)
    setOpen(true)
  }

  async function loadThreadMessages(otherId) {
    if (!me?.id || !otherId) return
    setLoadingThread(true)
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
      .order('created_at', { ascending: true })
      .limit(200)
    setLoadingThread(false)
    if (error) return
    setMessages(msgs || [])
    scrollToBottomSoon()
  }

  function scrollToBottomSoon() {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    })
  }

  async function sendMessage() {
    const body = (text || '').trim()
    if (!body || sending || !me?.id || !selected?.other_id) return
    setSending(true)
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: me.id,
          recipient_id: selected.other_id,
          body
        })
      if (error) throw error

      // optimistic append; realtime will also arrive for recipient
      const now = new Date().toISOString()
      setMessages(prev => [...prev, {
        id: `local-${now}`,
        sender_id: me.id,
        recipient_id: selected.other_id,
        body,
        created_at: now
      }])
      setText('')
      scrollToBottomSoon()

      // refresh thread ordering
      await loadRecentThreads()

      // analytics
      track('Message Sent', { length: body.length })
    } catch (e) {
      console.error(e)
      // (optional) surface an error toast if you want
    } finally {
      setSending(false)
    }
  }

  // open dock with most recent thread if user clicks floating button and none selected yet
  function handleOpenDock() {
    setOpen(true)
    if (!selected && threads.length > 0) {
      openThread(threads[0])
    }
  }

  // UI
  const unreadTotal = useMemo(
    () => Object.values(unreadByUser).reduce((a,b) => a + (b||0), 0),
    [unreadByUser]
  )

  if (!me?.id) return null // only render for signed-in users

  return (
    <>
      {/* Floating open button */}
      {!open && (
        <button
          className="btn btn-primary"
          onClick={handleOpenDock}
          style={fab}
          title="Open messages"
        >
          Messages
          {!!unreadTotal && <span style={dot} aria-label={`${unreadTotal} unread`} />}
        </button>
      )}

      {/* Dock */}
      {open && (
        <div style={dock}>
          <div style={dockHeader}>
            <div style={{ fontWeight: 800 }}>Messages</div>
            <button className="btn" onClick={() => setOpen(false)} title="Close">×</button>
          </div>

          <div style={dockBody}>
            {/* Threads sidebar */}
            <aside style={sidebar}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Recent</div>
              {threads.length === 0 && (
                <div className="muted">No conversations yet.</div>
              )}
              {threads.map(t => {
                const active = selected?.other_id === t.other_id
                const unread = unreadByUser[t.other_id] || 0
                return (
                  <button
                    key={t.other_id}
                    className="btn"
                    onClick={() => openThread(t)}
                    style={{
                      ...threadBtn,
                      ...(active ? threadBtnActive : {})
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      @{t.other_handle}{' '}
                      {unread > 0 && <span style={pill}>{unread}</span>}
                    </div>
                    <div className="muted" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth: '100%' }}>
                      {t.last_body}
                    </div>
                  </button>
                )
              })}
            </aside>

            {/* Messages pane */}
            <section style={pane}>
              {!selected ? (
                <div className="muted">Choose a conversation on the left to start chatting.</div>
              ) : (
                <>
                  <div style={paneHeader}>
                    <div>
                      <div style={{ fontWeight: 800 }}>@{selected.other_handle}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{selected.other_name}</div>
                    </div>
                  </div>

                  <div ref={listRef} style={messageList}>
                    {loadingThread && <div className="muted">Loading…</div>}
                    {messages.map(m => {
                      const mine = m.sender_id === me.id
                      return (
                        <div key={m.id} style={{ display:'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            ...bubble,
                            ...(mine ? bubbleMine : bubbleTheirs)
                          }}>
                            {m.body}
                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
                              {formatTime(m.created_at)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Composer */}
                  <div style={composer}>
                    <input
                      value={text}
                      onChange={(e)=>setText(e.target.value)}
                      placeholder="Type a message…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendMessage()
                        }
                      }}
                    />
                    <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !text.trim()}>
                      Send
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}

/* ===== Helpers & styles ===== */

function shortId(id='') {
  return id.slice(0,6)
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch { return '' }
}

const fab = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 1000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8
}

const dot = {
  display:'inline-block',
  width:10, height:10, borderRadius:6,
  background:'var(--secondary)'
}

const dock = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  width: 'min(960px, 96vw)',
  height: 'min(560px, 85vh)',
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column'
}

const dockHeader = {
  padding: 10,
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
}

const dockBody = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '280px 1fr',
  minHeight: 0 // so children can use overflow
}

const sidebar = {
  padding: 10,
  borderRight: '1px solid var(--border)',
  overflow: 'auto'
}

const threadBtn = {
  width: '100%',
  textAlign: 'left',
  display: 'grid',
  gap: 2,
  marginBottom: 8,
  borderRadius: 10
}

const threadBtnActive = {
  background: 'color-mix(in oklab, var(--primary), #ffffff 86%)',
  borderColor: 'var(--primary)'
}

const pill = {
  display:'inline-block',
  marginLeft: 6,
  fontSize: 10,
  padding: '2px 6px',
  background: 'var(--secondary)',
  color: '#fff',
  borderRadius: 999
}

const pane = {
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  minHeight: 0
}

const paneHeader = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  background: 'color-mix(in oklab, #fff, var(--bg) 30%)',
  position: 'sticky',
  top: 0,
  zIndex: 1
}

const messageList = {
  padding: 12,
  overflow: 'auto',
  background: 'linear-gradient(180deg, var(--bg-soft), #fff)'
}

const bubble = {
  maxWidth: '72%',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  margin: '6px 0'
}

const bubbleMine = {
  background: 'color-mix(in oklab, var(--primary), #ffffff 85%)',
  borderColor: 'var(--primary)'
}

const bubbleTheirs = {
  background: '#fff'
}

const composer = {
  padding: 10,
  borderTop: '1px solid var(--border)',
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8
}







