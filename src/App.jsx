import React from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import PublicProfile from './pages/PublicProfile'

function Home() {
  const nav = useNavigate()
  return (
    <div className="container" style={{padding:'40px 0'}}>
      <h1>TryMeDating — Home</h1>
      <p>Router smoke test. If you can see this after deploy, routing compiles.</p>
      <div style={{display:'flex', gap:12, marginTop:12}}>
        <button className="btn btn-primary" onClick={()=>nav('/auth')}>Go to Auth</button>
        <button className="btn btn-secondary" onClick={()=>nav('/profile')}>Go to Profile</button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/auth" element={<AuthPage/>} />
        <Route path="/profile" element={<ProfilePage/>} />
        <Route path="/settings" element={<SettingsPage/>} />
        <Route path="/u/:handle" element={<PublicProfile/>} />
      </Routes>
    </div>
  )
}




const C = { coral:'#FF6B6B', teal:'#007A7A', green:'#3CCF4E', sand:'#F4EDE4', charcoal:'#2C2C2C', white:'#FFFFFF' };

const Logo = ({ size = 28 }) => (
  <div style={{display:'flex',alignItems:'center',gap:8}}>
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 56s-20-12.2-20-28C12 18.7 18.7 12 26 12c3.8 0 7.3 1.8 9.6 4.7C38 13.8 41.5 12 45.3 12 52.6 12 59 18.7 59 28c0 15.8-20 28-27 28z" fill={C.coral}/>
      <ellipse cx="36" cy="44" rx="18" ry="8" fill={C.teal} opacity="0.9"/>
    </svg>
    <div style={{fontWeight:800,color:C.teal}}>TryMe<span style={{color:C.coral}}>Dating</span></div>
  </div>
);

const Section = ({title, subtitle, children}) => (
  <section className="container" style={{padding:'40px 0'}}>
    <div style={{marginBottom:16}}>
      {title && <h2 style={{fontSize:28, margin:'0 0 6px'}}>{title}</h2>}
      {subtitle && <p style={{opacity:.8}}>{subtitle}</p>}
    </div>
    {children}
  </section>
);

const Stat = ({label, value}) => (
  <div style={{textAlign:'center', padding:16}}>
    <div style={{fontSize:30,fontWeight:800,color:C.teal}}>{value}</div>
    <div style={{opacity:.7}}>{label}</div>
  </div>
);

const Feature = ({Icon, title, text}) => (
  <div className="card">
    <div style={{display:'flex',gap:16, alignItems:'flex-start'}}>
      <div style={{background:`${C.teal}15`, padding:12, borderRadius:12}}>
        <Icon size={24} color={C.teal} />
      </div>
      <div>
        <h3 style={{margin:'0 0 6px'}}>{title}</h3>
        <p style={{opacity:.8}}>{text}</p>
      </div>
    </div>
  </div>
);

const ProductCard = ({color, title, desc}) => (
  <div className="card" style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{
      height:140,
      borderRadius:12,
      background: `linear-gradient(145deg, ${color}66, ${color})`
    }} />
    <h4 style={{margin:0,fontSize:20}}>{title}</h4>
    <p style={{opacity:.8}}>{desc}</p>
    <button className="btn btn-secondary" style={{marginTop:'auto', width:'100%'}}>Add to Cart</button>
  </div>
);

