// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ReportModal from '../components/ReportModal'

const toId = (v) => (typeof v === 'string' ? v : v?.id ? String(v.id) : '')
const STATUS = { ACCEPTED: 'accepted', PENDING: 'pending', REJECTED: 'rejected', DISCONNECTED: 'disconnected' }
const pill = (txt, bg) => (
  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: '#111' }}>
    {txt}
  </span>
)
const otherPartyId = (row, myId) => (row?.requester_id === myId ? row?.addressee_id : row?.requester_id)

export default function Connections() {
  const nav = useNavigate()

  const [me, setMe] = useState(null)
  const myId = toId(me?.id)

  const [rows, setRows] = useState([])
  const [blockedSet, setBlockedSet] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [reportOpen, setReportOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState({ id: '', label: '' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (alive) setMe(data?.user ?? null)
    })()
    return () => { alive = false }
  }, [])

  const loadBlocks = async (uid) => {
    if (!uid) return
    const { data, error } = await supabase
      .from('blocks')
      .select('blocked')
      .eq('blocker', uid)

    if (!error && data) setBlockedSet(new Set(data.map((r) => r.blocked)))
  }

  const loadConnections = async (uid) => {
    if (!uid) { setRows([]); return }
    const { data: conns, error } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (error) { console.error(error); setRows([]); return }
    if (!conns?.length) { setRows([]); return }

    const partnerIds = Array.from(new Set(conns.map((r) => otherPartyId(r, uid)).filter(Boolean)))

    const { data: profs } = await supabase
      .from('profiles')
      .select('id, user_id, handle, display_name, full_name, avatar_url, photo_url')
      .in('id', partnerIds)

    const byId = new Map()
    for (const p of profs || []) {
      byId.set(p.id ?? p.user_id, p)
    }

    const enriched = conns.map((c) => {
      const pid = otherPartyId(c, uid)
      const p = byId.get(pid) || {}
      const name =
        p.display_name ||
        p.full_name ||
        p.handle ||
        (pid ? `${String(pid).slice(0, 4)}…${String(pid).slice(-4)}` : 'Unknown')
      const avatar = p.avatar_url || p.photo_url || ''
      const handle = p.handle || ''
      return { ...c, _other_id: pid, _other_profile: { name, handle, avatar } }
    })

    setRows(enriched)
  }

  useEffect(() => {
    if (!myId) return
    loadConnections(myId)
    loadBlocks(myId)
    const id = setInterval(() => { loadConnections(myId); loadBlocks(myId) }, 4000)
    return () => clearInterval(id)
  }, [myId])

  const goChat = (peerId) => nav(`/chat/${peerId}`)

  const disconnect = async (connId) => {
    setBusyId(connId)
    try {
      await supabase.from('connections').update({ status: STATUS.DISCONNECTED, updated_at: new Date().toISOString() }).eq('id', connId)
      await loadConnections(myId)
    } finally { setBusyId(null) }
  }
  const reconnect = async (connId) => {
    setBusyId(connId)
    try {
      await supabase.from('connections').update({ status: STATUS.PENDING, updated_at: new Date().toISOString() }).eq('id', connId)
      await loadConnections(myId)
    } finally { setBusyId(null) }
  }

  const block = async (otherId) => {
    setBusyId(otherId)
    try {
      const { error } = await supabase.from('blocks').insert({ blocker: myId, blocked: otherId })
      if (error && error.code !== '23505') throw error
      await loadBlocks(myId)
    } finally { setBusyId(null) }
  }
  const unblock = async (otherId) => {
    setBusyId(otherId)
    try {
      await supabase.from('blocks').delete().eq('blocker', myId).eq('blocked', otherId)
      await loadBlocks(myId)
    } finally { setBusyId(null) }
  }

  const deleteConversation = async (connId, otherId) => {
    if (!blockedSet.has(otherId)) return
    if (!window.confirm('Delete this conversation for you? This cannot be undone.')) return
    setBusyId(connId)
    try {
      await supabase
        .from('messages')
        .delete()
        .eq('connection_id', connId)
        .or(`sender.eq.${myId},recipient.eq.${myId}`)
      await supabase.from('connections').update({ status: STATUS.DISCONNECTED, updated_at: new Date().toISOString() }).eq('id', connId)
      await loadConnections(myId)
    } finally { setBusyId(null) }
  }

  const openReport = (id, label) => {
    setReportTarget({ id, label })
    setReportOpen(true)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'accepted' && r.status !== STATUS.ACCEPTED) return false
      if (filter === 'pending' && r.status !== STATUS.PENDING) return false
      if (filter === 'rejected' && r.status !== STATUS.REJECTED) return false
      if (filter === 'disconnected' && r.status !== STATUS.DISCONNECTED) return false
      if (filter === 'blocked' && !blockedSet.has(r._other_id)) return false
      if (!q) return true
      const { name, handle } = r._other_profile || {}
      return (
        (name && name.toLowerCase().includes(q)) ||
        (handle && handle.toLowerCase().includes(q)) ||
        (r._other_id && String(r._other_id).toLowerCase().includes(q))
      )
    })
  }, [rows, filter, search, blockedSet])

  const counts = useMemo(() => ({
    all: rows.length,
    accepted: rows.filter((r) => r.status === STATUS.ACCEPTED).length,
    pending: rows.filter((r) => r.status === STATUS.PENDING).length,
    rejected: rows.filter((r) => r.status === STATUS.REJECTED).length,
    disconnected: rows.filter((r) => r.status === STATUS.DISCONNECTED).length,
    blocked: rows.filter((r) => blockedSet.has(r._other_id)).length
  }), [rows, blockedSet])

  return (
    <div className="container" style={{ padding: 20, maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Connections</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn-neutral" to="/invite">My Invite QR</Link>
          <Link className="btn btn-primary" to="/chat">Open Messages</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, marginBottom: 10 }}>
        {[
          ['all', `All ${counts.all}`],
          ['accepted', `Accepted ${counts.accepted}`],
          ['pending', `Pending ${counts.pending}`],
          ['rejected', `Rejected ${counts.rejected}`],
          ['disconnected', `Disconnected ${counts.disconnected}`],
          ['blocked', `Blocked ${counts.blocked}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="btn btn-pill"
            style={{
              border: '1px solid var(--border)',
              background: filter === key ? '#d1fae5' : '#fff',
              fontWeight: 700
            }}
          >
            {label}
          </button>
        ))}
        <input
          placeholder="Search by handle or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '10px 14px',
            minWidth: 260
          }}
        />
      </div>

      {/* List */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 6 }}>
        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 18 }}>No matches. Try a different filter or search.</div>
        ) : (
          filtered.map((r) => {
            const other = r._other_profile || {}
            const otherId = r._other_id
            const isBlocked = blockedSet.has(otherId)
            const isAccepted = r.status === STATUS.ACCEPTED

            return (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 1fr) auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)'
                }}
              >
                {/* Left: avatar + name/handle + status pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: '50%',
                      border: '1px solid var(--border)', overflow: 'hidden',
                      display: 'grid', placeItems: 'center', background: '#fff', flex: '0 0 auto'
                    }}
                  >
                    {other.avatar ? (
                      <img src={other.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ fontWeight: 800, color: '#065f46' }}>
                        {(other.name || other.handle || 'U').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {other.name}
                    </div>
                    <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {other.handle ? `@${other.handle}` : otherId}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                    {r.status === STATUS.ACCEPTED && pill('Accepted', '#bbf7d0')}
                    {r.status === STATUS.PENDING && pill('Pending', '#fde68a')}
                    {r.status === STATUS.REJECTED && pill('Rejected', '#fecaca')}
                    {r.status === STATUS.DISCONNECTED && pill('Disconnected', '#e5e7eb')}
                    {isBlocked && pill('Blocked by you', '#fee2e2')}
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {/* Report is always available */}
                  <button className="btn btn-neutral" onClick={() => openReport(otherId, other.name || other.handle || otherId)}>
                    Report
                  </button>

                  {isAccepted ? (
                    <>
                      <button className="btn btn-primary" onClick={() => goChat(otherId)} disabled={busyId === r.id}>
                        Message
                      </button>
                      <button className="btn btn-danger" onClick={() => disconnect(r.id)} disabled={busyId === r.id}>
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-neutral" onClick={() => reconnect(r.id)} disabled={busyId === r.id}>
                        Reconnect
                      </button>
                    </>
                  )}

                  {!isBlocked ? (
                    <button className="btn btn-neutral" onClick={() => block(otherId)} disabled={busyId === otherId}>
                      Block
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-neutral" onClick={() => unblock(otherId)} disabled={busyId === otherId}>
                        Unblock
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => deleteConversation(r.id, otherId)}
                        disabled={busyId === r.id}
                        title="Shown only when you've blocked this person"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Report Modal */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetId={reportTarget.id}
        targetLabel={reportTarget.label}
      />
    </div>
  )
}






