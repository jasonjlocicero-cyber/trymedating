// src/components/FeedbackModal.jsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const OWNER_EMAIL = 'you@yourdomain.com' // TODO: change to your inbox

export default function FeedbackModal({ open, onClose }) {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!open) return
    setUrl(window.location.href)
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email || '')
    })()
  }, [open])

  if (!open) return null

  const disabled = !message.trim()

  function handleSubmit(e) {
    e.preventDefault()
    if (disabled) return
    const subject = encodeURIComponent(`TryMeDating feedback: ${category}`)
    const body = encodeURIComponent(
      `From: ${email || '(anonymous)'}\nPage: ${url}\n\n${message.trim()}`
    )
    window.location.href = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`
    onClose?.()
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e)=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
          <h3 style={{margin:0}}>Send feedback</h3>
          <button className="btn" onClick={onClose} title="Close">×</button>
        </div>

        <form onSubmit={handleSubmit} style={{display:'grid', gap:12}}>
          <div>
            <label style={label}>Your email (optional)</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
          </div>

          <div>
            <label style={label}>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={select}>
              <option value="general">General</option>
              <option value="bug">Bug</option>
              <option value="confusing">Confusing</option>
              <option value="feature">Feature request</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label style={label}>Message</label>
            <textarea
              rows={5}
              value={message}
              onChange={e=>setMessage(e.target.value)}
              placeholder="What should we improve? What felt confusing? What did you expect?"
              style={{resize:'vertical'}}
            />
            <div className="muted" style={{marginTop:4, fontSize:12}}>
              Current page: {url}
            </div>
          </div>

          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:4}}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={disabled}>Send</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const overlay = {
  position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'grid', placeItems:'center', zIndex:1000
}
const modal = {
  width:'min(640px, 92vw)', background:'#fff', border:'1px solid var(--border)', borderRadius:12, padding:16,
  boxShadow:'0 8px 24px rgba(0,0,0,0.18)'
}
const label = { fontWeight:700, display:'block', marginBottom:4 }
const select = { width:'100%', padding:'8px', border:'1px solid var(--border)', borderRadius:6 }