export default function App(){
  return (
    <div>
      {/* Top nav */}
      <div style={{position:'sticky', top:0, backdropFilter:'blur(6px)', background:'rgba(255,255,255,.75)', borderBottom:`1px solid ${C.sand}`, zIndex:30}}>
        <nav className="container" style={{height:64, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <Logo/>
          <div style={{display:'flex', gap:18, alignItems:'center'}}>
            <a href="#how">How It Works</a>
            <a href="#shop">Shop</a>
            <a href="#community">Community</a>
            <a href="#faqs">FAQs</a>
            <button className="btn btn-primary">Sign Up</button>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <header className="bg">
        <Section>
          <div className="grid grid-2" style={{alignItems:'center'}}>
            <div>
              <motion.h1 initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.5}}
                style={{fontSize:44, lineHeight:1.1, margin:0, fontWeight:900}}>
                Dating, the <span style={{color:C.coral}}>warmer</span> way.
              </motion.h1>
              <p style={{marginTop:12, fontSize:18, opacity:.85}}>Meet new people naturally with a wristband that lets others know you’re open to connection.</p>
              <div style={{marginTop:16, display:'flex', gap:12, flexWrap:'wrap'}}>
                <button className="btn btn-primary">Get Your Wristband</button>
                <button className="btn btn-ghost">Join the Community</button>
              </div>
            </div>
            <div className="card">
              <div className="grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
                <Stat label="Wristband scans" value="12k+" />
                <Stat label="Stories shared" value="1.2k" />
                <Stat label="Cities active" value="45" />
              </div>
              <div style={{marginTop:12, display:'grid', gap:10}}>
                <div>Privacy-first profiles</div>
                <div>Warm, real-world intros</div>
                <div>Tap/scan to connect</div>
              </div>
            </div>
          </div>
        </Section>
      </header>

      {/* HOW IT WORKS */}
      <div id="how">
        <Section title="Simple. Safe. Real." subtitle="Technology that supports human connection—never replaces it.">
          <div className="grid grid-3">
            <Feature Icon={ShoppingBag} title="1) Get your wristband" text="Choose a color and style. Each band links to your profile via QR or NFC."/>
            <Feature Icon={Users} title="2) Wear it out" text="At cafés, gyms, parks—your band signals you’re open to meeting."/>
            <Feature Icon={MessageSquare} title="3) Make the connection" text="Scan a band (or be scanned) and connect online on your terms."/>
          </div>
        </Section>
      </div>

      {/* SHOP */}
      <div id="shop" style={{background:C.sand}}>
        <Section title="Wear your intention." subtitle="Pick your vibe—each color communicates your mode.">
          <div className="grid grid-3">
            <ProductCard color={C.green} title="Green – Open to dating" desc="Start conversations with people open to romance."/>
            <ProductCard color="#3BA7FF" title="Blue – Looking for friends" desc="Meet new friends and expand your circle."/>
            <ProductCard color="#E03A3A" title="Red – Just browsing" desc="Enjoy the night; scanning disabled or limited."/>
          </div>
        </Section>
      </div>

      {/* COMMUNITY */}
      <div id="community">
        <Section title="Real people. Real connections." subtitle="Stories from the TryMeDating community.">
          <div className="grid grid-3">
            {[1,2,3].map(i => (
              <div className="card" key={i}>
                <p style={{fontStyle:'italic'}}>"I met someone amazing at a coffee shop thanks to my wristband."</p>
                <div style={{marginTop:12, opacity:.7}}>— Sarah, NC</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* FAQS */}
      <div id="faqs">
        <Section title="Your safety comes first." subtitle="Privacy controls and respectful community standards are built in.">
          <div className="grid grid-2">
            {[
              ["Do I have to talk to everyone who scans my band?","No. You always approve or decline requests before anyone sees your details."],
              ["What if I don’t want to wear my band sometimes?","Just take it off or toggle your visibility in settings—totally fine."],
              ["How secure is my information?","Your profile is private by default; only approved connections can view it."],
              ["What if I lose my band?","Deactivate it from your account and order a replacement linked to your profile."]
            ].map(([q,a]) => (
              <details key={q}><summary style={{cursor:'pointer', fontWeight:600}}>{q}</summary><p style={{marginTop:8, opacity:.8}}>{a}</p></details>
            ))}
          </div>
        </Section>
      </div>

      {/* FOOTER */}
      <footer style={{background:C.sand, borderTop:`1px solid ${C.sand}`}}>
        <div className="container" style={{padding:'28px 0'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap'}}>
            <Logo/>
            <div style={{display:'flex', gap:14, fontSize:14, opacity:.85}}>
              <a href="#about">About</a><a href="#faqs">FAQs</a><a href="#community">Community</a><a href="#shop">Shop</a>
            </div>
          </div>
          <div style={{marginTop:10, fontSize:13, opacity:.7}}>© {new Date().getFullYear()} TryMeDating. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
