// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function Pill({ children, tone = 'neutral' }) {
  const colors = {
    neutral: '#e5e7eb',
    good: '#bbf7d0',
    warn: '#fde68a',
    bad: '#fecaca'
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: colors[tone] || colors.neutral,
        fontSize: 12,
        fontWeight: 700,
        color: '#111',
      }}
    >
      {children}
    </span>
  );
}

export default function Connections() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all'); // all | accepted | pending | rejected | disconnected | blocked
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user || null);
    })();
  }, []);

  async function load() {
    setLoading(true);

    // Fetch each counterpart user once; include whether I blocked them (blocked_by_me) and latest status
    // This uses DISTINCT ON to keep the most recent connection row between us
    const { data, error } = await supabase.rpc('exec_sql', {
      // NOTE: exec_sql is not a real RPC; if you don't have one, keep the prior
      // select pattern you used; otherwise, create a view. For most users, use from() with
      // filters & joins. Here we keep things simple and stick to a REST-friendly query:
    });

    // Fallback: REST approach — get my counterpart IDs, their latest connection row,
    // and whether I blocked them.
    const my = (await supabase.auth.getUser()).data?.user?.id;

    // 1) grab latest connection per pair (me <-> other)
    const { data: latest } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${my},addressee_id.eq.${my}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    // keep only first occurrence per counterpart
    const seen = new Set();
    const latestPer = [];
    for (const r of latest || []) {
      const other = r.requester_id === my ? r.addressee_id : r.requester_id;
      if (seen.has(other)) continue;
      seen.add(other);
      latestPer.push({ ...r, other_id: other });
    }

    // 2) hydrate counterpart profile info
    const otherIds = latestPer.map(r => r.other_id);
    let profMap = {};
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .in('id', otherIds);
      (profs || []).forEach(p => { profMap[p.id] = p; });
    }

    // 3) figure out "blocked_by_me"
    let blockedMap = {};
    if (otherIds.length) {
      const { data: blocked } = await supabase
        .from('blocks')
        .select('blocked')
        .eq('blocker', my)
        .in('blocked', otherIds);
      (blocked || []).forEach(b => { blockedMap[b.blocked] = true; });
    }

    const combined = latestPer.map(r => {
      const p = profMap[r.other_id] || {};
      return {
        connection_id: r.id,
        other_id: r.other_id,
        status: r.status,
        name: p.display_name || p.handle || r.other_id.slice(0, 8),
        handle: p.handle || '',
        avatar_url: p.avatar_url || '',
        blocked_by_me: !!blockedMap[r.other_id],
      };
    });

    setRows(combined);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let arr = rows;
    if (filter !== 'all') {
      if (filter === 'blocked') {
        arr = arr.filter(r => r.blocked_by_me);
      } else {
        arr = arr.filter(r => r.status === filter);
      }
    }
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      arr = arr.filter(r => (r.name || '').toLowerCase().includes(qq) || (r.handle || '').toLowerCase().includes(qq));
    }
    return arr;
  }, [rows, filter, q]);

  async function reconnect(row) {
    setBusyId(row.other_id);
    try {
      await supabase
        .from('connections')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', row.connection_id);
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function disconnect(row) {
    setBusyId(row.other_id);
    try {
      await supabase
        .from('connections')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('id', row.connection_id);
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function block(row) {
    setBusyId(row.other_id);
    try {
      await supabase.from('blocks').insert({ blocker: me.id, blocked: row.other_id });
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function unblock(row) {
    setBusyId(row.other_id);
    try {
      await supabase.from('blocks')
        .delete()
        .eq('blocker', me.id)
        .eq('blocked', row.other_id);
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function deleteChat(row) {
    if (!row.blocked_by_me) return;
    const ok = window.confirm(`Delete the entire chat with ${row.name}? This cannot be undone.`);
    if (!ok) return;
    setBusyId(row.other_id);
    try {
      const { error } = await supabase.rpc('delete_conversation', { peer: row.other_id });
      if (error) throw error;
      await load();
      alert('Conversation deleted.');
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusyId('');
    }
  }

  const count = (key) =>
    key === 'blocked' ? rows.filter(r => r.blocked_by_me).length
      : key === 'all' ? rows.length
      : rows.filter(r => r.status === key).length;

  return (
    <div className="container" style={{ padding: 16, maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Connections</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-neutral btn-pill" to="/invite">My Invite QR</Link>
          <Link className="btn btn-primary btn-pill" to="/chat">Open Messages</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          ['all', 'All'],
          ['accepted', 'Accepted'],
          ['pending', 'Pending'],
          ['rejected', 'Rejected'],
          ['disconnected', 'Disconnected'],
          ['blocked', 'Blocked'],
        ].map(([k, label]) => (
          <button
            key={k}
            className="btn btn-pill"
            onClick={() => setFilter(k)}
            style={{
              background: filter === k ? 'var(--brand-teal)' : '#f3f4f6',
              color: filter === k ? '#fff' : '#111827',
              border: '1px solid #e5e7eb',
              fontWeight: 800
            }}
          >
            {label} <span style={{ opacity: .7, marginLeft: 6 }}>{count(k)}</span>
          </button>
        ))}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by handle or name…"
          style={{
            marginLeft: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '8px 12px',
            minWidth: 240
          }}
        />
      </div>

      {/* List */}
      <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }} className="muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">No matches</div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.other_id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: 12,
                borderTop: '1px solid var(--border)'
              }}
            >
              {/* avatar */}
              <div
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '1px solid var(--border)', overflow: 'hidden',
                  display: 'grid', placeItems: 'center', background: '#fff'
                }}
              >
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ fontWeight: 800 }}>{(r.name || '?').slice(0, 1)}</div>
                )}
              </div>

              {/* name + status */}
              <div>
                <div style={{ fontWeight: 800 }}>
                  {r.name}
                  {r.handle ? <span className="muted" style={{ marginLeft: 8 }}>@{r.handle}</span> : null}
                </div>
                <div style={{ marginTop: 4 }}>
                  {r.status === 'accepted' && <Pill tone="good">Accepted</Pill>}
                  {r.status === 'pending' && <Pill tone="warn">Pending</Pill>}
                  {r.status === 'rejected' && <Pill tone="bad">Rejected</Pill>}
                  {r.status === 'disconnected' && <Pill>Disconnected</Pill>}
                  {r.blocked_by_me && <span style={{ marginLeft: 8 }}><Pill tone="bad">Blocked</Pill></span>}
                </div>
              </div>

              {/* actions */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.status === 'accepted' ? (
                  <Link className="btn btn-primary btn-pill" to={`/chat/${r.other_id}`}>Message</Link>
                ) : null}
                {r.status === 'accepted' && (
                  <button
                    className="btn btn-accent btn-pill"
                    disabled={busyId === r.other_id}
                    onClick={() => disconnect(r)}
                  >
                    Disconnect
                  </button>
                )}

                {/* Block / Unblock */}
                {!r.blocked_by_me ? (
                  <button
                    className="btn btn-neutral btn-pill"
                    disabled={busyId === r.other_id}
                    onClick={() => block(r)}
                  >
                    Block
                  </button>
                ) : (
                  <button
                    className="btn btn-neutral btn-pill"
                    disabled={busyId === r.other_id}
                    onClick={() => unblock(r)}
                  >
                    Unblock
                  </button>
                )}

                {/* Reconnect (for rejected/disconnected) */}
                {(r.status === 'rejected' || r.status === 'disconnected') && (
                  <button
                    className="btn btn-primary btn-pill"
                    disabled={busyId === r.other_id}
                    onClick={() => reconnect(r)}
                  >
                    Reconnect
                  </button>
                )}

                {/* DELETE CHAT — only if I blocked them */}
                {r.blocked_by_me && (
                  <button
                    className="btn btn-accent btn-pill"
                    style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                    disabled={busyId === r.other_id}
                    onClick={() => deleteChat(r)}
                    title="Delete entire conversation (requires block)"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}




