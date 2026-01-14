// src/App.jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { ChatProvider } from './chat/ChatContext'

// Layout
import Header from './components/Header'
import Footer from './components/Footer'
import ChatLauncher from './components/ChatLauncher'

// PWA buttons / nudges
import InstallPWAButton from './components/InstallPWAButton'
import InstallNudgeMobile from './components/InstallNudgeMobile'

// Desktop deep links (Electron)
import useDesktopDeepLinks from './desktop/useDesktopDeepLinks'

// Pages
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'
import Contact from './pages/Contact'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import InviteQR from './pages/InviteQR'
import DebugQR from './pages/DebugQR'
import Connections from './pages/Connections'
import Report from './pages/Report'
import AdminReports from './pages/AdminReports'
import BuyWristband from './pages/BuyWristband'
import PurchaseSuccess from './pages/PurchaseSuccess'
import PurchaseCancel from './pages/PurchaseCancel'

// Components/Routes
import ConnectionToast from './components/ConnectionToast'
import Connect from './routes/Connect'

const PENDING_CONNECT_KEY = 'tmd_pending_connect'

function Home({ me }) {
  const authed = !!me?.id

  return (
    <div style={{ background: '#fff' }}>
      <section style={{ padding: '52px 0 36px', borderBottom: '1px solid var(--border)' }}>
        <div
          className="container"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 18,
            textAlign: 'center',
            maxWidth: 920
          }}
        >
          <h1
            style={{
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1.1,
              margin: '0 auto'
            }}
          >
            Welcome to{' '}
            <span style={{ color: 'var(--brand-teal)' }}>Try</span>
            <span style={{ color: 'var(--brand-teal)' }}>Me</span>
            <span style={{ color: 'var(--brand-coral)' }}>Dating</span>
          </h1>

          <p className="muted" style={{ margin: '0 auto', maxWidth: 760, fontSize: 16 }}>
            Meet intentionally. Share your invite with a QR code and connect only with people
            you’ve actually met. No endless swiping—just real conversations with people you trust.
          </p>

          {/* CTA row */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 4
            }}
          >
            {!authed ? (
              <>
                <Link className="btn btn-primary btn-pill" to="/auth">Sign in / Sign up</Link>
                <a className="btn btn-accent btn-pill" href="#how-it-works">How it works</a>
                <InstallPWAButton />
              </>
            ) : (
              <>
                <Link className="btn btn-primary btn-pill" to="/profile">Go to Profile</Link>
                <Link className="btn btn-primary btn-pill" to="/buy">Buy wristband</Link>
                <Link className="btn btn-accent btn-pill" to="/connections">Connections</Link>
                <Link className="btn btn-accent btn-pill" to="/invite">My Invite QR</Link>
                <InstallPWAButton />
              </>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 8
            }}
          >
            <div className="helper-muted">Private 1:1 messages</div>
            <div className="helper-muted">You control who can find you</div>
            <div className="helper-muted">No public browsing of strangers</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" style={{ padding: '28px 0' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="home-section-title" style={{ fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>
            How it works
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            <FeatureCard title="Create" text="Set up a simple profile with your name and a short intro. Choose if it’s public." icon="🧩" />
            <FeatureCard title="Share" text="Show your personal QR code to people you’ve met in real life to invite them." icon="🔗" />
            <FeatureCard title="Match" text="You both must accept—this isn’t a browse-everyone app; it’s about real connections." icon="🤝" />
            <FeatureCard title="Message" text="Keep it private and focused with clean, simple 1:1 messaging (no noise, no spam)." icon="💬" />
          </div>
        </div>
      </section>

      <section
        style={{
          padding: '18px 0',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          background: '#fbfbfb'
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            flexWrap: 'wrap',
            textAlign: 'center'
          }}
        >
          <span style={{ fontWeight: 700 }}>Your pace. Your privacy.</span>
          <span className="muted">Turn public off anytime • Block/report if needed • No public search</span>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ title, text, icon }) {
  return (
    <div className="card" style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 16,
      background: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
          background: '#f8fafc', border: '1px solid var(--border)', fontSize: 16
        }} aria-hidden>
          <span>{icon}</span>
        </div>
        <div style={{ fontWeight: 800 }}>{title}</div>
      </div>
      <div className="muted" style={{ lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}

/**
 * Auth-resilient connect gate:
 * - If /connect is opened while logged out (common on iOS QR scan),
 *   stash the exact /connect?... URL and send the user to /auth.
 * - After login, App will auto-resume the saved /connect U*



































