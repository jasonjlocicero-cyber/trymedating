import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * ChatDock (lean, production-friendly)
 * - Multiple chat windows (open/close/minimize)
 * - Fixed placement (bottom-right stack); simple & stable
 * - Inline messages (text + image/GIF attachments)
 * - Attach via paperclip button; preview before sending
 * - Uploads to Supabase Storage bucket "attachments" (public)
 * - Realtime new message inserts
 *
 * Requirements:
 * - Table public.messages has columns: id, sender, recipient, body, attachment_url, attachment_type, created_at
 * - Storage bucket named "attachments" (Public) with Insert/Update/Delete policies for authenticated users
 */

const DEF_W = 340
const DEF_H = 440
const EDGE_GAP = 16
const FOOTER_CLEAR = 120
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']

// tiny ping sound (optional)
const PING_DATA_URL =
  'data:audio/wav;base64,UklGRkSXAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YUTWAQAAgP8AAP8AgAAAAP8A/4AAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAAf/8AAP8A/4AAAP8AAAD/AAAA/wD/gAB///8AAAD/gAAA'

function ping() {
  try { const a = new Audio(PING_DATA_URL); a.volume = 0.35; a.play().catch(()=>{}) } catch {}
}

// -------- helpers -----------------------------------------------------------

function useMe() {
  const [me, setMe] = useState(null)
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
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])
  return me
}

async function fetchProfileByHandle(handle) {
  if (!handle) return null
  const { data } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .eq('handle', handle.toLowerCase())
    .maybeSingle()
  return data || null
}

async function fetchProfileByUserId(user_id) {
  if (!user_id) return null
  const { data } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, avatar_url')
    .eq('user_id', user_id)
    .maybeSingle()
  return data || null
}

// -------- ChatWindow --------------------------------------------------------

