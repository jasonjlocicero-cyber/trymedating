// src/pages/InviteQR.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import QRShareCard from '../components/QRShareCard';

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        setMe(user || null);
        if (!user?.id) { setLoading(false); return; }

        const { data, error } = await supabase
          .from('profiles')
          .select('user_id, handle, is_public, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;
        setProfile(data || null);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || 'Failed to load profile.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (!me?.id) {
    return (
      <div className="container" style={{ padding: '28px 0' }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
        <div className="muted" style={{ marginBottom: 12 }}>Please sign in to view your invite.</div>
        <Link className="btn btn-primary" to="/auth">Sign in</Link>
      </div>
    );
  }

  const hasAvatar = !!(profile?.avatar_url && String(profile.avatar_url).trim());
  const isPublic = !!profile?.is_public;

  if (!hasAvatar || !isPublic) {
    return (
      <div className="container" style={{ padding: '28px 0', maxWidth: 720 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            background: '#fff'
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Almost there — add a face photo and make your profile public
          </div>
          <div className="helper-muted">
            To share a QR invite, your profile must include a face photo and be set to public.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Link className="btn btn-primary" to="/profile">Go to Profile</Link>
            <Link className="btn btn-neutral" to={`/u/${profile?.handle || ''}`} target="_blank" rel="noopener noreferrer">
              View Public Page
            </Link>
          </div>
        </div>
        {err && <div className="helper-error" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    );
  }

  // OK: we can show the QR
  const inviteUrl = `${window.location.origin}/connect?to=@${profile?.handle || ''}`;

  return (
    <div className="container" style={{ padding: '28px 0', maxWidth: 720 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Show this QR to someone you’ve just met so they can view your public profile and request a connection.
      </p>

      <div style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 240 }}>
          <QRShareCard
            link={inviteUrl}
            title="Scan to connect"
          />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <Link className="btn btn-neutral" to={`/u/${profile?.handle || ''}`} target="_blank" rel="noopener noreferrer">
          Public Profile
        </Link>
      </div>
    </div>
  );
}







