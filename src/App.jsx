// src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import { ChatProvider } from "./chat/ChatContext";

// Layout
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChatLauncher from "./components/ChatLauncher";

// Pages
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import PublicProfile from "./pages/PublicProfile";
import Contact from "./pages/Contact";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import ChatDockPage from "./pages/ChatDockPage";
import InviteQR from "./pages/InviteQR";
import DebugQR from "./pages/DebugQR";
import Connections from "./pages/Connections"; // <-- new list of connections/requests

// Components / routes
import ConnectionContext from "./components/ConnectionToast";
import ConnectionToast from "./components/ConnectionToast";
import Connect from "./routes/Connect";

/* --------------------------
 * Home (hero + features)
 * -------------------------*/
function Home({ me }) {
  const authed = !!me?.id;

  return (
    <div style={{ background: "#fff" }}>
      {/* HERO */}
      <section style={{ padding: "52px 0 36px", borderBottom: "1px solid var(--border)" }}>
        <div
          className="container"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 18,
            textAlign: "center",
            maxWidth: 920,
          }}
        >
          <h1
            style={{
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1.1,
              margin: "0 auto",
            }}
          >
            Welcome to{" "}
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-me)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </h1>

          <p className="muted" style={{ margin: "0 auto", maxWidth: 760, fontSize: 16 }}>
            Meet intentionally. Share your invite with a QR code and connect only with people you’ve
            actually met. No endless swiping—just real conversations with people you trust.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            {!authed ? (
              <>
                <Link className="btn btn-primary btn-pill" to="/auth">
                  Sign in / Sign up
                </Link>
                <a className="btn btn-neutral btn-pill" href="#how-it-works">
                  How it works
                </a>
              </>
            ) : (
              <>
                <Link className="btn btn-primary btn-pill" to="/profile">
                  Go to Profile
                </Link>
                <Link className="btn btn-accent btn-pill" to="/connections">
                  Connections
                </Link>
                <Link className="btn btn-accent btn-pill" to="/invite">
                  My Invite QR
                </Link>
              </>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <div className="helper-muted">Private 1:1 messages</div>
            <div className="helper-muted">You control who can find you</div>
            <div className="helper-muted">No public browsing of strangers</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "28px 0" }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 style={{ fontWeight: 800, marginBottom: 14, textAlign: "center" }}>How it works</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <FeatureCard
              title="Create"
              text="Set up a simple profile with your name and a short intro. Choose if it’s public."
              icon="🧩"
            />
            <FeatureCard
              title="Share"
              text="Show your personal QR code to people you’ve met in real life to invite them."
              icon="🔗"
            />
            <FeatureCard
              title="Match"
              text="You both must accept—this isn’t a browse-everyone app; it’s about real connections."
              icon="🤝"
            />
            <FeatureCard
              title="Message"
              text="Keep it private and focused with clean, simple 1:1 messaging (no noise, no spam)."
              icon="💬"
            />
          </div>
        </div>
      </section>

      {/* SAFETY / PRIVACY STRIP */}
      <section
        style={{
          padding: "18px 0",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          background: "#fbfbfb",
        }}
      >
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
            textAlign: "center",
          }}
        >
          <span style={{ fontWeight: 700 }}>Your pace. Your privacy.</span>
          <span className="muted">
            Turn public off anytime • Block/report if needed • No public search
          </span>
        </div>
      </section>
      {/* Intentionally no “Continue where you left off” strip */}
    </div>
  );
}

/** Small card component for the “How it works” grid */
function FeatureCard({ title, text, icon }) {
  return (
    <div
      className="card"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: "#f8fafc",
            border: "1px solid var(--border)",
            fontSize: 16,
          }}
          aria-hidden
        >
          <span>{icon}</span>
        </div>
        <div style={{ fontWeight: 800 }}>{lcase(title)}</div>
      </div>
      <div className="muted" style={{ lineHeight: 1.55 }}>
        {text}
      </div>
    </div>
  );
}

function lcase(s) {
  // keep original style: title case already set by caller
  return s;
}

/* --------------------------
 * App Root
 * -------------------------*/
export default function App() {
  const [me, setMe] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // unread count for messaging badge (used by Header via ChatLauncher)
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const safety = setTimeout(() => alive && setLoadingAuth(false), 2000);

    (async () => {
      try {
        const res = await supabase.auth.getUser();
        if (!alive) return;
        setMe(res?.data?.user || null);
      } catch (err) {
        console.error("[auth.getUser] failed:", err);
      } finally {
        if (alive) setLoadingAuth(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!alive) return;
      setMe(session?.user || null);
    });

    return () => {
      alive = false;
      clearTimeout(safety);
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <ChatProvider renderDock={false}>
      <Header me={me} unread={unread} onSignOut={handleSignOut} />

      {/* Global toast for inbound connection requests (Accept/Reject) */}
      {me?.id && <ConnectionToast me={me} />}

      <main style={{ minHeight: "60vh" }}>
        {loading?(
          <div style={{ padding: 24, display: "grid", placeItems: "center" }}>
            <div className="muted">Loading…</div>
          </div>
        ):(
          <Routes>
            <Route path="/" element={<Home me={me} />} />

            {/* Auth */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Private routes */}
            <Route
              path="/profile"
              element={me ? <ProfilePage /> : <Navigate to="/auth" replace />}
            />
            <Route
              path="/settings"
              element={me ? <SettingsPage /> : <Navigate to="/auth" replace />}
            />
            <Route
              path="/connections"
              element={me ? <Connections /> : <Navigate to="/auth" replace />}
            />

            {/* Public profile */}
            <Route path="/u/:handle" element={<PublicProfile />} />

            {/* Static pages */}
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />

            {/* Messaging */}
            <Route
              path="/chat/:peerId"
              element={me ? <ChatDockPage /> : <Navigate to="/auth" replace />}
            />
            <Route
              path="/chat"
              element={me ? <ChatDockPage /> : <Navigate to="/auth" replace />}
            />
            <Route
              path="/chat/line/:handle"
              element={me ? <ChatDockPage /> : <Navigate to="/auth" replace />}
            />

            {/* Invite QR */}
            <Route
              path="/invite"
              element={me ? <InviteQR /> : <Navigate to="/auth" replace />}
            />

            {/* QR smoke test & connection link endpoint */}
            <Route path="/debug-qr" element={<DebugQR />} />
            <Route path="/connect" element={<Connect me={me} />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />

      {/* Bottom-right chat bubble (render once) */}
      <ChatLauncher onUnreadChange={(n) => setUnread(typeof n === "number" ? n : unread)} />
    </ChatProvider>
  );
}




























