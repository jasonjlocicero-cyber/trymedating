// src/components/ChatLauncher.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ChatDock from './ChatDock';

// Small helper to fetch a display name/handle for a user id
async function fetchProfileName(userId) {
  if (!userId) return '';
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, handle, user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return '';
  return data.display_name || (data.handle ? `@${data.handle}` : '');
}

// Simple responsive helper
function useIsMobile(maxWidthPx = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = (e) => setIsMobile(e.matches);

    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [maxWidthPx]);

  return isMobile;
}

export default function ChatLauncher({ onUnreadChange = () => {} }) {
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState(null);
  const [partnerName, setPartnerName] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [recent, setRecent] = useState([]);
  const [err, setErr] = useState('');

  const isMobile = useIsMobile(640);

  // New-message toast (shows only when dock is closed)
  // shape: { fromId, fromName, text }
  const [toast, setToast] = useState(null);

  // ------- auth -------
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const canChat = !!(me?.id && partnerId);

  // Lock background scroll when chat is fullscreen on mobile
  useEffect(() => {
    if (!isMobile) return;
    if (!open || !canChat) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, canChat, isMobile]);

  // ------- global opener + event -------
  useEffect(() => {
    function openFromEvent(ev) {
      const d = ev?.detail || {};
      if (d.partnerId) {
        setPartnerId(d.partnerId);
        setPartnerName(d.partnerName || '');
      }
      setOpen(true);
    }
    window.addEventListener('open-chat', openFromEvent);
    window.openChat = function (id, name = '') {
      if (id) {
        setPartnerId(id);
        setPartnerName(name || '');
      }
      setOpen(true);
    };
    return () => window.removeEventListener('open-chat', openFromEvent);
  }, []);

  // ------- recent list when open -------
  useEffect(() => {
    let cancel = false;
    async function loadRecent() {
      if (!open || !me?.id) return;
      setLoadingList(true); setErr('');
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('sender, recipient, created_at')
          .or(`sender.eq.${me.id},recipient.eq.${me.id}`)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;

        const seen = new Set();
        const order = [];
        for (const m of data || []) {
          const other = m.sender === me.id ? m.recipient : m.sender;
          if (other && !seen.has(other)) { seen.add(other); order.push(other); }
          if (order.length >= 12) break;
        }
        if (!order.length) { if (!cancel) setRecent([]); return; }

        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, display_name, handle')
          .in('user_id', order);
        if (pErr) throw pErr;

        const rank = new Map(order.map((id, i) => [id, i]));
        const list = (profs || [])
          .map(p => ({ id: p.user_id, display_name: p.display_name || '', handle: p.handle || '' }))
          .sort((a,b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));

        if (!cancel) setRecent(list);
      } catch (e) {
        if (!cancel) setErr(e.message || 'Failed to load conversations');
      } finally {
        if (!cancel) setLoadingList(false);
      }
    }
    loadRecent();
    return () => { cancel = true; };
  }, [open, me?.id]);

  // ------- unread count -------
  async function computeUnread(userId) {
    if (!userId) { onUnreadChange(0); return; }
    const { data, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', userId)
      .is('read_at', null);
    if (error) return onUnreadChange(0);
    onUnreadChange(data?.length ?? 0);
  }

  useEffect(() => {
    computeUnread(me?.id);
  }, [me?.id]);

  // Live bump on any message change
  useEffect(() => {
    if (!me?.id) return;
    const channel = supabase
      .channel(`messages-unread-${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => computeUnread(me.id)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [me?.id]);

  // ------- new-message toast when dock is closed -------
  useEffect(() => {
    if (!me?.id) return;
    const ch = supabase
      .channel(`toast-${me.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me.id}` },
        async ({ new: m }) => {
          if (open) return; // don't toast if dock is open
          const name = await fetchProfileName(m.sender);
          setToast({
            fromId: m.sender,
            fromName: name || 'New message',
            text: m.body?.startsWith?.('[[file:') ? 'Attachment' : (m.body || 'Message')
          });
        }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [me?.id, open]);

  const inboxStyle = isMobile
    ? {
        position:'fixed',
        inset: 0,
        background:'#fff',
        border:'none',
        borderRadius: 0,
        boxShadow:'none',
        padding: 12,
        zIndex: 1201,
        display:'flex',
        flexDirection:'column'
      }
    : {
        position:'fixed', right:16, bottom:80, width:320, maxWidth:'calc(100vw - 24px)',
        background:'#fff', border:'1px solid var(--border)', borderRadius:12,
        boxShadow:'0 12px 32px rgba(0,0,0,0.12)', padding:12, zIndex:1001
      };

  const dockShellStyle = isMobile
    ? {
        position:'fixed',
        inset: 0,
        background:'#fff',
        zIndex: 1202,
        display:'flex',
        flexDirection:'column'
      }
    : {
        position:'fixed',
        right: 16,
        bottom: 80,
        width: 380,
        height: 540,
        maxHeight: 'calc(100vh - 120px)',
        background:'#fff',
        border:'1px solid var(--border)',
        borderRadius: 16,
        boxShadow:'0 12px 32px rgba(0,0,0,0.18)',
        zIndex: 1202,
        display:'flex',
        flexDirection:'column',
        overflow:'hidden'
      };

  const dockHeaderStyle = {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    gap: 10,
    padding:'10px 12px',
    borderBottom:'1px solid var(--border)',
    background:'#fff'
  };

  return (
    <>
      {/* Floating launcher button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Messages"
        aria-label="Messages"
        style={{
          position:'fixed', right:16, bottom:16,
          width:56, height:56, borderRadius:'50%',
          border:'1px solid var(--border)', background:'#fff',
          boxShadow:'0 10px 24px rgba(0,0,0,0.12)',
          display:'grid', placeItems:'center', zIndex: 1000, cursor:'pointer'
        }}
      >
        <span style={{ fontSize:24 }}>💬</span>
      </button>

      {/* Inbox picker */}
      {open && !partnerId && (
        <div style={inboxStyle}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:800 }}>Messages</div>
            <button
              className="btn btn-neutral"
              onClick={() => setOpen(false)}
              style={{ padding:'4px 8px' }}
            >
              ✕
            </button>
          </div>

          {!me?.id && <div className="helper-error">Sign in to message.</div>}

          {me?.id && (
            <>
              <div className="helper-muted" style={{ marginBottom:8 }}>
                Pick a recent chat:
              </div>

              {err && <div className="helper-error" style={{ marginBottom:8 }}>{err}</div>}
              {loadingList && <div className="muted">Loading…</div>}
              {!loadingList && recent.length === 0 && (
                <div className="muted">No conversations yet. Open someone’s profile to start a chat.</div>
              )}

              <ul style={{
                listStyle:'none',
                padding:0,
                margin:0,
                maxHeight: isMobile ? 'calc(100vh - 120px)' : 220,
                overflowY:'auto'
              }}>
                {recent.map(p => (
                  <li key={p.id}>
                    <button
                      className="btn btn-neutral"
                      style={{ width:'100%', justifyContent:'flex-start', marginBottom:6 }}
                      onClick={() => {
                        setPartnerId(p.id);
                        setPartnerName(p.display_name || (p.handle ? `@${p.handle}` : 'Friend'));
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

      {/* New-message toast (bottom-left) */}
      {toast && (
        <div
          role="alert"
          style={{
            position:"fixed", left:16, bottom:16, zIndex:1100,
            background:"#111827", color:"#fff", padding:"10px 12px",
            borderRadius:10, boxShadow:"0 10px 24px rgba(0,0,0,.2)", maxWidth:280
          }}
        >
          <div style={{ fontWeight:800, marginBottom:4 }}>{toast.fromName}</div>
          <div style={{ opacity:.9, marginBottom:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {toast.text}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button
              className="btn btn-primary"
              onClick={() => { setPartnerId(toast.fromId); setOpen(true); setToast(null); }}
            >
              Open
            </button>
            <button className="btn btn-neutral" onClick={() => setToast(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Chat window (desktop popup + mobile fullscreen) */}
      {open && canChat && (
        <div style={dockShellStyle} role="dialog" aria-label="Chat">
          <div style={dockHeaderStyle}>
            <div style={{
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {partnerName ? `Chat • ${partnerName}` : 'Chat'}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => setPartnerId(null)}
                style={{ padding:'6px 10px' }}
                title="Back to conversations"
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => { setOpen(false); setPartnerId(null); }}
                style={{ padding:'6px 10px' }}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* IMPORTANT: pass peerId (ChatDock expects peerId) */}
            <ChatDock peerId={partnerId} variant="panel" />
          </div>
        </div>
      )}
    </>
  );
}