function ChatWindow({
  me, partner,
  minimized,
  onClose, onMinimize,
  width = DEF_W,
  height = DEF_H,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [attachFile, setAttachFile] = useState(null)
  const [attachPreview, setAttachPreview] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  const avatar = partner?.avatar_url || 'https://via.placeholder.com/28?text=%F0%9F%98%8A'
  const name = partner?.display_name || partner?.handle || 'Unknown'

  function resetAttachment() {
    setAttachFile(null)
    if (attachPreview) URL.revokeObjectURL(attachPreview)
    setAttachPreview('')
  }

  // Load history
  useEffect(() => {
    if (!me?.id || !partner?.user_id) return
    ;(async () => {
      setLoading(true); setError('')
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender, recipient, body, attachment_url, attachment_type, created_at')
        .or(`and(sender.eq.${me.id},recipient.eq.${partner.user_id}),and(sender.eq.${partner.user_id},recipient.eq.${me.id})`)
        .order('created_at', { ascending: true })
      if (error) setError(error.message || 'Failed to load messages.')
      setMessages(data || [])
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 0)
    })()
  }, [me?.id, partner?.user_id])

  // Realtime inserts
  useEffect(() => {
    if (!me?.id || !partner?.user_id) return
    const channel = supabase
      .channel(`dm:${[me.id, partner.user_id].sort().join(':')}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const m = payload.new
          const relevant =
            (m.sender === me.id && m.recipient === partner.user_id) ||
            (m.sender === partner.user_id && m.recipient === me.id)
          if (!relevant) return
          setMessages(prev => [...prev, m])
          if (m.sender === partner.user_id) ping()
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id, partner?.user_id])

  async function uploadAttachmentIfAny() {
    if (!attachFile || !me?.id) return { url: null, type: null }
    setIsUploading(true)
    try {
      const clean = attachFile.name.replace(/[^\w.\-]+/g, '_')
      const path = `user_${me.id}/${Date.now()}_${clean}`
      const { error: upErr } = await supabase
        .storage.from('attachments')
        .upload(path, attachFile, { cacheControl: '3600', upsert: false, contentType: attachFile.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('attachments').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('Could not get public URL')
      return { url: data.publicUrl, type: 'image' }
    } finally {
      setIsUploading(false)
      resetAttachment()
    }
  }

  async function send() {
    if ((!draft.trim()) && !attachFile) return
    if (!me?.id || !partner?.user_id) return

    let body = draft.trim().slice(0, 2000)
    setDraft('')

    let attachment_url = null
    let attachment_type = null
    try {
      if (attachFile) {
        const a = await uploadAttachmentIfAny()
        attachment_url = a.url
        attachment_type = a.type
      }
    } catch (e) {
      setError(e.message || 'Upload failed')
      return
    }

    const { error } = await supabase.from('messages').insert({
      sender: me.id,
      recipient: partner.user_id,
      body: body || null,
      attachment_url,
      attachment_type
    })
    if (error) setError(error.message)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div style={{
      width, height: minimized ? 56 : height,
      background:'#fff', border:'1px solid #ddd', borderRadius:12,
      boxShadow:'0 8px 24px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', overflow:'hidden'
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'8px 10px', background:'#f9fafb', borderBottom:'1px solid #eee'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src={avatar} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', border:'1px solid #eee' }} />
          <div style={{ fontWeight:700, fontSize:14 }}>
            {name} <span style={{ opacity:.7, fontWeight:400 }}>@{partner?.handle}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onMinimize} title={minimized?'Restore':'Minimize'} style={iconBtn}>—</button>
          <button onClick={onClose} title="Close" style={iconBtn}>×</button>
        </div>
      </div>

      {/* Minimized placeholder */}
      {minimized ? (
        <div style={{ padding:8, fontSize:12, color:'#777' }}>Conversation minimized</div>
      ) : (
        <>
          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:10, background:'#fafafa' }}>
            {loading && <div>Loading…</div>}
            {error && <div style={{ color:'#C0392B' }}>{error}</div>}
            {!loading && messages.length === 0 && <div style={{ opacity:.7 }}>Say hi 👋 (Tip: use the 📎 to attach an image)</div>}
            {messages.map(m => {
              const mine = m.sender === me?.id
              return (
                <div key={m.id} style={{ display:'flex', marginBottom:8, justifyContent: mine?'flex-end':'flex-start' }}>
                  <div style={{
                    maxWidth:'75%',
                    background: mine ? '#2A9D8F' : '#fff',
                    color: mine ? '#fff' : '#222',
                    border: mine ? 'none' : '1px solid #eee',
                    borderRadius:14, padding:'8px 12px'
                  }}>
                    {m.attachment_url && m.attachment_type === 'image' && (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ display:'block', marginBottom: m.body ? 8 : 0 }}>
                        <img src={m.attachment_url} alt="attachment" style={{ maxWidth:'100%', borderRadius:10, display:'block' }} loading="lazy" />
                      </a>
                    )}
                    {m.body && (
                      <div style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                        {m.body}
                      </div>
                    )}
                    <div style={{ fontSize:11, opacity:.7, marginTop:6 }}>
                      {new Date(m.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer (with paperclip) */}
          <div style={{
            borderTop:'1px solid #eee',
            padding:8,
            display:'flex', gap:8, alignItems:'center', background:'#fff'
          }}>
            {/* Attach */}
            <label
              title="Attach image (PNG/JPG/GIF/WebP)"
              style={{
                display:'inline-flex', alignItems:'center', gap:6,
                border:'1px solid #ddd', borderRadius:10, padding:'8px 10px',
                cursor:'pointer', userSelect:'none'
              }}
            >
              <span style={{ fontWeight:700 }}>Attach</span> <span aria-hidden>📎</span>
              <input
                type="file"
                accept={ACCEPT_TYPES.join(',')}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (!ACCEPT_TYPES.includes(file.type)) { setError('Unsupported file type'); return }
                  if (file.size > MAX_BYTES) { setError('File too large (max 5MB)'); return }
                  setAttachFile(file)
                  setAttachPreview(URL.createObjectURL(file))
                }}
                style={{ display:'none' }}
              />
            </label>

            {/* Preview */}
            {attachPreview && (
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f8f8f8', border:'1px solid #eee', borderRadius:8, padding:'4px 6px' }}>
                <img src={attachPreview} alt="preview" style={{ width:40, height:40, objectFit:'cover', borderRadius:6, border:'1px solid #ddd' }} />
                <button onClick={resetAttachment} style={chipBtn}>Remove</button>
                {isUploading && <span style={{ fontSize:12, opacity:.7 }}>Uploading…</span>}
              </div>
            )}

            {/* Input */}
            <input
              ref={inputRef}
              value={draft}
              onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
              placeholder={attachFile ? 'Add a caption…' : 'Type a message…'}
              style={{ flex:1, padding:10, borderRadius:10, border:'1px solid #ddd' }}
            />
            <button
              onClick={send}
              disabled={(!draft.trim() && !attachFile) || isUploading}
              style={sendBtn}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const iconBtn = {
  width:28, height:28,
  border:'1px solid #ddd', borderRadius:8, background:'#fff',
  cursor:'pointer', lineHeight:'24px', textAlign:'center'
}
const chipBtn = {
  padding:'6px 8px', border:'1px solid #ddd', borderRadius:6, background:'#fff', cursor:'pointer'
}
const sendBtn = {
  padding:'8px 12px', border:'none', borderRadius:10, background:'#2A9D8F', color:'#fff', fontWeight:700, cursor:'pointer'
}

// -------- ChatDock (window manager) ----------------------------------------

export default function ChatDock() {
  const me = useMe()
  const [windows, setWindows] = useState([]) // { key, partner, minimized }

  // Expose a global helper to open chats: window.trymeChat.open({ handle }) or ({ user_id })
  useEffect(() => {
    window.trymeChat = {
      open: async ({ handle, user_id } = {}) => {
        if (!me) { window.location.href = '/auth'; return }
        let prof = null
        if (user_id) prof = await fetchProfileByUserId(user_id)
        else if (handle) prof = await fetchProfileByHandle(handle)
        if (!prof?.user_id) return
        setWindows(prev => {
          if (prev.find(w => w.partner.user_id === prof.user_id)) return prev
          const key = `w-${prof.user_id}`
          return [...prev, { key, partner: prof, minimized: false }]
        })
      }
    }
    return () => { delete window.trymeChat }
  }, [me])

  function closeWindow(uid) {
    setWindows(prev => prev.filter(w => w.partner.user_id !== uid))
  }
  function toggleMinimize(uid) {
    setWindows(prev => prev.map(w => w.partner.user_id === uid ? { ...w, minimized: !w.minimized } : w))
  }

  // layout: stack windows from bottom-right, leftwards
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const rightStart = EDGE_GAP
  const topBase = EDGE_GAP
  const bottom = FOOTER_CLEAR + EDGE_GAP

  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex: 9999 }}>
      {windows.map((win, idx) => {
        const x = vw - (DEF_W + EDGE_GAP) * (idx + 1)
        const y = (typeof window !== 'undefined' ? window.innerHeight : 800) - (DEF_H + bottom)
        return (
          <div key={win.key}
               style={{ position:'fixed', pointerEvents:'auto', left: Math.max(x, EDGE_GAP), top: Math.max(y, topBase) }}>
            <ChatWindow
              me={me}
              partner={win.partner}
              minimized={win.minimized}
              onClose={() => closeWindow(win.partner.user_id)}
              onMinimize={() => toggleMinimize(win.partner.user_id)}
              width={DEF_W}
              height={DEF_H}
            />
          </div>
        )
      })}
    </div>
  )
}

