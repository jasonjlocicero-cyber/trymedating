// src/components/InterestsPicker.jsx
import React, { useMemo, useState } from 'react'

const DEFAULT_OPTIONS = [
  'hiking','travel','fitness','yoga','cooking','baking','foodie','coffee',
  'movies','tv','anime','gaming','board games','music','concerts','art',
  'photography','reading','writing','poetry','coding','startups','finance',
  'fashion','sneakers','sports','soccer','basketball','football','tennis',
  'outdoors','camping','beach','dogs','cats','volunteering','languages'
]

export default function InterestsPicker({ value = [], onChange, max = 8 }) {
  const [input, setInput] = useState('')
  const options = useMemo(() => DEFAULT_OPTIONS, [])

  function addTag(tag) {
    const t = sanitize(tag)
    if (!t) return
    if (value.includes(t)) return
    if (value.length >= max) return
    onChange?.([...value, t])
    setInput('')
  }

  function removeTag(tag) {
    onChange?.(value.filter(v => v !== tag))
  }

  const filtered = options
    .filter(o => !value.includes(o))
    .filter(o => !input ? true : o.includes(sanitize(input)))
    .slice(0, 10)

  return (
    <div className="card" style={{ display:'grid', gap: 10 }}>
      <div style={{ fontWeight: 800 }}>Interests <span className="muted">(pick up to {max})</span></div>

      {/* Selected chips */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {value.map(tag => (
          <span key={tag} style={{
            display:'inline-flex', alignItems:'center', gap:6,
            padding:'6px 10px', borderRadius:9999, border:'1px solid var(--border)'
          }}>
            #{tag}
            <button className="btn" type="button" onClick={()=>removeTag(tag)} title="Remove" style={{ padding:'2px 6px' }}>×</button>
          </span>
        ))}
        {value.length === 0 && <span className="muted">No interests yet.</span>}
      </div>

      {/* Add field */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          placeholder="Type an interest (e.g., hiking) and press Add"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input) } }}
        />
        <button className="btn" type="button" onClick={()=>addTag(input)} disabled={!sanitize(input) || value.length>=max}>
          Add
        </button>
      </div>

      {/* Quick suggestions */}
      {filtered.length > 0 && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {filtered.map(opt => (
            <button key={opt} type="button" className="btn"
              onClick={()=>addTag(opt)} disabled={value.length>=max}>
              #{opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function sanitize(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // keep letters/numbers/spaces/hyphen
    .replace(/\s+/g, ' ')           // collapse spaces
    .replace(/\s/g, '-')            // spaces -> hyphen
    .slice(0, 24)
}
