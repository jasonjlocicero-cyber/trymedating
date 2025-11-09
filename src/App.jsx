// src/App.jsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

/* Pages */
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import InviteQR from "./pages/InviteQR";
import Connections from "./pages/Connections";
import ChatDockPage from "./pages/ChatDockPage";
import Connect from "./routes/Connect";

/* Global chat bubble that opens the overlay ChatDock */
import ChatLauncher from "./components/ChatLauncher";

/* ---------- Header / Footer ---------- */

function Header() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      nav("/");
    }
  }

  return (
    <header className="site-header" style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
        }}
      >
        <Link
          to="/"
          className="logo"
          aria-label="TryMeDating"
          style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
        >
          <img
            src="/logo-mark.png"
            alt="TryMeDating logo"
            style={{ width: 28, height: 28 }}
            draggable={false}
          />
          <span style={{ fontWeight: 900, letterSpacing: 0.2 }}>
            Try<span style={{ color: "#14b8a6" }}>Me</span>Dating
          </span>
        </Link>

        <nav className="site-nav" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link
            to="/"
            className="btn btn-neutral btn-pill"
            aria-current={pathname === "/" ? "page" : undefined}
          >
            Home
          </Link>

          {/* “Messages” points to the Connections list */}
          <Link
            to="/connections"
            className="btn btn-neutral btn-pill"
            aria-current={pathname.startsWith("/connections") ? "page" : undefined}
          >
            Messages
          </Link>

          {/* My Invite QR in header */}
          <Link
            to="/invite"
            className="btn btn-primary btn-pill"
            aria-current={pathname.startsWith("/invite") ? "page" : undefined}
          >
            My Invite QR
          </Link>

          <button className="btn btn-danger btn-pill" onClick={signOut}>Sign out</button>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer" style={{ borderTop: "1px solid var(--border)", marginTop: 16 }}>
      <div
        className="container"
        style={{ display: "flex", gap: 8, justifyContent: "center", padding: 16, flexWrap: "wrap" }}
      >
        <Link className="btn btn-neutral btn-pill" to="/terms">Terms</Link>
        <Link className="btn btn-neutral btn-pill" to="/privacy">Privacy</Link>
        <Link className="btn btn-neutral btn-pill" to="/contact">Contact</Link>
        <Link className="btn btn-neutral btn-pill" to="/feedback">Feedback</Link>
      </div>
      <div className="helper-muted" style={{ textAlign: "center", fontSize: 12, paddingBottom: 12 }}>
        © {new Date().getFullYear()} TryMeDating. All rights reserved.
      </div>
    </footer>
  );
}

/* ---------- App Shell (suppresses overlay chat on full-page chat routes) ---------- */

function Shell() {
  const { pathname } = useLocation();

  // Do not render the global chat overlay when already on full-page chat
  const showChatOverlay = !pathname.startsWith("/chat");

  return (
    <>
      <Header />

      <main className="site-main">
        <Routes>
          {/* Home & core pages */}
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/u/:handle" element={<PublicProfile />} />

          {/* Invite QR */}
          <Route path="/invite" element={<InviteQR />} />

          {/* Connections (messages list + actions) */}
          <Route path="/connections" element={<Connections />} />

          {/* Full-page chat by peerId or by handle */}
          <Route path="/chat/:peerId" element={<ChatDockPage />} />
          <Route path="/chat/h/:handle" element={<ChatDockPage />} />

          {/* Connect QR handler: support both /connect and /connect/:token */}
          <Route path="/connect" element={<Connect />} />
          <Route path="/connect/:token" element={<Connect />} />

          {/* Minimal 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />

      {showChatOverlay && <ChatLauncher />}
    </>
  );
}

function NotFound() {
  return (
    <div className="container" style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Page not found</h2>
      <p className="muted">We couldn’t find that page. Try going back home.</p>
      <div style={{ marginTop: 10 }}>
        <Link className="btn btn-primary btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}

/* ---------- App Root ---------- */

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}





























