import React, { Suspense, lazy } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'

// Lazy imports (your pages must exist)
const AuthPage = lazy(() => import('./pages/AuthPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))

// Simple brand colors
const C = {
  coral: '#FF6B6B',
  teal: '#007A7A',
  sand: '#F4EDE4',
  ink: '#1f2937',
}

function NavBar() {
  const nav = useNavigate()
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      backdropFilter: 'blur(6px)', background: 'rgba(255,255,255,.85)',
      borderBottom: `1px solid ${C.sand}`
    }}>
      <nav style={{
        maxWidth: 1100, margin: '0 auto', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px'
      }}>
        <Link to="/" style={{ textDecoration: 'none', fontWeight: 800, color: C.teal, fontSize: 18 }}>
          TryMe<span style={{ color: C.coral }}>Dating</span>
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link to="/#how" style={{ color: C.ink, textDecoration: 'none' }}>How it works</Link>
          <Link to="/#community" style={{ color: C.ink, textDecoration: 'none' }}>Community</Link>
          <Link to="/#faqs" style={{ color: C.ink, textDecoration: 'none' }}>FAQs</Link>
          <button
            onClick={() => nav('/auth')}
            style={{
              padding: '10px 14px', borderRadius: 10, border: 'none',
              background: C.coral, color: '#fff', cursor: 'pointer', fontWeight: 700
            }}
          >
            Sign up
          </button>
        </div>
      </nav>
    </div>
  )
}

function Footer() {
  return (
    <footer style={{ background: C.sand, borderTop: `1px solid ${C.sand}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 18px', color: C.ink }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, color: C.teal }}>TryMe<span style={{ color: C.coral }}>Dating</span></div>
          <div style={{ display: 'flex', gap: 14, fontSize: 14, opacity: .85 }}>
            <a href="/#about" style={{ color: C.ink, textDecoration: 'none' }}>About</a>
            <a href="/#faqs" style={{ color: C.ink, textDecoration: 'none' }}>FAQs</a>
            <a href="/#community" style={{ color: C.ink, textDecoration: 'none' }}>Community</a>
            <Link to="/settings" style={{ color: C.ink, textDecoration: 'none' }}>Settings</Link>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: .7 }}>
          © {new Date().getFullYear()} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

function Home() {
  const nav = useNavigate()
  return (
    <div>
      {/* Hero */}
      <header style={{ background: '#fff' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '56px 18px',
          display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, alignItems: 'center'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1, color: C.ink }}>
              Dating, the <span style={{ color: C.coral }}>warmer</span> way.
            </h1>
            <p style={{ marginTop: 12, fontSize: 18, opacity: .85, color: C.ink }}>
              Meet new people naturally with a wristband that lets others know you’re open to connection.
            </p>
            <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => nav('/profile')}
                style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: C.teal, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Get your wristband
              </button>
              <button
                onClick={() => nav('/auth')}
                style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${C.teal}`, background: '#fff', color: C.teal, fontWeight: 700, cursor: 'pointer' }}
              >
                Join the community
              </button>
            </div>
          </div>
          <div style={{ border: `1px solid ${C.sand}`, borderRadius: 14, padding: 16 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.teal }}>12k+</div>
                <div style={{ opacity: .7 }}>Wristband scans</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.teal }}>1.2k</div>
                <div style={{ opacity: .7 }}>Stories shared</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.teal }}>45</div>
                <div style={{ opacity: .7 }}>Cities active</div>
              </div>
            </div>
            <ul style={{ marginTop: 12, paddingLeft: 18, color: C.ink, opacity: .9 }}>
              <li>Privacy-first profiles</li>
              <li>Warm, real-world intros</li>
              <li>Tap/scan to connect</li>
            </ul>
          </div>
        </div>
      </header>

      {/* How it works */}
      <section id="how" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 18px' }}>
          <h2 style={{ margin: 0, color: C.ink }}>Simple. Safe. Real.</h2>
          <p style={{ marginTop: 6, color: C.ink, opacity: .85 }}>Technology that supports human connection—never replaces it.</p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 16
          }}>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <strong>1) Get your wristband</strong>
              <p style={{ marginTop: 6, opacity: .8 }}>Each band links to your profile via QR or NFC.</p>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <strong>2) Wear it out</strong>
              <p style={{ marginTop: 6, opacity: .8 }}>At cafés, gyms, parks—signal you’re open to meeting.</p>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <strong>3) Make the connection</strong>
              <p style={{ marginTop: 6, opacity: .8 }}>Scan and connect online on your terms.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <NavBar />
      <Routes>
        {/* Home */}
        <Route path="/" element={<Home />} />

        {/* App pages */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/u/:handle" element={<PublicProfile />} />
      </Routes>
      <Footer />
    </Suspense>
  )
}
