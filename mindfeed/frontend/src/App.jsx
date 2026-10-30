import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Bell, BookOpen, Bookmark,
  Bot, BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  Copy, Eye, EyeOff, FileCheck2, Flag, Flower2, Gauge, Globe2, Heart, Home, Info, Lightbulb,
  Link as LinkIcon, ListFilter, LockKeyhole, LogOut, Menu, MessageCircle, Moon, MoreHorizontal,
  MousePointer2, Network, Plus, RefreshCcw, Search, Send, Settings2, Shield, ShieldAlert, ShieldCheck,
  Sparkles, Sun, ThumbsDown, ThumbsUp, Timer, TrendingUp, User, UserCheck, Users, X, Zap,
  CheckCheck, Circle, ScanSearch, SlidersHorizontal, ExternalLink, Fingerprint, FileText, Leaf, Mail,
  ChevronUp, CircleDot, CircleOff, Filter, House, PanelLeft, Play, ShieldQuestion, WandSparkles,
} from 'lucide-react';
import { api, getToken, setToken, formatTime, initials } from './api.js';

const AuthContext = createContext(null);
const UIContext = createContext(null);
const TOPICS = ['Technology', 'Design', 'Science', 'Learning', 'Culture', 'Wellness', 'Business', 'Nature'];
const DEMO_TOPICS = ['Technology', 'Design', 'Science', 'Learning'];

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setTokenState] = useState(getToken());

  useEffect(() => {
    let alive = true;
    if (!token) { setLoading(false); setUser(null); return; }
    api('/api/auth/me').then(res => { if (alive) setUser(res.user); }).catch(() => { if (alive) { setToken(null); setTokenState(null); setUser(null); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const applyAuth = useCallback((payload) => {
    setToken(payload.access_token);
    setTokenState(payload.access_token);
    setUser(payload.user);
    setLoading(false);
    return payload.user;
  }, []);
  const signInDemo = useCallback(async () => applyAuth(await api('/api/auth/demo', { method: 'POST', body: '{}' })), [applyAuth]);
  const signIn = useCallback(async (email, password) => applyAuth(await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })), [applyAuth]);
  const register = useCallback(async (name, email, password, phone) => {
    const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, ...(phone ? { phone } : {}) }) });
    if (result.verification_required) return result;
    applyAuth(result); return result;
  }, [applyAuth]);
  const verifyPhone = useCallback(async (userId, code) => applyAuth(await api('/api/auth/verify-phone', { method: 'POST', body: JSON.stringify({ user_id: userId, code }) })), [applyAuth]);
  const resendPhoneOtp = useCallback((userId) => api('/api/auth/resend-phone-otp', { method: 'POST', body: JSON.stringify({ user_id: userId }) }), []);
  const signOut = useCallback(() => { setToken(null); setTokenState(null); setUser(null); }, []);
  const value = useMemo(() => ({ user, loading, token, signInDemo, signIn, register, verifyPhone, resendPhoneOtp, signOut, setUser }), [user, loading, token, signInDemo, signIn, register, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);
const useUI = () => useContext(UIContext);

function App() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const campaign = Object.fromEntries(keys.filter(key => params.has(key)).map(key => [key, params.get(key)]));
    if (Object.keys(campaign).length) sessionStorage.setItem('mindfeed_utm', JSON.stringify({ ...campaign, captured_at: new Date().toISOString() }));
    const existing = document.getElementById('mindfeed-web-schema') || document.createElement('script');
    existing.id = 'mindfeed-web-schema'; existing.type = 'application/ld+json';
    existing.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'MindFeed', description: 'An adaptive, explainable, user-controlled social media platform.', url: `${window.location.origin}/` });
    if (!existing.parentNode) document.head.appendChild(existing);
  }, []);
  const [toast, setToast] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [dark, setDark] = useState(() => localStorage.getItem('mindfeed_theme') === 'dark');
  const [cookieVisible, setCookieVisible] = useState(() => !localStorage.getItem('mindfeed_cookie_choice'));
  const toastTimer = useRef(null);
  const notify = useCallback((message, kind = 'success') => {
    setToast({ message, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);
  const toggleTheme = useCallback(() => setDark(v => { const next = !v; localStorage.setItem('mindfeed_theme', next ? 'dark' : 'light'); return next; }), []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);
  const ui = useMemo(() => ({ notify, setComposerOpen, setReportTarget, dark, toggleTheme }), [notify, dark, toggleTheme]);

  return <AuthProvider><UIContext.Provider value={ui}>
    <ScrollProgress />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<AuthPage mode="signin" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/about" element={<PublicPage type="about" />} />
      <Route path="/privacy" element={<PublicPage type="privacy" />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/truth-check" element={<TruthCheckPage />} />
          <Route path="/trust-center" element={<TrustPage />} />
          <Route path="/review-center" element={<ReviewPage />} />
          <Route path="/my-posts" element={<MyPostsPage />} />
          <Route path="/distraction-shield" element={<ShieldPage />} />
          <Route path="/study-mode" element={<StudyPage />} />
          <Route path="/timeguard" element={<TimeGuardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/family-controls" element={<FamilyControlsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    {composerOpen && <ComposerModal onClose={() => setComposerOpen(false)} />}
    {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />}
    {toast && <div className={`toast toast-${toast.kind}`} role="status"><span className="toast-icon">{toast.kind === 'error' ? <Info size={17} /> : <CheckCircle2 size={17} />}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    {cookieVisible && <CookieBanner onClose={choice => { localStorage.setItem('mindfeed_cookie_choice', choice); setCookieVisible(false); }} />}
    <button className="back-top" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ChevronUp size={18} /></button>
  </UIContext.Provider></AuthProvider>;
}

function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => { const max = document.documentElement.scrollHeight - window.innerHeight; setProgress(max > 0 ? (window.scrollY / max) * 100 : 0); };
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update();
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <div className="scroll-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>;
}

function Seo({ title, description }) {
  useEffect(() => {
    document.title = `${title} · MindFeed`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = description;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = window.location.origin + window.location.pathname;
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    const privateRoutes = new Set(['/signin', '/register', '/feed', '/truth-check', '/trust-center', '/review-center', '/my-posts', '/distraction-shield', '/study-mode', '/timeguard', '/settings', '/search', '/activity', '/family-controls']);
    robots.content = privateRoutes.has(window.location.pathname.replace(/\/$/, '') || '/') ? 'noindex,nofollow' : 'index,follow,max-image-preview:large';
    return () => {};
  }, [title, description]);
  return null;
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader label="Opening your space…" />;
  return user ? <Outlet /> : <Navigate to="/" replace />;
}

function Logo({ onClick, compact = false }) {
  return <button className={`brand-mark ${compact ? 'brand-compact' : ''}`} onClick={onClick || (() => window.location.assign('/'))} aria-label="MindFeed home">
    <span className="brand-symbol"><span></span><span></span><span></span></span>
    {!compact && <span className="brand-word">mindfeed<span className="brand-period">.</span></span>}
  </button>;
}

function LandingPage() {
  const { user, loading, signInDemo } = useAuth();
  const { notify } = useUI();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const enterDemo = async () => {
    if (user) { navigate('/feed'); return; }
    setBusy(true);
    try { await signInDemo(); navigate('/feed'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="landing-page">
    <Seo title="A social feed on your terms" description="MindFeed gives you a calmer, clearer social experience with user-controlled recommendations, safety tools and digital well-being." />
    <header className="landing-nav wrap-wide">
      <Link to="/" className="landing-brand"><Logo /></Link>
      <nav className="landing-links" aria-label="Main navigation"><a href="#why-mindfeed">Why MindFeed</a><a href="#how-it-works">How it works</a><Link to="/about">Our approach</Link></nav>
      <div className="landing-actions"><Link to="/signin" className="button button-quiet">Sign in</Link><button className="button button-dark" onClick={enterDemo} disabled={busy || loading}>{busy ? <Spinner /> : <ArrowUpRight size={16} />} Explore the demo</button></div>
    </header>
    <main id="main-content">
      <section className="hero-section wrap-wide">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot"></span> A more intentional internet</div>
          <h1>Your feed should<br />feel like <em>your</em> world<span className="lime-dot">.</span></h1>
          <p className="hero-description">Less noise. More signal. MindFeed gives you the tools to shape what you see, understand why it appears, and keep your attention where you want it.</p>
          <div className="hero-buttons"><button className="button button-dark button-large" onClick={enterDemo} disabled={busy}>{busy ? <Spinner /> : <ArrowUpRight size={18} />} Step inside MindFeed</button><a href="#how-it-works" className="text-link">See how it works <ArrowRight size={16} /></a></div>
          <div className="hero-proof"><div className="avatar-stack"><span className="avatar tiny" style={{backgroundImage:'url(https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop&crop=faces)'}}></span><span className="avatar tiny" style={{backgroundImage:'url(https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=faces)'}}></span><span className="avatar tiny" style={{backgroundImage:'url(https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=80&h=80&fit=crop&crop=faces)'}}></span><span className="avatar tiny avatar-initials">+</span></div><div><strong>Designed around you</strong><span>Choice first. Always.</span></div></div>
        </div>
        <div className="hero-visual" aria-label="Illustration of a personalized feed and attention controls">
          <div className="hero-glow"></div>
          <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
          <div className="hero-device">
            <div className="device-top"><span className="device-logo">m<span>.</span></span><span className="device-label">YOUR FEED</span><span className="device-avatar">A</span></div>
            <div className="device-greeting"><small>THURSDAY, OCT 29</small><h3>A little more<br /><em>of what matters.</em></h3></div>
            <div className="device-feature feature-green"><div><span className="feature-label">FOR YOU</span><strong>Designing a quieter digital world</strong><span className="feature-byline">Maya Chen · 4 min read</span></div><div className="feature-art"><div className="art-sun"></div><div className="art-hill art-hill-a"></div><div className="art-hill art-hill-b"></div></div></div>
            <div className="device-mini-post"><span className="mini-avatar purple">JL</span><div><b>Jordan Lee</b><span>Why good questions beat quick answers.</span></div><span className="mini-heart"><Heart size={14} /></span></div>
            <div className="device-feed-controls"><span><SlidersHorizontal size={13} /> Your controls</span><span className="controls-switch on"><i></i></span></div>
          </div>
          <div className="float-chip float-trust"><span className="chip-icon chip-green"><ShieldCheck size={17} /></span><div><b>Trust, with context</b><small>Not just a blue tick.</small></div><Check size={15} className="chip-check" /></div>
          <div className="float-chip float-time"><span className="chip-icon chip-purple"><Timer size={17} /></span><div><b>Your time matters</b><small>12 min of mindful scroll</small><div className="tiny-progress"><i></i></div></div></div>
          <div className="float-spark"><Sparkles size={19} /></div>
        </div>
      </section>
      <section className="principle-strip wrap-wide" id="why-mindfeed"><div className="principle-lead"><span className="eyebrow">THE MINDFEED DIFFERENCE</span><h2>Good technology gives<br />you <em>more say.</em></h2></div><div className="principle-item"><span className="principle-number">01</span><ShieldCheck size={22} /><h3>Safety with nuance</h3><p>Content checks that explain their thinking and leave room for human judgment.</p></div><div className="principle-item"><span className="principle-number">02</span><SlidersHorizontal size={22} /><h3>Control by default</h3><p>Clear settings for topics, repetition, recommendation modes, and your attention.</p></div><div className="principle-item"><span className="principle-number">03</span><ScanSearch size={22} /><h3>Evidence over noise</h3><p>Claim assessments show sources and uncertainty, not unexplained verdicts.</p></div></section>
      <section className="how-section" id="how-it-works"><div className="wrap-wide how-grid"><div><span className="eyebrow"><span className="eyebrow-dot"></span> BUILT AROUND YOUR CHOICES</span><h2>Scroll with<br /><em>intention.</em></h2><p>MindFeed brings personalization, trust, context and well-being into one experience—so the tools work together instead of competing for your attention.</p><button className="button button-dark" onClick={enterDemo}>Explore the workspace <ArrowRight size={16} /></button></div><div className="module-stack"><div className="module-row"><span className="module-icon icon-green"><Fingerprint size={19} /></span><div><b>TrustID + BotShield</b><p>Account trust signals, impersonation reports and cautious bot-risk analysis.</p></div><ArrowUpRight size={17} /></div><div className="module-row"><span className="module-icon icon-orange"><ShieldAlert size={19} /></span><div><b>SafePost AI</b><p>Review public posts before publishing, with reasons and appeals.</p></div><ArrowUpRight size={17} /></div><div className="module-row"><span className="module-icon icon-blue"><FileCheck2 size={19} /></span><div><b>TruthCheck AI</b><p>Inspect claims through evidence links and clear uncertainty.</p></div><ArrowUpRight size={17} /></div><div className="module-row"><span className="module-icon icon-violet"><BrainCircuit size={19} /></span><div><b>Adaptive AI Feed</b><p>A feed shaped by your interests, preferences and feedback.</p></div><ArrowUpRight size={17} /></div><div className="module-row"><span className="module-icon icon-green"><Leaf size={19} /></span><div><b>Distraction Shield</b><p>Topic controls, Study Mode and time limits that answer to you.</p></div><ArrowUpRight size={17} /></div></div></div></section>
      <section className="closing-section wrap-wide"><div className="closing-card"><div><span className="eyebrow"><span className="eyebrow-dot"></span> YOUR INTERNET, REIMAGINED</span><h2>Make room for<br /><em>what matters.</em></h2><p>A thoughtful feed begins with a simple idea: you should be able to shape it.</p></div><button className="button button-light button-large" onClick={enterDemo}>Enter MindFeed <ArrowUpRight size={18} /></button><div className="closing-orb"></div></div></section>
    </main>
    <footer className="landing-footer wrap-wide"><Link to="/" className="landing-brand"><Logo /></Link><span>© {new Date().getFullYear()} MindFeed. Made for a more intentional internet.</span><div><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><Link to="/signin">Sign in</Link></div></footer>
  </div>;
}

function AuthPage({ mode }) {
  const { signIn, register, verifyPhone, resendPhoneOtp, signInDemo } = useAuth();
  const { notify } = useUI();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', countryCode: '+91' });
  const [verification, setVerification] = useState(null);
  const [otp, setOtp] = useState('');
  const isRegister = mode === 'register';
  const submit = async event => {
    event.preventDefault(); setLoading(true);
    try {
      if (isRegister) {
        const result = await register(form.name, form.email, form.password, `${form.countryCode}${form.phone.replace(/\D/g, '')}`);
        if (result.verification_required) { setVerification(result); notify(result.message, 'info'); return; }
      } else await signIn(form.email, form.password);
      notify(isRegister ? 'Your MindFeed account is ready.' : 'Welcome back.'); navigate('/feed');
    } catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  };
  const demo = async () => { setLoading(true); try { await signInDemo(); navigate('/feed'); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } };
  return <div className="auth-page"><Seo title={isRegister ? 'Create your account' : 'Sign in'} description="Sign in to your MindFeed workspace." /><div className="auth-left"><Link to="/" className="landing-brand"><Logo /></Link><div className="auth-message"><span className="eyebrow"><span className="eyebrow-dot"></span> A SPACE THAT LISTENS</span><h1>Your attention<br />is <em>yours.</em></h1><p>Come back to a feed that reflects what you care about—not just what keeps you scrolling.</p><div className="auth-points"><span><CheckCircle2 size={16} /> Transparent recommendations</span><span><CheckCircle2 size={16} /> Safety with human oversight</span><span><CheckCircle2 size={16} /> Controls that stay in your hands</span></div></div><div className="auth-left-footer">MindFeed · Your Feed. Your Mind. Your Rules.</div><div className="auth-decoration"></div></div><div className="auth-right"><Link to="/" className="auth-mobile-brand"><Logo /></Link><div className="auth-form-wrap"><div className="auth-form-heading"><span className="eyebrow">{isRegister ? 'START YOUR JOURNEY' : 'WELCOME BACK'}</span><h2>{isRegister ? 'Create your space.' : 'Good to see you.'}</h2><p>{isRegister ? 'A more intentional feed starts with you.' : 'Sign in to pick up where you left off.'}</p></div><form className="auth-form" onSubmit={submit}>
    {isRegister && !verification && <label>Display name<div className="input-with-icon"><User size={17} /><input required minLength={2} maxLength={80} autoComplete="name" placeholder="How should we call you?" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div></label>}
    {(!verification || !isRegister) && <label>Email address<div className="input-with-icon"><Mail size={17} /><input type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div></label>}
    {isRegister && !verification && <label>Phone number<div className="phone-input-row"><select aria-label="Country calling code" value={form.countryCode} onChange={e => setForm({ ...form, countryCode: e.target.value })}><option value="+91">India (+91)</option><option value="+1">United States / Canada (+1)</option><option value="+44">United Kingdom (+44)</option><option value="+61">Australia (+61)</option><option value="+65">Singapore (+65)</option><option value="+971">UAE (+971)</option></select><input type="tel" required autoComplete="tel-national" inputMode="tel" placeholder="9876543210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div><small className="auth-field-note">A verification code is required to activate your account.</small></label>}
    {(!verification || !isRegister) && <label>Password<div className="input-with-icon"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} required minLength={isRegister ? 8 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><button className="input-action" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
    {verification && <div className="otp-panel"><b>Verify your phone</b><p>{verification.message}</p>{verification.development_code && <p className="dev-otp-note">Local development code: <strong>{verification.development_code}</strong> — no SMS was sent.</p>}<label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label><button type="button" className="button button-outline full-width" disabled={loading || otp.length !== 6} onClick={async () => { setLoading(true); try { await verifyPhone(verification.user_id, otp); notify('Phone verified. Welcome to MindFeed.'); navigate('/feed'); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }}>{loading ? <Spinner /> : <CheckCircle2 size={16} />} Verify and continue</button><button type="button" className="text-link otp-resend" disabled={loading} onClick={async () => { setLoading(true); try { const result = await resendPhoneOtp(verification.user_id); setVerification(result); setOtp(''); notify(result.message, 'info'); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }}>Resend code</button></div>}
    {isRegister && !verification && <label className="terms-consent"><input type="checkbox" required /> <span>I agree to the <Link to="/privacy">Privacy notice</Link> and MindFeed's terms of use.</span></label>}
    {!verification && <button className="button button-dark full-width button-large" type="submit" disabled={loading}>{loading ? <Spinner /> : null}{isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>}
    </form>{!verification && <><div className="auth-divider"><span></span><small>OR</small><span></span></div><button className="button button-outline full-width" onClick={demo} disabled={loading}><Sparkles size={16} /> Continue with demo workspace</button><p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to MindFeed?'} <Link to={isRegister ? '/signin' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p><div className="auth-privacy"><LockKeyhole size={14} /> Your preferences are yours. We never sell them.</div></>}</div><Link to="/" className="back-home"><ArrowLeft size={14} /> Back to home</Link></div></div>;
}

function AppShell() {
  const { user, signOut } = useAuth();
  const { setComposerOpen, toggleTheme, dark, notify } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [usage, setUsage] = useState(null);
  const [limitModal, setLimitModal] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => { setMobileNav(false); }, [location.pathname]);
  useUsageTracking(user, setUsage, notify);
  useEffect(() => { const openComposer = () => setComposerOpen(true); window.addEventListener('mindfeed:composer-open', openComposer); return () => window.removeEventListener('mindfeed:composer-open', openComposer); }, [setComposerOpen]);
  useEffect(() => { document.title = `${routeTitle(location.pathname)} · MindFeed`; }, [location.pathname]);
  const submitSearch = e => { e.preventDefault(); const q = searchValue.trim(); if (q) navigate(`/search?q=${encodeURIComponent(q)}`); };
  const startFreshSession = async () => { try { const data = await api('/api/usage/start', { method: 'POST', body: '{}' }); setUsage(data); setLimitModal(false); notify('Your next session has started. Take a break whenever you need one.'); } catch (e) { notify(e.message, 'error'); } };
  const primary = [
    { to: '/feed', label: 'Your feed', icon: Home, badge: null },
    { to: '/truth-check', label: 'TruthCheck AI', icon: ScanSearch, badge: 'NEW' },
    { to: '/trust-center', label: 'Trust & safety', icon: ShieldCheck },
  ];
  const tools = [
    { to: '/distraction-shield', label: 'Distraction Shield', icon: SlidersHorizontal },
    { to: '/study-mode', label: 'Study Mode', icon: BookOpen },
    { to: '/timeguard', label: 'TimeGuard', icon: Timer },
  ];
  const accountItems = [
    ...(user?.role === 'moderator' || user?.role === 'admin' ? [{ to: '/review-center', label: 'Review center', icon: FileCheck2 }] : []),
    { to: '/my-posts', label: 'My posts', icon: User },
    { to: '/activity', label: 'Reports & appeals', icon: Activity },
    { to: '/family-controls', label: 'Family controls', icon: Users },
    { to: '/settings', label: 'Settings', icon: Settings2 },
  ];
  const menu = <>
    <div className="sidebar-brand-row"><Link to="/feed" className="sidebar-logo"><Logo /></Link><button className="icon-button sidebar-close mobile-only" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
    <div className="workspace-switch"><span className="workspace-icon"><BrainCircuit size={16} /></span><span><b>MindFeed space</b><small>Personal workspace</small></span><ChevronDown size={14} /></div>
    <nav className="sidebar-nav" aria-label="Application navigation">
      <span className="nav-section-label">DISCOVER</span>{primary.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}</NavLink>)}
      <span className="nav-section-label nav-section-gap">YOUR CONTROLS</span>{tools.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span></NavLink>)}
      <span className="nav-section-label nav-section-gap">YOUR SPACE</span>{accountItems.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span></NavLink>)}
    </nav>
    <div className="sidebar-bottom"><div className="sidebar-focus-card"><div className="focus-orbit"><Flower2 size={21} /></div><span className="focus-caption">A gentle reminder</span><b>Your attention<br />is a choice.</b><span className="focus-sub">Take it back, one scroll at a time.</span><button onClick={() => navigate('/timeguard')}>Check your time <ArrowUpRight size={13} /></button></div><div className="sidebar-user"><Avatar user={user} size="md" /><div className="sidebar-user-copy"><b>{user?.name || 'MindFeed member'}</b><span>{user?.role === 'moderator' ? 'Community guide' : 'Personal account'}</span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => { signOut(); navigate('/'); notify('You have signed out.'); }}><LogOut size={17} /></button></div></div>
  </>;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>{menu}</aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <div className="app-main-column">
      <header className="app-topbar"><button className="icon-button mobile-only menu-trigger" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="breadcrumb"><span>MindFeed</span><ChevronRight size={14} /><b>{routeTitle(location.pathname)}</b></div><div className="topbar-actions"><form className="global-search" onSubmit={submitSearch}><Search size={16} /><input aria-label="Search MindFeed" placeholder="Search anything…" value={searchValue} onChange={e => setSearchValue(e.target.value)} /><kbd>/</kbd></form><button className="icon-button theme-toggle" title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme" onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><button className="icon-button notification-button" title="Reports and appeals" aria-label="Activity" onClick={() => navigate('/activity')}><Bell size={18} /><i></i></button><button className="button button-dark top-create" onClick={() => setComposerOpen(true)}><Plus size={16} /> Create</button></div></header>
      <main id="main-content" className="main-content"><Outlet /></main>
      <footer className="app-footer"><span>MindFeed <span className="footer-dot">●</span> Your Feed. Your Mind. Your Rules.</span><div><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><button onClick={() => setHelpOpen(true)}>Help & feedback</button></div></footer>
    </div>
    <aside className="right-rail"><AttentionCard usage={usage} onClick={() => navigate('/timeguard')} /><div className="rail-card rail-controls"><div className="rail-title-row"><span className="rail-icon rail-icon-green"><SlidersHorizontal size={16} /></span><span className="rail-kicker">YOUR PERSONAL FIREWALL</span><button className="icon-button mini-icon" aria-label="Manage controls" onClick={() => navigate('/distraction-shield')}><ArrowUpRight size={16} /></button></div><h3>Keep your feed<br /><em>in balance.</em></h3><p>Your preferences shape what makes it through.</p><div className="firewall-line"><span>Topic preferences</span><span className="status-live"><i></i> Active</span></div><div className="firewall-line"><span>Repetition filter</span><span className="status-live"><i></i> Active</span></div><div className="firewall-line"><span>Explainable ranking</span><span className="status-live"><i></i> Active</span></div><button className="rail-text-button" onClick={() => navigate('/distraction-shield')}>Tune your firewall <ArrowRight size={15} /></button></div><div className="rail-card rail-truth"><div className="rail-title-row"><span className="rail-icon rail-icon-lilac"><ScanSearch size={16} /></span><span className="rail-kicker">A MOMENT OF CONTEXT</span></div><p>Before a claim becomes a belief, give it a moment of scrutiny.</p><button className="button button-light-olive full-width" onClick={() => navigate('/truth-check')}>Check a claim <ArrowUpRight size={15} /></button><span className="rail-note"><Info size={12} /> Demo evidence is clearly labeled</span></div><div className="rail-footer"><span>Built for a healthier internet.</span><span>© {new Date().getFullYear()} MindFeed</span></div></aside>
    {helpOpen && <Dialog title="Help & feedback" onClose={() => setHelpOpen(false)}><p className="muted">MindFeed is a working project demonstrator. Reports, account issues, and product feedback can be submitted inside the application.</p><div className="help-links"><Link to="/activity" onClick={() => setHelpOpen(false)}><Flag size={17} /> View your reports and appeals <ArrowRight size={15} /></Link><Link to="/privacy" onClick={() => setHelpOpen(false)}><Shield size={17} /> Read privacy principles <ArrowRight size={15} /></Link></div><button className="button button-dark full-width" onClick={() => setHelpOpen(false)}>Got it</button></Dialog>}
    {limitModal && <Dialog title="A natural pause" onClose={() => setLimitModal(false)}><div className="pause-illustration"><Flower2 size={34} /></div><p className="muted">Your configured session limit has been reached. Take a real break away from the screen before starting another session.</p><div className="dialog-actions"><button className="button button-outline" onClick={() => { setLimitModal(false); notify('Your current session remains paused.'); }}>Later</button><button className="button button-dark" onClick={startFreshSession}>Start a new session <ArrowRight size={16} /></button></div></Dialog>}
  </div>;
}

function useUsageTracking(user, onUpdate, notify) {
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let sessionId = null;
    let didWarn = false;
    const start = async () => {
      try {
        const data = await api('/api/usage/start', { method: 'POST', body: '{}' });
        if (cancelled) return;
        sessionId = data.session_id || null; onUpdate(data);
      } catch { /* the main app remains usable if usage tracking cannot initialize */ }
    };
    start();
    const tick = async () => {
      if (cancelled || !sessionId || document.visibilityState !== 'visible') return;
      try {
        const data = await api('/api/usage/tick', { method: 'POST', body: JSON.stringify({ session_id: sessionId, active_seconds: 30 }) });
        if (cancelled) return;
        onUpdate(data);
        if ((data.session_limit_reached || data.daily_limit_reached) && !didWarn) {
          didWarn = true;
          if (data.daily_limit_reached) notify('Your daily MindFeed time limit has been reached.', 'error');
          else notify('Your session limit has been reached. Consider taking a break.', 'error');
        }
        if (data.session_limit_reached || data.daily_limit_reached) sessionId = null;
      } catch { /* avoid repeated toast noise for a transient tracking failure */ }
    };
    const timer = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(timer); if (sessionId) api('/api/usage/end', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }).catch(() => {}); };
  }, [user?.id]);
}

function routeTitle(path) {
  const map = { '/feed': 'Your feed', '/truth-check': 'TruthCheck AI', '/trust-center': 'Trust & safety', '/review-center': 'Review center', '/my-posts': 'My posts', '/distraction-shield': 'Distraction Shield', '/study-mode': 'Study Mode', '/timeguard': 'TimeGuard', '/settings': 'Settings', '/search': 'Search', '/activity': 'Reports & appeals', '/family-controls': 'Family controls' };
  return map[path] || 'MindFeed';
}

function Avatar({ user, size = 'md', className = '' }) {
  return user?.avatar_url ? <img className={`avatar avatar-${size} ${className}`} src={user.avatar_url} alt={`${user.name || 'User'}'s profile`} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span className={`avatar avatar-${size} avatar-fallback ${className}`} aria-label={`${user?.name || 'User'} avatar`}>{initials(user?.name)}</span>;
}

function AttentionCard({ usage, onClick }) {
  const daily = usage?.daily_active_seconds || 0;
  const limit = usage?.daily_limit_seconds || 3600;
  const remaining = usage?.daily_remaining_seconds ?? limit - daily;
  const pct = Math.min(100, Math.max(0, (daily / Math.max(1, limit)) * 100));
  return <div className="attention-card"><div className="attention-card-top"><span>TIME WELL SPENT</span><span className="attention-symbol"><Clock3 size={17} /></span></div><div className="attention-number">{Math.floor(daily / 60)}<span> min</span><small> / {Math.floor(limit / 60)} min</small></div><div className="attention-track"><i style={{ width: `${pct}%` }}></i></div><div className="attention-bottom"><span>{Math.floor(remaining / 60)} min left today</span><span className="attention-status"><i></i> On track</span></div><button onClick={onClick}>Your attention report <ArrowUpRight size={14} /></button></div>;
}

function FullLoader({ label = 'Loading MindFeed…' }) {
  return <div className="full-loader"><span className="loader-brand"><Logo /></span><Spinner /><p>{label}</p></div>;
}
function Spinner() { return <span className="spinner" aria-hidden="true" />; }

function FeedPage() {
  const { user } = useAuth();
  const { notify, setComposerOpen, setReportTarget } = useUI();
  const [mode, setMode] = useState('for-you');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWelcome, setShowWelcome] = useState(() => !sessionStorage.getItem('mindfeed_welcome_seen'));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api(`/api/feed?mode=${mode}`);
      setItems(result.items || []); setLimit(result.limit || null);
      if (result.message && result.limit?.daily_limit_reached) setError(result.message);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [mode, refreshKey]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { setRefreshKey(v => v + 1); notify('Your feed is refreshed.'); };
  const feedback = async (post, action) => {
    try {
      const result = await api(`/api/posts/${post.id}/feedback`, { method: 'POST', body: JSON.stringify({ action }) });
      notify(action === 'block_topic' ? `“${post.topic}” is now blocked from your feed.` : action === 'show_less' ? `You’ll see less ${post.topic.toLowerCase()} content.` : action === 'show_more' ? `We’ll prioritize ${post.topic.toLowerCase()} content.` : action === 'save' ? 'Saved to your feedback history.' : 'Thanks. Your feed will learn from this.');
      setRefreshKey(v => v + 1);
    } catch (e) { notify(e.message, 'error'); }
  };
  const like = async post => {
    try { const result = await api(`/api/posts/${post.id}/like`, { method: 'POST', body: '{}' }); setItems(current => current.map(p => p.id === post.id ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p)); }
    catch (e) { notify(e.message, 'error'); }
  };
  const dismissWelcome = () => { sessionStorage.setItem('mindfeed_welcome_seen', '1'); setShowWelcome(false); };
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  return <div className="feed-page page-entrance">
    <Seo title="Your feed" description="A personalized, explainable feed shaped by your interests and preferences." />
    <div className="page-heading-row feed-heading"><div><div className="eyebrow"><span className="eyebrow-dot"></span> YOUR CORNER OF THE INTERNET</div><h1>{greeting}, {user?.name?.split(' ')[0] || 'there'}<span className="heading-period">.</span></h1><p>A little less noise. A little more <em>you.</em></p></div><button className="button button-outline feed-refresh" onClick={refresh}><RefreshCcw size={15} /> Refresh feed</button></div>
    {showWelcome && <div className="welcome-banner"><div className="welcome-icon"><Sparkles size={21} /></div><div><b>Welcome to a feed that listens.</b><p>Your preferences lead. The algorithm follows. You can change the rules whenever you want.</p></div><button className="icon-button" onClick={dismissWelcome} aria-label="Dismiss welcome message"><X size={17} /></button></div>}
    <div className="composer-prompt"><Avatar user={user} size="md" /><button onClick={() => setComposerOpen(true)} className="composer-trigger">Share something worth thinking about…</button><button onClick={() => setComposerOpen(true)} className="composer-add" aria-label="Create a post"><Plus size={18} /></button></div>
    <div className="feed-tabs" role="tablist" aria-label="Feed modes"><button className={mode === 'for-you' ? 'active' : ''} onClick={() => setMode('for-you')}><Sparkles size={15} /> For you</button><button className={mode === 'following' ? 'active' : ''} onClick={() => setMode('following')}><Users size={15} /> Community</button><button className={mode === 'latest' ? 'active' : ''} onClick={() => setMode('latest')}><Clock3 size={15} /> Latest</button><button className={mode === 'learn' ? 'active' : ''} onClick={() => setMode('learn')}><BookOpen size={15} /> Learn</button><span className="feed-tab-tail"><ListFilter size={14} /> Your filters are on</span></div>
    {error && <div className="inline-alert"><Info size={18} /><div><b>Time for a pause</b><p>{error} Your limits are adjustable in TimeGuard.</p><Link to="/timeguard">Review your limits <ArrowRight size={14} /></Link></div></div>}
    {loading ? <div className="feed-list"><PostSkeleton /><PostSkeleton /><PostSkeleton /></div> : items.length ? <div className="feed-list">{items.map(post => <PostCard key={post.id} post={post} onLike={() => like(post)} onFeedback={action => feedback(post, action)} onReport={() => setReportTarget({ type: 'post', id: post.id, label: `post by ${post.author?.name}` })} />)}</div> : !error && <EmptyState icon={Sparkles} title="Your feed is ready for a reset" description="No posts match these filters right now. Open Distraction Shield to adjust the topics you follow." action="Tune your feed" onAction={() => window.location.assign('/distraction-shield')} />}
    <div className="feed-end"><span className="end-mark"><Check size={14} /></span><span>You’re all caught up—for now.</span><button onClick={refresh}>Find something fresh <ArrowRight size={14} /></button></div>
  </div>;
}

function PostCard({ post, onLike, onFeedback, onReport }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const [copied, setCopied] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [saved, setSaved] = useState(Boolean(post.saved_by_me));
  const [following, setFollowing] = useState(Boolean(post.following_author));
  const { notify } = useUI();
  const { user: viewer } = useAuth();
  const explanation = post.topic ? `This post is in ${post.topic}. Your feed can use your selected interests, recent feedback, and enabled repetition controls to decide where it appears. This is a general explanation of the ranking rules—not a claim that one specific signal was decisive.` : 'This post is shown because it is eligible for your selected feed mode.';
  const copyPost = async () => {
    const text = `${post.content}\n\n— ${post.author?.name || 'MindFeed member'}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); notify('Post copied to clipboard.'); setTimeout(() => setCopied(false), 1800); }
    catch { notify('Clipboard access is unavailable in this browser.', 'error'); }
  };
  const toggleComments = async () => {
    const next = !commentsOpen; setCommentsOpen(next);
    if (next) { setCommentsLoading(true); try { const result = await api(`/api/posts/${post.id}/comments`); setComments(result.items || []); } catch (e) { notify(e.message, 'error'); } finally { setCommentsLoading(false); } }
  };
  const submitComment = async e => { e.preventDefault(); if (!commentText.trim()) return; try { const result = await api(`/api/posts/${post.id}/comments`, { method:'POST', body:JSON.stringify({content:commentText}) }); setComments(current => [...current, result.comment]); setCommentText(''); notify('Comment added.'); } catch (e) { notify(e.message, 'error'); } };
  const toggleSaved = async () => { try { const result = await api(`/api/posts/${post.id}/save`, { method:'POST', body:'{}' }); setSaved(result.saved); notify(result.saved ? 'Post saved to your collection.' : 'Post removed from saved items.'); } catch (e) { notify(e.message, 'error'); } };
  const toggleFollow = async () => { try { const result = await api(`/api/users/${post.author.id}/follow`, { method:'POST', body:'{}' }); setFollowing(result.following); notify(result.following ? `Following ${post.author.name}.` : `Unfollowed ${post.author.name}.`); } catch (e) { notify(e.message, 'error'); } };
  return <article className="post-card">
    <div className="post-head"><Avatar user={post.author} size="md" /><div className="post-author"><div className="author-name-row"><b>{post.author?.name || 'MindFeed member'}</b>{post.author?.role === 'moderator' && <span className="trusted-dot" title="Community guide"><BadgeCheck size={14} /></span>}<span className="post-age">· {formatTime(post.created_at)}</span></div><div className="author-meta"><span>{post.topic}</span><span className="meta-dot">·</span><span>{post.format === 'Photo' ? 'Photo story' : post.format === 'Video' ? 'Short video' : 'Community post'}</span></div></div>{viewer?.id !== post.author?.id && <button className={`follow-inline ${following ? 'is-following' : ''}`} onClick={toggleFollow}>{following ? 'Following' : 'Follow'}</button>}<div className="post-menu-wrap"><button className="icon-button post-menu-button" onClick={() => setMenuOpen(v => !v)} aria-label="Post options" aria-expanded={menuOpen}><MoreHorizontal size={20} /></button>{menuOpen && <><button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close menu" /><div className="post-menu"><button onClick={() => { setExplain(v => !v); setMenuOpen(false); }}><Info size={15} /> Why am I seeing this?</button><button onClick={() => { onFeedback('show_less'); setMenuOpen(false); }}><ThumbsDown size={15} /> Show me less</button><button onClick={() => { onFeedback('block_topic'); setMenuOpen(false); }}><Filter size={15} /> Block this topic</button><button onClick={() => { onReport(); setMenuOpen(false); }}><Flag size={15} /> Report post</button><button onClick={() => { copyPost(); setMenuOpen(false); }}><Copy size={15} /> Copy text</button></div></>}</div></div>
    <p className="post-content">{post.content}</p>
    {post.image_url && <div className="post-media">{post.format === 'Video' ? <video src={post.image_url} controls playsInline preload="metadata" aria-label={`Video shared by ${post.author?.name || 'a MindFeed member'}`} /> : <img src={post.image_url} alt={`Photo shared by ${post.author?.name || 'a MindFeed member'} about ${post.topic}`} loading="lazy" onError={e => { e.currentTarget.parentElement.classList.add('image-failed'); e.currentTarget.style.display = 'none'; }} />}<span className="media-topic"><span></span>{post.topic}</span></div>}
    {explain && <div className="why-panel"><span className="why-panel-icon"><Sparkles size={16} /></span><div><b>Why this is in your feed</b><p>{explanation}</p><button onClick={() => onFeedback('not_relevant')}>Not relevant to me <ArrowRight size={13} /></button></div><button className="icon-button" onClick={() => setExplain(false)} aria-label="Close explanation"><X size={14} /></button></div>}
    <div className="post-footer"><div className="post-actions"><button className={`post-action ${post.liked_by_me ? 'liked' : ''}`} onClick={onLike} aria-pressed={post.liked_by_me}><Heart size={17} fill={post.liked_by_me ? 'currentColor' : 'none'} /><span>{formatCount(post.likes_count || 0)}</span></button><button className="post-action" onClick={toggleComments}><MessageCircle size={17} /><span>{post.comments_count || comments.length || 'Comment'}</span></button><button className={`post-action ${copied ? 'liked' : ''}`} onClick={copyPost}><Copy size={16} /><span>{copied ? 'Copied' : 'Share'}</span></button></div><div className="post-action-tail"><button className={`post-action ${saved ? 'liked' : ''}`} onClick={toggleSaved} aria-label={saved ? 'Unsave post' : 'Save post'} title={saved ? 'Unsave post' : 'Save post'}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button><button className="post-more-feedback" onClick={() => onFeedback('show_more')} title="Show more content like this"><Sparkles size={15} /><span>More like this</span></button></div></div>
    {commentsOpen && <section className="post-comments"><div className="post-comments-heading"><b>Conversation</b><span>{comments.length} comments</span></div>{commentsLoading ? <p className="micro-note">Loading comments…</p> : comments.length ? comments.map(comment => <div className="post-comment" key={comment.id}><Avatar user={comment.author} size="sm" /><div><b>{comment.author?.name || 'MindFeed member'}</b><p>{comment.content}</p><small>{formatTime(comment.created_at)}</small></div></div>) : <p className="micro-note">Be the first to add a thoughtful comment.</p>}<form className="comment-form" onSubmit={submitComment}><input value={commentText} onChange={e => setCommentText(e.target.value)} maxLength={1000} placeholder="Add a comment…" aria-label="Add a comment" required /><button className="button button-dark button-small" disabled={!commentText.trim()}>Send</button></form></section>}
    {post.status === 'pending_review' && <div className="post-status-warning"><Clock3 size={14} /> Pending moderator review</div>}
  </article>;
}
function formatCount(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function PostSkeleton() { return <div className="post-card skeleton-card"><div className="skeleton-head"><span className="skeleton sk-avatar"></span><span className="skeleton sk-line"></span></div><span className="skeleton sk-text"></span><span className="skeleton sk-text sk-text-short"></span><span className="skeleton sk-media"></span></div>; }
function EmptyState({ icon: Icon = Sparkles, title, description, action, onAction }) { return <div className="empty-state"><span className="empty-icon"><Icon size={25} /></span><h3>{title}</h3><p>{description}</p>{action && <button className="button button-dark" onClick={onAction}>{action} <ArrowRight size={15} /></button>}</div>; }

function TruthCheckPage() {
  const { notify } = useUI();
  const [claim, setClaim] = useState('The Earth orbits the Sun.');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const runCheck = async e => {
    e?.preventDefault(); if (claim.trim().length < 8) { notify('Enter a complete claim to assess.', 'error'); return; }
    setLoading(true); setResult(null);
    try { const data = await api('/api/truthcheck', { method: 'POST', body: JSON.stringify({ claim }) }); setResult(data); setHistory(items => [data, ...items].slice(0, 4)); }
    catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  };
  const statusConfig = result ? factStatus(result.status) : null;
  const sampleClaims = ['The Earth orbits the Sun.', 'Water boils at 100°C at standard pressure.', 'The Great Wall is visible from the Moon.'];
  const reportResult = async () => {
    try { await api('/api/reports', { method: 'POST', body: JSON.stringify({ target_type: 'factcheck', target_id: result.id, reason: 'Incorrect or incomplete assessment', details: 'I would like this result to be reviewed.' }) }); notify('Your feedback was sent for review.'); }
    catch (e) { notify(e.message, 'error'); }
  };
  return <div className="page-entrance truth-page">
    <Seo title="TruthCheck AI" description="Assess claims using evidence links, source context and clear uncertainty labels." />
    <PageHeader eyebrow="CONTEXT BEFORE CONVICTION" title={<>A claim deserves<br /><em>more than a label.</em></>} description="Inspect a factual statement, see what the available evidence says, and understand what remains uncertain." icon={ScanSearch} />
    <div className="truth-layout"><section className="truth-main"><div className="panel truth-input-panel"><div className="panel-topline"><span className="panel-kicker"><span className="status-dot status-dot-purple"></span> CLAIM REVIEW</span><span className="tiny-label">01 / SUBMIT</span></div><h2>What would you like to check?</h2><p>Enter a factual claim in plain language. MindFeed will compare it against the evidence available in this demonstrator.</p><form onSubmit={runCheck} className="truth-form"><label className="sr-only" htmlFor="claim-input">Claim to assess</label><textarea id="claim-input" value={claim} onChange={e => setClaim(e.target.value)} placeholder="Paste a claim, headline, or statement…" maxLength={2000} rows={4} /><div className="textarea-bottom"><span>{claim.length} / 2,000 characters</span><button className="button button-dark" disabled={loading || claim.trim().length < 8} type="submit">{loading ? <Spinner /> : <ScanSearch size={16} />} Assess claim <ArrowRight size={15} /></button></div></form><div className="sample-claims"><span>Try a sample</span>{sampleClaims.map((sample, i) => <button key={sample} onClick={() => { setClaim(sample); setResult(null); }}>{sample} <ArrowUpRight size={12} /></button>)}</div></div>
      {loading && <div className="panel check-loading"><div className="scan-animation"><ScanSearch size={26} /></div><div><b>Reviewing the available evidence…</b><p>Identifying the claim and checking the demonstration reference set.</p></div><div className="loading-bars"><i></i><i></i><i></i></div></div>}
      {result && statusConfig && <section className="panel result-panel" aria-live="polite"><div className="result-heading"><div><span className="panel-kicker">ASSESSMENT #{result.id}</span><h2>Here’s what we found.</h2></div><button className="icon-button" onClick={async () => { try { await navigator.clipboard.writeText(`${result.claim}\nStatus: ${statusConfig.label}\n${result.explanation}`); notify('Assessment copied.'); } catch { notify('Clipboard is unavailable.', 'error'); } }} title="Copy assessment" aria-label="Copy assessment"><Copy size={17} /></button></div><blockquote className="result-claim">“{result.claim}”</blockquote><div className={`result-status result-${result.status}`}><span className="result-status-icon">{statusConfig.icon}</span><div><span className="result-status-label">ASSESSMENT STATUS</span><b>{statusConfig.label}</b><p>{result.explanation}</p></div><div className="confidence"><strong>{result.confidence}%</strong><span>confidence<br />estimate</span></div></div><div className="confidence-track"><i style={{ width: `${result.confidence}%` }}></i></div><div className="result-subhead"><h3>Evidence & source context</h3><span>{result.evidence?.length || 0} references</span></div>{result.evidence?.length ? <div className="evidence-list">{result.evidence.map((e, i) => <div className="evidence-row" key={`${e.url}-${i}`}><span className="evidence-number">0{i + 1}</span><div className="evidence-copy"><b>{e.source}</b><span>{e.domain} <span className="meta-dot">·</span> {e.relationship}</span><p>{e.note}</p></div><a className="evidence-link" href={e.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${e.source}`}><ExternalLink size={16} /></a></div>)}</div> : <div className="no-evidence"><Info size={17} /><div><b>No matching reference in the current catalogue</b><p>MindFeed will not invent a source to fill the gap. Try a narrower claim or connect a live evidence-search provider.</p></div></div>}<div className="result-disclaimer"><ShieldQuestion size={16} /><p>{result.limitations || 'This result is a decision-support summary and should be checked against primary sources.'}</p></div><div className="result-actions"><button className="button button-outline" onClick={reportResult}><Flag size={15} /> Report an issue</button><button className="button button-dark" onClick={() => { setClaim(''); setResult(null); document.getElementById('claim-input')?.focus(); }}>Check another claim <ArrowRight size={15} /></button></div></section>}
      {!result && !loading && <div className="truth-note"><span className="note-icon"><Lightbulb size={17} /></span><div><b>Evidence is a process, not a verdict.</b><p>A confident label is less useful than a source you can inspect. MindFeed shows its limits as well as its findings.</p></div></div>}
    </section><aside className="truth-side"><div className="truth-side-hero"><div className="truth-orbit"><ScanSearch size={27} /></div><span className="tiny-label">HOW IT WORKS</span><h3>Context, in<br /><em>three steps.</em></h3><ol><li><span>01</span><div><b>Identify the claim</b><p>Separate a factual statement from opinion or ambiguity.</p></div></li><li><span>02</span><div><b>Inspect the evidence</b><p>Review available references and their relationship.</p></div></li><li><span>03</span><div><b>Understand the limits</b><p>See uncertainty clearly, including when evidence is missing.</p></div></li></ol></div><div className="truth-side-card"><span className="rail-icon rail-icon-green"><ShieldCheck size={16} /></span><h4>Transparent by design</h4><p>Every assessment tells you where it came from and what it can’t establish.</p><Link to="/about">Our AI principles <ArrowRight size={14} /></Link></div><div className="mode-disclaimer"><Info size={14} /><p><b>Demonstration mode</b><br />This workspace uses a small curated sample catalogue, not live fact-check search or automated source-independence verification.</p></div></aside></div>
  </div>;
}
function factStatus(status) {
  const map = {
    supported: { label: 'Supported by available evidence', icon: <CheckCircle2 size={21} /> },
    contradicted: { label: 'Evidence contradicts the claim', icon: <ShieldAlert size={21} /> },
    mixed_evidence: { label: 'Mixed evidence', icon: <CircleDot size={21} /> },
    insufficient_evidence: { label: 'Insufficient evidence', icon: <CircleHelp size={21} /> },
    needs_context: { label: 'More context is needed', icon: <Info size={21} /> },
  };
  return map[status] || map.insufficient_evidence;
}

function TrustPage() {
  const { notify, setReportTarget } = useUI();
  const [overview, setOverview] = useState(null);
  const [bot, setBot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const [t, b] = await Promise.all([api('/api/trust/overview'), api('/api/trust/bot-assessment')]); setOverview(t); setBot(b); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const requestVerification = async () => { setRequesting(true); try { const result = await api('/api/trust/verification-requests', { method: 'POST', body: JSON.stringify({ verification_type: 'account_authenticity', note: 'Requesting an account authenticity review.' }) }); notify(result.message); load(); } catch (e) { notify(e.message, 'error'); } finally { setRequesting(false); } };
  if (loading) return <PageLoader title="Loading trust signals…" />;
  return <div className="page-entrance"><Seo title="Trust & safety" description="Review your account trust status, verification requests and cautious bot-risk signals." /><PageHeader eyebrow="TRUST IS EARNED, NOT ASSUMED" title={<>A clearer view<br />of <em>account trust.</em></>} description="Understand what MindFeed can see, what it cannot verify, and when a human review is appropriate." icon={ShieldCheck} /><div className="trust-hero-grid"><div className="panel trust-status-panel"><div className="trust-status-top"><span className="panel-kicker">ACCOUNT STATUS</span><span className="badge badge-neutral"><Circle size={8} /> Not verified</span></div><div className="trust-status-main"><div className="trust-big-icon"><Fingerprint size={31} /></div><div><h2>{overview.account.name}</h2><p>{overview.account.email}</p><div className="trust-state-note"><Info size={14} /> Account ownership is registered; identity has not been independently verified.</div></div></div><div className="trust-stats"><div><span>Account age</span><b>{overview.account_age_days} days</b></div><div><span>Posts published</span><b>{overview.posts_published}</b></div><div><span>Trust score</span><b>Not assigned</b></div></div><button className="button button-dark" onClick={requestVerification} disabled={requesting}>{requesting ? <Spinner /> : <Fingerprint size={16} />} Request verification review <ArrowRight size={15} /></button><p className="micro-note">A request is recorded for review; it does not automatically grant a verification badge.</p></div><div className="trust-side-summary"><div className="trust-summary-art"><div className="trust-ring ring-a"></div><div className="trust-ring ring-b"></div><ShieldCheck size={34} /></div><span className="panel-kicker">THE TRUST PRINCIPLE</span><h3>Signals are not<br /><em>proof.</em></h3><p>MindFeed separates declared account details, observed behavior, and independently verified identity.</p></div></div>
    <div className="section-heading-row"><div><span className="eyebrow">ACCOUNT SIGNALS</span><h2>What we know—and what we don't.</h2></div><span className="small-muted">Updated just now</span></div><div className="trust-signals-grid">{overview.signals.map((signal, i) => <div className="trust-signal-card" key={signal.label}><span className={`signal-check ${signal.status}`}><Check size={16} /></span><span className="signal-number">SIGNAL 0{i + 1}</span><h3>{signal.label}</h3><b>{signal.state}</b><p>{signal.note}</p></div>)}</div>
    <div className="section-heading-row trust-section-heading"><div><span className="eyebrow">BOTSHIELD</span><h2>Look for patterns, not labels.</h2></div><span className="badge badge-lime"><Activity size={12} /> Behavioral signals</span></div><div className="panel bot-panel"><div className="bot-panel-icon"><Bot size={25} /></div><div className="bot-panel-copy"><h3>{bot?.label || 'Insufficient behavioral data'}</h3><p>{bot?.explanation || 'MindFeed requires more account activity before it can assess behavioral patterns.'}</p><div className="bot-signal-list">{(bot?.signals || []).map(s => <span key={s.label}><i className={s.status === 'flag' ? 'signal-flag' : ''}></i>{s.label}</span>)}</div></div><div className="bot-panel-score"><span>RISK ESTIMATE</span><b>{bot?.risk_score == null ? '—' : `${bot.risk_score}/100`}</b><small>{bot?.confidence_label || 'Not enough signal'}</small></div></div>
    <div className="trust-action-row"><div><span className="eyebrow">SEE SOMETHING THAT FEELS OFF?</span><h3>Help keep the community thoughtful.</h3><p>Reports go to a review queue and can be considered alongside other information.</p></div><button className="button button-outline" onClick={() => setReportTarget({ type: 'account', id: overview.account.id, label: overview.account.name })}><Flag size={15} /> Report an account</button></div>
    {overview.verification_requests?.length > 0 && <div className="panel request-history"><h3>Your verification requests</h3>{overview.verification_requests.map(r => <div key={r.id} className="history-row"><span><Fingerprint size={16} /> {r.type.replaceAll('_', ' ')}</span><span className="badge badge-neutral">{r.status.replaceAll('_', ' ')}</span><small>{formatTime(r.created_at)}</small></div>)}</div>}
  </div>;
}

function PageHeader({ eyebrow, title, description, icon: Icon }) {
  return <div className="page-hero-heading"><div className="page-hero-copy"><div className="eyebrow">{eyebrow && <><span className="eyebrow-dot"></span>{eyebrow}</>}</div><h1>{title}</h1><p>{description}</p></div>{Icon && <div className="page-hero-symbol"><span className="symbol-orbit symbol-orbit-a"></span><span className="symbol-orbit symbol-orbit-b"></span><Icon size={31} strokeWidth={1.4} /></div>}</div>;
}

function ReviewPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const [queue, setQueue] = useState({ posts: [], reports: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('posts');
  const [note, setNote] = useState({});
  const load = useCallback(async () => { setLoading(true); try { setQueue(await api('/api/moderation/queue')); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const decide = async (id, decision) => { try { const res = await api(`/api/moderation/posts/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note: note[id] || '' }) }); notify(res.message); load(); } catch (e) { notify(e.message, 'error'); } };
  const resolve = async id => { try { const res = await api(`/api/moderation/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note: 'Reviewed by MindFeed community guide.' }) }); notify(res.message); load(); } catch (e) { notify(e.message, 'error'); } };
  if (user?.role !== 'moderator' && user?.role !== 'admin') return <div className="page-entrance"><EmptyState icon={LockKeyhole} title="This space is for community guides" description="Moderation tools are only available to authorized reviewers. You can still report content and track your reports." action="Go to your feed" onAction={() => window.location.assign('/feed')} /></div>;
  return <div className="page-entrance"><Seo title="Review center" description="Review posts requiring moderation and user reports with an auditable workflow." /><PageHeader eyebrow="HUMAN OVERSIGHT" title={<>A thoughtful<br /><em>second look.</em></>} description="Review uncertain cases, record decisions, and help keep automated flags accountable." icon={FileCheck2} /><div className="review-stats"><div className="review-stat"><span>Posts awaiting review</span><b>{queue.posts.length}</b><span className="stat-foot"><Clock3 size={13} /> Requires human judgment</span></div><div className="review-stat"><span>Open reports</span><b>{queue.reports.length}</b><span className="stat-foot"><Flag size={13} /> Community submissions</span></div><div className="review-stat"><span>Reviewer</span><b>{user?.name}</b><span className="stat-foot"><ShieldCheck size={13} /> Authorized demo role</span></div></div><div className="review-tabs"><button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>Pending posts <span>{queue.posts.length}</span></button><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Community reports <span>{queue.reports.length}</span></button><button className="review-refresh" onClick={load}><RefreshCcw size={15} /> Refresh queue</button></div>
    {loading ? <PageLoader title="Loading the review queue…" /> : tab === 'posts' ? queue.posts.length ? <div className="review-post-list">{queue.posts.map(p => <div className="review-item" key={p.id}><div className="review-item-head"><Avatar user={p.author} size="sm" /><div><b>{p.author?.name}</b><span>Submitted {formatTime(p.created_at)} · {p.topic}</span></div><span className="badge badge-orange"><Clock3 size={12} /> Pending</span></div><p className="review-post-content">{p.content}</p><div className="review-reason"><ShieldAlert size={15} /><span>{p.moderation_reason || 'Automated check requested a second look.'}</span></div><label className="review-note-label">Reviewer note (optional)<textarea rows={2} placeholder="Record the reason for your decision…" value={note[p.id] || ''} onChange={e => setNote(current => ({ ...current, [p.id]: e.target.value }))} /></label><div className="review-item-actions"><button className="button button-outline button-danger" onClick={() => decide(p.id, 'rejected')}><X size={15} /> Reject post</button><button className="button button-dark" onClick={() => decide(p.id, 'approved')}><Check size={15} /> Approve post</button></div></div>)}</div> : <EmptyState icon={CheckCheck} title="Nothing waiting for review" description="New posts flagged by the configured demonstration rules will appear here. This queue is stored in the database." /> : queue.reports.length ? <div className="report-queue">{queue.reports.map(r => <div className="report-queue-item" key={r.id}><div className="report-queue-head"><span className="report-icon"><Flag size={17} /></span><div><b>Report #{r.id} · {r.target_type}</b><span>{r.reason} · {formatTime(r.created_at)}</span></div><span className="badge badge-orange">Open</span></div><p>{r.details || 'No additional details were provided.'}</p><div className="report-queue-footer"><span>Target reference: {r.target_id || 'Not specified'}</span><button className="button button-dark button-small" onClick={() => resolve(r.id)}><Check size={14} /> Mark reviewed</button></div></div>)}</div> : <EmptyState icon={ShieldCheck} title="No open reports" description="User reports will appear here for review. Resolutions are recorded in the database." />}
  </div>;
}

function ShieldPage() {
  const { notify } = useUI();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const res = await api('/api/preferences'); setPrefs(res.preferences); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const update = patch => setPrefs(current => ({ ...current, ...patch }));
  const save = async () => { setSaving(true); try { const res = await api('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }); setPrefs(res.preferences); notify('Your personal firewall is up to date.'); } catch (e) { notify(e.message, 'error'); } finally { setSaving(false); } };
  const toggleList = (field, value) => { const old = prefs[field] || []; update({ [field]: old.includes(value) ? old.filter(x => x !== value) : [...old, value] }); };
  const addBlocked = () => { const value = newTopic.trim(); if (!value || prefs.blocked_topics.some(x => x.toLowerCase() === value.toLowerCase())) return; update({ blocked_topics: [...prefs.blocked_topics, value] }); setNewTopic(''); };
  if (loading || !prefs) return <PageLoader title="Loading your feed controls…" />;
  return <div className="page-entrance"><Seo title="Distraction Shield" description="Configure topic preferences, blocked subjects and duplicate-reduction rules." /><PageHeader eyebrow="YOUR PERSONAL CONTENT FIREWALL" title={<>Make your feed<br /><em>feel like yours.</em></>} description="Tell MindFeed what you want more of, what can wait, and what shouldn't enter your feed at all." icon={SlidersHorizontal} /><div className="shield-layout"><div className="shield-main"><section className="panel control-panel"><div className="control-panel-head"><div className="control-icon green"><Sparkles size={19} /></div><div><h2>Interests worth your time</h2><p>Choose the subjects that should shape your recommendations.</p></div><span className="tiny-label">01</span></div><div className="topic-grid">{TOPICS.map(t => <button key={t} className={`topic-choice ${prefs.interests.includes(t) ? 'selected' : ''}`} onClick={() => toggleList('interests', t)}><span className="topic-choice-dot"></span>{t}{prefs.interests.includes(t) && <Check size={14} />}</button>)}</div></section><section className="panel control-panel"><div className="control-panel-head"><div className="control-icon lilac"><Filter size={19} /></div><div><h2>Topics to keep out</h2><p>Blocked topics won't appear in the standard feed or search results.</p></div><span className="tiny-label">02</span></div><form className="add-topic-form" onSubmit={e => { e.preventDefault(); addBlocked(); }}><input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="Add a topic to block…" maxLength={60} aria-label="Topic to block" /><button className="button button-dark" type="submit" disabled={!newTopic.trim()}><Plus size={15} /> Block topic</button></form><div className="blocked-topic-list">{prefs.blocked_topics.length ? prefs.blocked_topics.map(topic => <span className="blocked-topic" key={topic}>{topic}<button onClick={() => update({ blocked_topics: prefs.blocked_topics.filter(t => t !== topic) })} aria-label={`Remove ${topic} block`}><X size={13} /></button></span>) : <span className="no-blocked">No blocked topics. Your feed stays open to your selected interests.</span>}</div></section><section className="panel control-panel"><div className="control-panel-head"><div className="control-icon orange"><Network size={19} /></div><div><h2>How your feed behaves</h2><p>Set the balance between familiarity, freshness and exploration.</p></div><span className="tiny-label">03</span></div><div className="feed-mode-options">{[{id:'balanced',title:'A thoughtful mix',desc:'Balance relevance, freshness and variety.',icon:Flower2},{id:'relevance',title:'More of what I like',desc:'Prioritize selected interests.',icon:Heart},{id:'latest',title:'Fresh first',desc:'Prioritize the newest eligible posts.',icon:Clock3},{id:'diverse',title:'Explore widely',desc:'Favor different topics and reduce repetition.',icon:Globe2}].map(({id,title,desc,icon:Icon}) => <button key={id} className={`feed-mode-card ${prefs.feed_mode === id ? 'selected' : ''}`} onClick={() => update({ feed_mode:id })}><span className="mode-radio">{prefs.feed_mode === id && <i />}</span><Icon size={19} /><span><b>{title}</b><small>{desc}</small></span></button>)}</div><ToggleRow title="Reduce repetitive content" description="Prefer a different topic when otherwise relevant posts are too similar." checked={prefs.reduce_repetition} onChange={v => update({ reduce_repetition:v })} /></section><div className="save-controls-row"><span><ShieldCheck size={15} /> Your controls are saved to your account.</span><button className="button button-dark button-large" onClick={save} disabled={saving}>{saving ? <Spinner /> : <Check size={16} />} Save preferences</button></div></div><aside className="shield-side"><div className="firewall-visual"><div className="firewall-visual-bg"></div><div className="firewall-shield"><ShieldCheck size={34} /></div><span className="tiny-label">PERSONAL FIREWALL</span><h3>Your rules.<br /><em>Your feed.</em></h3><p>Your explicit preferences are applied before content is ranked for display.</p><div className="firewall-metrics"><div><b>{prefs.interests.length}</b><span>Interests</span></div><div><b>{prefs.blocked_topics.length}</b><span>Blocked topics</span></div></div></div><div className="side-note-card"><Info size={17} /><div><b>Clear controls, not hidden switches.</b><p>Changes are stored in your account. Some ranking factors are illustrative while the app is in local demo mode.</p></div></div></aside></div></div>;
}

function ToggleRow({ title, description, checked, onChange }) {
  return <div className="toggle-row"><div><b>{title}</b><p>{description}</p></div><button role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>;
}

function StudyPage() {
  const { notify } = useUI();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerStarted, setTimerStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizDone, setQuizDone] = useState(false);
  const load = useCallback(async () => { try { const res = await api('/api/preferences'); setPrefs(res.preferences); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!timerStarted || secondsLeft <= 0) return; const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000); return () => clearInterval(id); }, [timerStarted, secondsLeft > 0]);
  useEffect(() => { if (timerStarted && secondsLeft === 0) { setTimerStarted(false); notify('Focus session complete. Take a real break.'); } }, [secondsLeft, timerStarted]);
  const saveMode = async next => { const previous = prefs; setPrefs({ ...prefs, ...next }); setSaved(false); try { const res = await api('/api/preferences', { method: 'PUT', body: JSON.stringify({ ...prefs, ...next }) }); setPrefs(res.preferences); setSaved(true); notify(next.study_mode ? 'Study Mode is active.' : next.study_mode === false ? 'Study Mode is paused.' : 'Learning preferences saved.'); } catch (e) { setPrefs(previous); notify(e.message, 'error'); } };
  if (loading || !prefs) return <PageLoader title="Preparing your study space…" />;
  const quizzes = [{ q:'Which habit helps you check your own understanding?', opts:['Rewatching without pausing','Explaining the idea from memory','Highlighting every sentence'], answer:1, expl:'Retrieval practice asks you to recall and explain information, which helps reveal what you do and do not understand.' }, { q:'What is a useful first step before fact-checking a headline?', opts:['Share it quickly','Find the exact factual claim','Assume the source is always right'], answer:1, expl:'A specific claim is easier to evaluate than a broad emotional headline.' }, { q:'Why include breaks during focus sessions?', opts:['To protect attention and rest','To avoid learning anything new','To make the timer longer'], answer:0, expl:'Short breaks can support sustainable focus. Your break schedule should fit your needs.' }];
  const currentQuiz = quizzes[quizIndex];
  const startTimer = () => { setSecondsLeft(timerMinutes * 60); setTimerStarted(true); };
  return <div className="page-entrance"><Seo title="Study Mode" description="Focus on learning with distraction-reduced recommendations, a study timer and short knowledge checks." /><PageHeader eyebrow="MAKE ROOM TO LEARN" title={<>A little focus.<br /><em>A lot of progress.</em></>} description="An optional space for learning content, gentle focus sessions and small checks for understanding." icon={BookOpen} /><div className="study-mode-banner"><div className="study-banner-icon"><BookOpen size={24} /></div><div><span className="tiny-label">STUDY MODE</span><h2>{prefs.study_mode ? 'Your learning space is active.' : 'Create a little more space to think.'}</h2><p>When active, MindFeed prioritizes your learning topics and reduces distraction.</p></div><ToggleRow title="Enable Study Mode" description="Apply your learning-first feed rules." checked={prefs.study_mode} onChange={v => saveMode({ study_mode: v })} /></div><div className="study-grid"><section className="panel study-focus-panel"><div className="study-panel-head"><div><span className="eyebrow">FOCUS SESSION</span><h2>Choose your rhythm.</h2><p>A timer for your focus—not a measure of your worth.</p></div><span className="focus-bloom"><Flower2 size={24} /></span></div><div className={`focus-clock ${timerStarted ? 'clock-running' : ''}`}><div className="clock-outer"><div className="clock-inner"><span>{String(Math.floor(secondsLeft / 60)).padStart(2,'0')}:{String(secondsLeft % 60).padStart(2,'0')}</span><small>{timerStarted ? 'STAY WITH IT' : 'READY WHEN YOU ARE'}</small></div></div></div><div className="timer-choice-row">{[15,25,45].map(min => <button key={min} className={timerMinutes === min ? 'selected' : ''} onClick={() => { setTimerMinutes(min); setSecondsLeft(min * 60); setTimerStarted(false); }}>{min} min</button>)}</div><div className="timer-controls">{timerStarted ? <button className="button button-outline" onClick={() => setTimerStarted(false)}><X size={15} /> Pause timer</button> : <button className="button button-dark" onClick={startTimer}><Play size={15} /> Start focus session</button>}{secondsLeft !== timerMinutes * 60 && <button className="icon-button" title="Reset timer" aria-label="Reset timer" onClick={() => { setTimerStarted(false); setSecondsLeft(timerMinutes * 60); }}><RefreshCcw size={16} /></button>}</div><p className="micro-note">This browser timer supports a focus session. It does not enforce a device-wide restriction.</p></section><section className="panel learning-topics-panel"><div className="study-panel-head"><div><span className="eyebrow">YOUR LEARNING MAP</span><h2>What are you curious about?</h2><p>Choose subjects for your learning feed.</p></div><span className="topic-count">{prefs.study_topics.length} selected</span></div><div className="learning-topic-list">{[{name:'Science',sub:'Discover how the world works',icon:Globe2},{name:'Technology',sub:'Build fluency with the future',icon:BrainCircuit},{name:'Learning',sub:'Methods, memory and curiosity',icon:Lightbulb},{name:'Career',sub:'Skills and professional growth',icon:TrendingUp},{name:'Design',sub:'Ideas, craft and visual thinking',icon:Sparkles}].map(({name,sub,icon:Icon}) => <button key={name} className={`learning-topic ${prefs.study_topics.includes(name) ? 'selected' : ''}`} onClick={() => saveMode({ study_topics: prefs.study_topics.includes(name) ? prefs.study_topics.filter(x => x !== name) : [...prefs.study_topics, name] })}><span className="learning-topic-icon"><Icon size={17} /></span><span><b>{name}</b><small>{sub}</small></span><span className="topic-check">{prefs.study_topics.includes(name) ? <Check size={15} /> : <Plus size={15} />}</span></button>)}</div></section></div><section className="quiz-section"><div className="quiz-intro"><span className="eyebrow">A QUICK KNOWLEDGE CHECK</span><h2>Turn a scroll into<br /><em>a thought you keep.</em></h2><p>Short reflection prompts can turn a useful idea into something easier to remember.</p><div className="quiz-progress-label">QUESTION {quizIndex + 1} OF {quizzes.length}<div className="quiz-progress-track"><i style={{ width: `${((quizIndex + 1) / quizzes.length) * 100}%` }} /></div></div></div><div className="quiz-card"><div className="quiz-card-top"><span className="quiz-icon"><BrainCircuit size={18} /></span><span className="badge badge-neutral">~1 min</span></div>{quizDone ? <div className="quiz-finished"><CheckCircle2 size={32} /><h3>Nice work showing up.</h3><p>You completed this quick reflection set. Small, thoughtful steps add up.</p><button className="button button-dark" onClick={() => { setQuizIndex(0); setQuizAnswer(null); setQuizDone(false); }}>Try again <RefreshCcw size={14} /></button></div> : <><h3>{currentQuiz.q}</h3><div className="quiz-options">{currentQuiz.opts.map((opt, i) => <button key={opt} className={`${quizAnswer === i ? 'chosen' : ''} ${quizAnswer !== null && i === currentQuiz.answer ? 'correct' : ''}`} onClick={() => setQuizAnswer(i)}><span>{String.fromCharCode(65 + i)}</span>{opt}{quizAnswer !== null && i === currentQuiz.answer && <Check size={15} />}</button>)}</div>{quizAnswer !== null && <div className="quiz-explanation"><Lightbulb size={16} /><p>{currentQuiz.expl}</p></div>}<div className="quiz-footer"><span>{quizAnswer === null ? 'Pick the best answer' : quizAnswer === currentQuiz.answer ? 'That’s it.' : 'A chance to learn.'}</span><button className="button button-dark button-small" disabled={quizAnswer === null} onClick={() => { if (quizIndex < quizzes.length - 1) { setQuizIndex(v => v + 1); setQuizAnswer(null); } else setQuizDone(true); }}>{quizIndex < quizzes.length - 1 ? 'Next question' : 'Finish'} <ArrowRight size={14} /></button></div></>}</div></section></div>;
}

function TimeGuardPage() {
  const { notify } = useUI();
  const [prefs, setPrefs] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const [p, u] = await Promise.all([api('/api/preferences'), api('/api/usage/summary')]); setPrefs(p.preferences); setUsage(u); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const save = async patch => { setSaving(true); const next = { ...prefs, ...patch }; setPrefs(next); try { const data = await api('/api/preferences', { method: 'PUT', body: JSON.stringify(next) }); setPrefs(data.preferences); const u = await api('/api/usage/summary'); setUsage(u); notify('TimeGuard settings saved.'); } catch (e) { notify(e.message, 'error'); } finally { setSaving(false); } };
  const startNew = async () => { try { const data = await api('/api/usage/start', { method: 'POST', body: '{}' }); setUsage(data); setShowSessionDialog(false); notify('A new session has started.'); } catch (e) { notify(e.message, 'error'); } };
  if (loading || !prefs || !usage) return <PageLoader title="Checking your time settings…" />;
  const dailyPct = Math.min(100, usage.daily_active_seconds / Math.max(1, usage.daily_limit_seconds) * 100);
  const sessionPct = Math.min(100, usage.session_active_seconds / Math.max(1, usage.session_limit_seconds) * 100);
  return <div className="page-entrance"><Seo title="TimeGuard" description="Set session and daily usage limits, configure break reminders and inspect your MindFeed time." /><PageHeader eyebrow="YOUR ATTENTION IS WORTH PROTECTING" title={<>Make time for<br /><em>the rest of life.</em></>} description="TimeGuard puts clear boundaries around your time on MindFeed—without shaming you for using it." icon={Timer} /><div className="time-overview-grid"><div className="panel time-meter-panel"><div className="meter-heading"><span className="panel-kicker">TODAY'S ACTIVE TIME</span><span className="badge badge-lime"><i className="status-pulse"></i> Tracked in app</span></div><div className="time-number">{Math.floor(usage.daily_active_seconds / 60)}<small> min</small><span> / {prefs.daily_limit_minutes} min</span></div><div className="big-meter-track"><i style={{ width: `${dailyPct}%` }} /></div><div className="meter-labels"><span>0 min</span><span>{Math.floor(usage.daily_remaining_seconds / 60)} min remaining</span></div><div className="time-meter-foot"><span><Clock3 size={15} /> Usage recorded while MindFeed is active</span><span>{Math.round(dailyPct)}%</span></div></div><div className="panel time-session-panel"><div className="session-icon"><Flower2 size={22} /></div><span className="panel-kicker">CURRENT SESSION</span><div className="session-number">{Math.floor(usage.session_active_seconds / 60)}<small> min</small></div><div className="session-track"><i style={{ width: `${sessionPct}%` }} /></div><p>{Math.floor(usage.session_remaining_seconds / 60)} minutes until your session limit.</p><button className="button button-outline full-width" onClick={() => setShowSessionDialog(true)}><RefreshCcw size={14} /> Start a fresh session</button></div></div><div className="section-heading-row"><div><span className="eyebrow">PERSONAL LIMITS</span><h2>Set the boundaries that fit.</h2></div><span className="small-muted">Changes take effect after saving</span></div><div className="time-settings-grid"><div className="panel time-setting-card"><span className="time-setting-icon"><Clock3 size={19} /></span><span className="tiny-label">01 / DAILY LIMIT</span><h3>How much time feels right?</h3><p>Your daily allowance applies to activity measured inside MindFeed.</p><div className="limit-choices">{[30,45,60,90,120].map(n => <button key={n} className={prefs.daily_limit_minutes === n ? 'selected' : ''} onClick={() => setPrefs({ ...prefs, daily_limit_minutes:n })}>{n}<small>m</small></button>)}</div><button className="button button-dark full-width" disabled={saving} onClick={() => save({ daily_limit_minutes:prefs.daily_limit_minutes })}>{saving ? <Spinner /> : <Check size={15} />} Save daily limit</button></div><div className="panel time-setting-card"><span className="time-setting-icon purple"><Timer size={19} /></span><span className="tiny-label">02 / SESSION LIMIT</span><h3>Give each session an edge.</h3><p>A session pause is a nudge to stretch, hydrate, or look away.</p><div className="limit-choices">{[15,20,30,45,60].map(n => <button key={n} className={prefs.session_limit_minutes === n ? 'selected' : ''} onClick={() => setPrefs({ ...prefs, session_limit_minutes:n })}>{n}<small>m</small></button>)}</div><button className="button button-dark full-width" disabled={saving} onClick={() => save({ session_limit_minutes:prefs.session_limit_minutes })}>{saving ? <Spinner /> : <Check size={15} />} Save session limit</button></div><div className="panel time-setting-card"><span className="time-setting-icon orange"><Bell size={19} /></span><span className="tiny-label">03 / BREAK REMINDER</span><h3>A reminder before the limit.</h3><p>Choose how early you want a gentle break reminder.</p><div className="limit-choices">{[2,5,10,15].map(n => <button key={n} className={prefs.break_reminder_minutes === n ? 'selected' : ''} onClick={() => setPrefs({ ...prefs, break_reminder_minutes:n })}>{n}<small>m</small></button>)}</div><button className="button button-dark full-width" disabled={saving} onClick={() => save({ break_reminder_minutes:prefs.break_reminder_minutes })}>{saving ? <Spinner /> : <Check size={15} />} Save reminder</button></div></div><div className="wellbeing-disclaimer"><ShieldCheck size={18} /><div><b>Boundaries without pretending to control the whole device.</b><p>TimeGuard counts active usage inside this application and pauses the MindFeed experience at configured limits. A browser app cannot restrict other websites or devices, and background time may be approximate.</p></div></div>{showSessionDialog && <Dialog title="Start a fresh session?" onClose={() => setShowSessionDialog(false)}><div className="pause-illustration"><Flower2 size={34} /></div><p className="muted">Starting a new session resets the session timer, but your daily usage remains. Consider taking a real break before continuing.</p><div className="dialog-actions"><button className="button button-outline" onClick={() => setShowSessionDialog(false)}>Stay paused</button><button className="button button-dark" onClick={startNew}>Start a new session</button></div></Dialog>}</div>;
}

function FamilyControlsPage() {
  const { notify } = useUI();
  const [links, setLinks] = useState({ profile_type: 'standard', incoming: [], outgoing: [], active_children: [] });
  const [prefs, setPrefs] = useState(null);
  const [childPrefs, setChildPrefs] = useState({});
  const [profileType, setProfileType] = useState('standard');
  const [childEmail, setChildEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linkData, prefData] = await Promise.all([api('/api/family/links'), api('/api/preferences')]);
      setLinks(linkData);
      setPrefs(prefData.preferences);
      setProfileType(linkData.profile_type || prefData.preferences.profile_type || 'standard');
      const entries = await Promise.all((linkData.active_children || []).map(async link => {
        try {
          const result = await api(`/api/family/children/${link.child.id}/settings`);
          return [String(link.child.id), result.preferences];
        } catch { return [String(link.child.id), null]; }
      }));
      setChildPrefs(Object.fromEntries(entries));
    } catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const saveProfileType = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const result = await api('/api/preferences', { method:'PUT', body:JSON.stringify({ profile_type: profileType }) });
      setPrefs(result.preferences); notify('Profile type saved.'); await load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const sendLinkRequest = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const result = await api('/api/family/link-requests', { method:'POST', body:JSON.stringify({ child_email: childEmail }) });
      notify(result.message); setChildEmail(''); await load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const respondLink = async (id, accept) => {
    try {
      const result = await api(`/api/family/link-requests/${id}/respond`, { method:'POST', body:JSON.stringify({ accept }) });
      notify(result.message); await load();
    } catch (error) { notify(error.message, 'error'); }
  };
  const revokeLink = async id => {
    if (!window.confirm('End this family link? The parent control relationship will stop.')) return;
    try {
      const result = await api(`/api/family/links/${id}`, { method:'DELETE' });
      notify(result.message); await load();
    } catch (error) { notify(error.message, 'error'); }
  };
  const saveChildSettings = async (event, childId) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setSaving(true);
    const body = {
      daily_limit_minutes: Number(data.get('daily_limit_minutes')),
      session_limit_minutes: Number(data.get('session_limit_minutes')),
      break_reminder_minutes: Number(data.get('break_reminder_minutes')),
      content_restriction_level: String(data.get('content_restriction_level')),
      blocked_topics: String(data.get('blocked_topics') || '').split(',').map(x => x.trim()).filter(Boolean),
      reduce_repetition: form.elements.reduce_repetition.checked,
      allow_public_posts: form.elements.allow_public_posts.checked,
      allow_external_links: form.elements.allow_external_links.checked,
    };
    try {
      const result = await api(`/api/family/children/${childId}/settings`, { method:'PUT', body:JSON.stringify(body) });
      setChildPrefs(current => ({ ...current, [String(childId)]: result.preferences }));
      notify(result.message);
      await load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };

  const pending = (links.incoming || []).filter(link => link.status === 'pending');
  const activeGuardian = (links.incoming || []).filter(link => link.status === 'active');
  const activeChildren = links.active_children || [];
  return <div className="page-entrance">
    <Seo title="Family controls" description="Manage parent-child linking and age-appropriate safety settings with clear consent and privacy boundaries." />
    <PageHeader eyebrow="SAFETY WITH CONSENT" title={<>Family controls<br /><em>with clear boundaries.</em></>} description="Choose your MindFeed profile, link a guardian and child account with the child’s approval, and manage applicable safety settings." icon={Users} />
    <section className="panel settings-panel family-profile-card">
      <div className="settings-section-title"><span className="control-icon green"><UserCheck size={19} /></span><div><h2>Your profile type</h2><p>Parent-child linking requires explicit acceptance from the child account. This demonstration does not verify legal guardianship.</p></div></div>
      <form className="family-profile-form" onSubmit={saveProfileType}>
        <label className="field-label">Profile type<select value={profileType} onChange={event => setProfileType(event.target.value)}><option value="standard">Standard user</option><option value="student">Student</option><option value="parent">Parent / guardian</option><option value="child">Child</option></select></label>
        <button className="button button-dark" type="submit" disabled={saving}>{saving ? <Spinner /> : <Check size={15} />} Save profile type <ArrowRight size={14} /></button>
      </form>
      <p className="form-note">Profile type cannot be changed while an active family link exists. Child mode activates stricter defaults and requires human review before public posts are published.</p>
    </section>
    {loading ? <PageLoader title="Loading family settings…" /> : profileType === 'parent' ? <>
      <section className="panel settings-panel">
        <div className="settings-section-title"><span className="control-icon green"><Users size={19} /></span><div><h2>Request a family link</h2><p>Enter the email address of an existing MindFeed account using Child profile. The child must accept before controls become active.</p></div></div>
        <form className="family-profile-form" onSubmit={sendLinkRequest}><label className="field-label">Child account email<input type="email" required maxLength={254} value={childEmail} onChange={event => setChildEmail(event.target.value)} placeholder="child@example.com" /></label><button className="button button-dark" type="submit" disabled={saving}>{saving ? <Spinner /> : <Send size={15} />} Send link request</button></form>
      </section>
      {activeChildren.length ? activeChildren.map(link => {
        const child = link.child; const childId = child?.id; const cp = childPrefs[String(childId)] || {};
        return <section className="panel settings-panel" key={link.id}>
          <div className="settings-section-title"><span className="control-icon violet"><ShieldCheck size={19} /></span><div><h2>Safety settings for {child?.name || 'Child account'}</h2><p>Linked with consent · {child?.email}</p></div><button className="button button-outline button-small" type="button" onClick={() => revokeLink(link.id)}>End link</button></div>
          <form className="family-settings-form" onSubmit={event => saveChildSettings(event, childId)}>
            <div className="form-grid"><label className="field-label">Daily limit (minutes)<input name="daily_limit_minutes" type="number" min="5" max="180" required defaultValue={cp.daily_limit_minutes ?? 60} /></label><label className="field-label">Session limit (minutes)<input name="session_limit_minutes" type="number" min="5" max="120" required defaultValue={cp.session_limit_minutes ?? 30} /></label><label className="field-label">Break reminder (minutes)<input name="break_reminder_minutes" type="number" min="1" max="30" required defaultValue={cp.break_reminder_minutes ?? 5} /></label><label className="field-label">Content restrictions<select name="content_restriction_level" defaultValue={cp.content_restriction_level || 'strict'}><option value="strict">Strict</option><option value="standard">Standard</option></select></label><label className="field-label full-field">Blocked topics (comma-separated)<input name="blocked_topics" defaultValue={(cp.blocked_topics || []).join(', ')} placeholder="Example: Gambling, Adult content" /></label></div>
            <div className="family-checkboxes"><label><input type="checkbox" name="reduce_repetition" defaultChecked={cp.reduce_repetition !== false} /> Reduce repeated topics</label><label><input type="checkbox" name="allow_public_posts" defaultChecked={!!cp.allow_public_posts} /> Allow public posts</label><label><input type="checkbox" name="allow_external_links" defaultChecked={!!cp.allow_external_links} /> Allow external links</label></div>
            <button className="button button-dark" type="submit" disabled={saving}>{saving ? <Spinner /> : <Check size={15} />} Save child settings</button><p className="form-note">Strict mode disables external links. Public posts made while Child Mode is active always go to human review.</p>
          </form>
        </section>;
      }) : <EmptyState icon={Users} title="No linked child accounts yet" description="Once a child accepts your request, their safety settings will appear here." />}
      {(links.outgoing || []).filter(link => link.status !== 'active').length > 0 && <section className="panel list-panel"><div className="panel-heading"><div><h2>Previous requests</h2><p>Pending and ended requests</p></div></div>{links.outgoing.filter(link => link.status !== 'active').map(link => <article className="activity-row" key={link.id}><div className="activity-row-copy"><b>{link.child?.name || link.child?.email || 'Child account'}</b><p>{link.child?.email}</p></div><span className="badge badge-neutral">{link.status}</span>{link.status === 'pending' && <button className="button button-outline button-small" onClick={() => revokeLink(link.id)}>Cancel request</button>}</article>)}</section>}
    </> : profileType === 'child' ? <section className="panel list-panel">
      <div className="panel-heading"><div><h2>Guardian requests</h2><p>Accept only people you recognize. You can end an active relationship later.</p></div><span className="panel-count">{pending.length}</span></div>
      {pending.length ? pending.map(link => <article className="activity-row" key={link.id}><div className="activity-row-copy"><b>{link.guardian?.name || 'Parent / guardian'}</b><p>{link.guardian?.email}</p><small>Requested {formatTime(link.created_at)}</small></div><div className="activity-row-end"><button className="button button-dark button-small" onClick={() => respondLink(link.id, true)}>Accept</button><button className="button button-outline button-small" onClick={() => respondLink(link.id, false)}>Decline</button></div></article>) : <EmptyState icon={Users} title="No pending requests" description="Guardian linking requires your explicit consent before parent controls become active." />}
      {activeGuardian.length > 0 && <><div className="settings-panel-header"><h2>Active guardian links</h2><p>These accounts can manage the safety settings you accepted.</p></div>{activeGuardian.map(link => <article className="activity-row" key={link.id}><div className="activity-row-copy"><b>{link.guardian?.name || 'Guardian'}</b><p>{link.guardian?.email}</p></div><span className="badge badge-lime">Active</span><button className="button button-outline button-small" onClick={() => revokeLink(link.id)}>End link</button></article>)}</>}
      <div className="settings-info-row"><span>Child Mode</span><b>Active</b></div><div className="settings-info-row"><span>External links</span><b>{prefs?.allow_external_links ? 'Allowed' : 'Restricted'}</b></div>
    </section> : <div className="family-info-grid"><section className="panel settings-panel"><span className="control-icon green"><ShieldCheck size={20} /></span><h2>For parents and guardians</h2><p>Choose Parent / guardian above, then request a link to an account using Child profile. The child must accept before controls are applied.</p></section><section className="panel settings-panel"><span className="control-icon violet"><BookOpen size={20} /></span><h2>For children and students</h2><p>Choose Child to activate stricter defaults and review guardian requests. Study Mode remains available separately.</p></section></div>}
    <div className="wellbeing-disclaimer"><Info size={17} /><div><b>Privacy boundary</b><p>This workflow stores link requests and child settings. It does not verify legal guardianship or monitor activity outside MindFeed. Public deployment requires stronger guardian verification and a child privacy review.</p></div></div>
  </div>;
}

function SettingsPage() {
  const { user, setUser } = useAuth();
  const { notify, dark, toggleTheme } = useUI();
  const [prefs, setPrefs] = useState(null);
  const [profile, setProfile] = useState({ name: user?.name || '', bio: user?.bio || '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  useEffect(() => { api('/api/preferences').then(x => setPrefs(x.preferences)).catch(e => notify(e.message, 'error')).finally(() => setLoading(false)); }, []);
  const saveProfile = async e => { e.preventDefault(); setSavingProfile(true); try { const data = await api('/api/auth/profile', { method:'PATCH', body:JSON.stringify(profile) }); setUser(data.user); setProfile({ name:data.user.name, bio:data.user.bio }); notify('Profile updated.'); } catch (e) { notify(e.message, 'error'); } finally { setSavingProfile(false); } };
  const savePrefs = async () => { setSavingPrefs(true); try { const data = await api('/api/preferences', { method:'PUT', body:JSON.stringify(prefs) }); setPrefs(data.preferences); notify('Preferences saved to your account.'); } catch (e) { notify(e.message, 'error'); } finally { setSavingPrefs(false); } };
  if (loading || !prefs) return <PageLoader title="Opening your settings…" />;
  return <div className="page-entrance"><Seo title="Settings" description="Manage your profile, privacy-conscious preferences, theme and MindFeed account settings." /><PageHeader eyebrow="YOUR SPACE, YOUR SETTINGS" title={<>The details that make<br /><em>it feel like you.</em></>} description="Manage your profile, control how MindFeed behaves, and review your account preferences." icon={Settings2} /><div className="settings-layout"><aside className="settings-nav panel">{[{id:'profile',icon:User,label:'Profile'},{id:'feed',icon:SlidersHorizontal,label:'Feed preferences'},{id:'appearance',icon:Sun,label:'Appearance'},{id:'privacy',icon:LockKeyhole,label:'Privacy & data'}].map(({id,icon:Icon,label}) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><Icon size={17} />{label}<ChevronRight size={15} /></button>)}</aside><div className="settings-content panel">{activeTab === 'profile' && <><div className="settings-panel-header"><span className="eyebrow">YOUR PROFILE</span><h2>About you</h2><p>This is how you appear around MindFeed.</p></div><div className="profile-preview"><Avatar user={{ ...user, name:profile.name }} size="xl" /><div><b>{profile.name || user?.name}</b><span>{user?.email}</span><small>{user?.role === 'moderator' ? 'Community guide' : 'MindFeed member'}</small></div><span className="profile-private"><LockKeyhole size={13} /> Private account details</span></div><form className="settings-form" onSubmit={saveProfile}><label>Display name<input value={profile.name} onChange={e => setProfile({ ...profile, name:e.target.value })} minLength={2} maxLength={80} required /></label><label>Short bio<textarea value={profile.bio} onChange={e => setProfile({ ...profile, bio:e.target.value })} rows={3} maxLength={300} placeholder="A few words about what you're curious about…" /></label><div className="settings-form-footer"><span>{profile.bio.length}/300 characters</span><button className="button button-dark" disabled={savingProfile}>{savingProfile ? <Spinner /> : <Check size={15} />} Save profile</button></div></form></>}
    {activeTab === 'feed' && <><div className="settings-panel-header"><span className="eyebrow">YOUR RECOMMENDATION RULES</span><h2>What should your feed feel like?</h2><p>Choose a default ranking style. You can fine-tune interests in Distraction Shield.</p></div><div className="settings-select-stack">{[{id:'balanced',title:'A thoughtful mix',desc:'Balance relevance, recency and diversity.'},{id:'relevance',title:'Familiar interests',desc:'Prioritize the subjects you chose.'},{id:'latest',title:'Latest first',desc:'Show newer posts first.'},{id:'diverse',title:'More variety',desc:'Give different topics a chance.'}].map(x => <button key={x.id} className={`settings-option ${prefs.feed_mode === x.id ? 'selected' : ''}`} onClick={() => setPrefs({ ...prefs, feed_mode:x.id })}><span className="option-radio">{prefs.feed_mode === x.id && <i />}</span><span><b>{x.title}</b><small>{x.desc}</small></span></button>)}</div><ToggleRow title="Reduce repeated topics" description="Try a different topic when relevant options are available." checked={prefs.reduce_repetition} onChange={v => setPrefs({ ...prefs, reduce_repetition:v })} /><div className="settings-form-footer"><span>Changes are not applied until saved.</span><button className="button button-dark" disabled={savingPrefs} onClick={savePrefs}>{savingPrefs ? <Spinner /> : <Check size={15} />} Save preferences</button></div><Link className="settings-link" to="/distraction-shield">Open full Distraction Shield settings <ArrowRight size={14} /></Link></>}
    {activeTab === 'appearance' && <><div className="settings-panel-header"><span className="eyebrow">LOOK & FEEL</span><h2>A space that feels comfortable.</h2><p>Choose the appearance that works for you. Your selection is stored in this browser.</p></div><div className="theme-choices"><button className={!dark ? 'selected' : ''} onClick={() => { if (dark) toggleTheme(); }}><span className="theme-preview theme-preview-light"><i></i><i></i><i></i></span><b>Light</b><small>Bright, calm, clear</small>{!dark && <CheckCircle2 size={17} />}</button><button className={dark ? 'selected' : ''} onClick={() => { if (!dark) toggleTheme(); }}><span className="theme-preview theme-preview-dark"><i></i><i></i><i></i></span><b>Dark</b><small>Quiet, low-glare</small>{dark && <CheckCircle2 size={17} />}</button></div><div className="setting-info-box"><Info size={16} /><p>Appearance is stored locally in this browser. It is not part of your public profile.</p></div></>}
    {activeTab === 'privacy' && <><div className="settings-panel-header"><span className="eyebrow">PRIVACY BY DESIGN</span><h2>Your data deserves care.</h2><p>MindFeed aims to collect only what is needed for the features you use.</p></div><div className="privacy-setting-list"><div><span className="privacy-icon"><DatabaseIcon /></span><div><b>Your preferences</b><p>Interests, topic filters and well-being settings are stored against your account.</p></div><span className="badge badge-lime">Account data</span></div><div><span className="privacy-icon"><ShieldCheck size={17} /></span><div><b>AI assessment records</b><p>Fact-checks and moderation decisions can be retained to show results and support review.</p></div><span className="badge badge-neutral">Limited records</span></div><div><span className="privacy-icon"><Activity size={17} /></span><div><b>Usage tracking</b><p>Active-time accounting runs while this app is visible. It cannot track other websites.</p></div><span className="badge badge-neutral">In-app only</span></div></div><div className="settings-disclaimer"><Info size={16} /><p>This is a project demonstrator. Before public launch, document formal retention periods, deletion workflows, applicable age-related requirements and any analytics providers used.</p></div><Link className="settings-link" to="/privacy">Read the privacy principles page <ArrowRight size={14} /></Link></>}
    </div></div></div>;
}
function DatabaseIcon() { return <Activity size={17} />; }

function MyPostsPage() {
  const { notify } = useUI();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appeal, setAppeal] = useState(null);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const data = await api('/api/posts/mine'); setPosts(data.items || []); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const submitAppeal = async e => { e.preventDefault(); try { const result = await api('/api/appeals', { method:'POST', body:JSON.stringify({ post_id:appeal.id, reason }) }); notify(result.message); setAppeal(null); setReason(''); load(); } catch (e) { notify(e.message, 'error'); } };
  return <div className="page-entrance"><Seo title="My posts" description="Review your published posts, moderation states and appeal options." /><PageHeader eyebrow="YOUR CONTRIBUTIONS" title={<>Things you’ve<br /><em>put into the world.</em></>} description="Track your posts, see their current status, and appeal a decision when a post needs another look." icon={FileText} /><div className="my-posts-toolbar"><span>{posts.length} post{posts.length !== 1 ? 's' : ''} from your account</span><button className="button button-dark" onClick={() => window.dispatchEvent(new CustomEvent('mindfeed:composer-open'))}><Plus size={15} /> Create post</button></div>{loading ? <PageLoader title="Loading your posts…" /> : posts.length ? <div className="my-post-list">{posts.map(post => <div className="my-post-row" key={post.id}><div className={`my-post-icon ${post.status === 'approved' ? 'is-approved' : post.status === 'pending_review' ? 'is-pending' : 'is-rejected'}`}>{post.status === 'approved' ? <CheckCircle2 size={19} /> : post.status === 'pending_review' ? <Clock3 size={19} /> : <ShieldAlert size={19} />}</div><div className="my-post-copy"><div className="my-post-top"><span className={`badge ${post.status === 'approved' ? 'badge-lime' : post.status === 'pending_review' ? 'badge-orange' : 'badge-neutral'}`}>{post.status.replaceAll('_', ' ')}</span><span className="small-muted">{formatTime(post.created_at)} · {post.topic}</span></div><p>{post.content}</p>{post.moderation_reason && <small className="moderation-reason-text">{post.moderation_reason}</small>}</div><div className="my-post-end"><span><Heart size={14} /> {post.likes_count}</span>{post.status !== 'approved' && <button className="button button-outline button-small" onClick={() => { setAppeal(post); setReason(''); }}>Appeal <ArrowRight size={13} /></button>}</div></div>)}</div> : <EmptyState icon={FileText} title="Your story starts here" description="Your posts and their moderation status will appear here after you publish something." action="Create your first post" onAction={() => window.dispatchEvent(new CustomEvent('mindfeed:composer-open'))} />}{appeal && <Dialog title="Appeal a moderation decision" onClose={() => setAppeal(null)}><div className="appeal-context"><span className="badge badge-orange">{appeal.status.replaceAll('_', ' ')}</span><p>{appeal.content}</p></div><form onSubmit={submitAppeal} className="dialog-form"><label>Why should this post be reviewed again?<textarea rows={4} minLength={10} required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the context or why you believe the decision needs another look…" /></label><div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => setAppeal(null)}>Cancel</button><button className="button button-dark" disabled={reason.trim().length < 10}>Submit appeal <ArrowRight size={15} /></button></div></form></Dialog>}</div>;
}

function ActivityPage() {
  const { notify } = useUI();
  const [reports, setReports] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('reports');
  const load = useCallback(async () => { setLoading(true); try { const [r,a] = await Promise.all([api('/api/reports/mine'), api('/api/appeals/mine')]); setReports(r.items || []); setAppeals(a.items || []); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="page-entrance"><Seo title="Reports & appeals" description="Track the status of reports and appeals submitted from your MindFeed account." /><PageHeader eyebrow="A CLEAR RECORD OF ACTIONS" title={<>Your voice has<br /><em>a place here.</em></>} description="Review the reports you've submitted and any appeals attached to your posts." icon={Activity} /><div className="review-tabs activity-tabs"><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>My reports <span>{reports.length}</span></button><button className={tab === 'appeals' ? 'active' : ''} onClick={() => setTab('appeals')}>My appeals <span>{appeals.length}</span></button><button className="review-refresh" onClick={load}><RefreshCcw size={15} /> Refresh</button></div>{loading ? <PageLoader title="Loading your activity…" /> : tab === 'reports' ? reports.length ? <div className="activity-list">{reports.map(r => <div key={r.id} className="activity-row"><span className="activity-row-icon"><Flag size={17} /></span><div><b>Report #{r.id} · {r.target_type}</b><p>{r.reason}</p><small>{r.details || 'No additional details'}</small></div><div className="activity-row-end"><span className={`badge ${r.status === 'resolved' ? 'badge-lime' : 'badge-orange'}`}>{r.status}</span><small>{formatTime(r.created_at)}</small></div></div>)}</div> : <EmptyState icon={Flag} title="No reports submitted yet" description="If something looks wrong or concerning, use the report action on a post or account. Your report status will be shown here." /> : appeals.length ? <div className="activity-list">{appeals.map(a => <div key={a.id} className="activity-row"><span className="activity-row-icon lilac"><FileCheck2 size={17} /></span><div><b>Appeal #{a.id} · Post #{a.post_id}</b><p>{a.reason}</p></div><div className="activity-row-end"><span className={`badge ${a.status === 'resolved' ? 'badge-lime' : 'badge-orange'}`}>{a.status}</span><small>{formatTime(a.created_at)}</small></div></div>)}</div> : <EmptyState icon={FileCheck2} title="No appeals yet" description="If one of your posts is sent for review or rejected, you can request another look from My Posts." action="View my posts" onAction={() => window.location.assign('/my-posts')} />}</div>;
}

function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const { notify, setReportTarget } = useUI();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(q);
  const navigate = useNavigate();
  useEffect(() => { let active = true; if (!q.trim()) { setItems([]); setLoading(false); return; } setLoading(true); api(`/api/search?q=${encodeURIComponent(q)}`).then(d => { if (active) setItems(d.items || []); }).catch(e => notify(e.message, 'error')).finally(() => active && setLoading(false)); return () => { active = false; }; }, [q]);
  const search = e => { e.preventDefault(); if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`); };
  return <div className="page-entrance"><Seo title="Search MindFeed" description="Search public posts and topics available in your MindFeed community." /><PageHeader eyebrow="FIND YOUR THREAD" title={<>Curiosity starts<br /><em>with a search.</em></>} description="Look through public community posts and topics. Your blocked topics stay out of search results too." icon={Search} /><form className="large-search-form" onSubmit={search}><Search size={20} /><input autoFocus aria-label="Search public posts" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try design, science, learning…" /><button className="button button-dark" type="submit">Search <ArrowRight size={15} /></button></form>{q && <div className="search-results-heading"><div><span className="eyebrow">RESULTS FOR</span><h2>“{q}”</h2></div><span>{items.length} result{items.length !== 1 ? 's' : ''}</span></div>}{loading ? <PageLoader title="Searching public posts…" /> : items.length ? <div className="feed-list search-result-list">{items.map(post => <PostCard key={post.id} post={post} onLike={async () => { try { const data = await api(`/api/posts/${post.id}/like`, { method:'POST', body:'{}' }); setItems(current => current.map(p => p.id === post.id ? { ...p, liked_by_me:data.liked, likes_count:data.likes_count } : p)); } catch (e) { notify(e.message,'error'); } }} onFeedback={async action => { try { await api(`/api/posts/${post.id}/feedback`, { method:'POST', body:JSON.stringify({action}) }); notify('Your feedback was saved.'); } catch (e) { notify(e.message,'error'); } }} onReport={() => setReportTarget({ type:'post', id:post.id, label:`post by ${post.author?.name}` })} />)}</div> : q ? <EmptyState icon={Search} title="No matches this time" description="Try a different phrase or explore another topic. Search respects your blocked topic preferences." action="Back to your feed" onAction={() => navigate('/feed')} /> : <div className="search-discover"><span className="eyebrow">A FEW PLACES TO START</span><div>{TOPICS.map(t => <button key={t} onClick={() => { setQuery(t); navigate(`/search?q=${encodeURIComponent(t)}`); }}>{t} <ArrowUpRight size={14} /></button>)}</div></div>}</div>;
}

function ComposerModal({ onClose }) {
  const { notify } = useUI();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('Design');
  const [format, setFormat] = useState('Post');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const analyze = async e => { e.preventDefault(); if (content.trim().length < 3) { notify('Write a little more before checking your post.', 'error'); return; } setLoading(true); try { const result = await api('/api/moderation/check', { method:'POST', body:JSON.stringify({ content }) }); setAssessment(result); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } };
  const publish = async () => { setPublishing(true); try { const result = await api('/api/posts', { method:'POST', body:JSON.stringify({ content, topic, format, image_url:imageUrl.trim() || null }) }); notify(result.message, result.post.status === 'approved' ? 'success' : 'info'); window.dispatchEvent(new Event('mindfeed:data-changed')); onClose(); if (result.post.status !== 'approved') navigate('/my-posts'); else navigate('/feed'); } catch (e) { notify(e.message, 'error'); } finally { setPublishing(false); } };
  const updateContent = value => { setContent(value); setAssessment(null); };
  const hasMedia = Boolean(imageUrl.trim()) && (format === 'Photo' || format === 'Video');
  const canPublish = content.trim().length >= 3 || (!content.trim() && hasMedia);
  return <Dialog title="Share something worth thinking about" onClose={onClose} wide><form onSubmit={analyze} className="composer-form"><div className="composer-modal-intro"><span className="composer-modal-icon"><Sparkles size={19} /></span><div><b>A little thought can travel far.</b><p>MindFeed checks public posts before publishing and gives uncertain cases a second look.</p></div></div><label className="composer-text-label" htmlFor="post-content">Your post<textarea id="post-content" rows={5} autoFocus required={format === 'Post' || format === 'Link'} minLength={3} maxLength={4000} value={content} onChange={e => updateContent(e.target.value)} placeholder="What’s on your mind? Share an idea, a question, or something you learned…" /></label><div className="composer-char-row"><span>{content.length}/4,000 characters</span><span><ShieldCheck size={13} /> Pre-publication checks enabled</span></div><div className="composer-meta-grid"><label>Topic<select value={topic} onChange={e => { setTopic(e.target.value); setAssessment(null); }}>{TOPICS.map(t => <option key={t} value={t}>{t}</option>)}</select></label><label>Format<select value={format} onChange={e => { setFormat(e.target.value); setAssessment(null); }}><option>Post</option><option>Photo</option><option>Video</option><option>Link</option></select></label></div>{(format === 'Photo' || format === 'Video' || format === 'Link') && <><label>Upload an image or video (max 20 MB)<input type="file" accept={format === 'Video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp,image/gif'} disabled={uploadingMedia} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; const data = new FormData(); data.append('file', file); setUploadingMedia(true); try { const result = await api('/api/media/upload', { method:'POST', body:data }); setImageUrl(result.url); setFormat(result.media_type === 'video' ? 'Video' : 'Photo'); setAssessment(null); notify('Media uploaded and ready to publish.'); } catch (error) { notify(error.message, 'error'); } finally { setUploadingMedia(false); e.target.value = ''; } }} /></label><label>Or use a media URL<input type="url" maxLength={1000} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" /></label>{uploadingMedia && <div className="micro-note"><Spinner /> Uploading media…</div>}{imageUrl && <div className="upload-preview">{format === 'Video' ? <video src={imageUrl} controls muted /> : <img src={imageUrl} alt="Selected media preview" />}<span>Preview ready</span></div>}</>}
    {assessment && <div className={`moderation-preview ${assessment.status === 'approved' ? 'moderation-approved' : 'moderation-review'}`}><span className="moderation-preview-icon">{assessment.status === 'approved' ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}</span><div><b>{assessment.status === 'approved' ? 'No demo-rule flags found' : 'A second look is recommended'}</b><p>{assessment.message}</p>{assessment.reasons?.map(r => <span className="moderation-reason-chip" key={r}>{r}</span>)}<small>Local demonstration rules only. This is not a trained safety model and cannot guarantee that content is safe.</small></div></div>}
    <div className="composer-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-outline" disabled={loading || !content.trim()}>{loading ? <Spinner /> : <ShieldCheck size={15} />} Check post</button><button type="button" className="button button-dark" onClick={publish} disabled={publishing || uploadingMedia || !canPublish}>{publishing ? <Spinner /> : <Send size={15} />} {assessment?.status === 'needs_review' ? 'Submit for review' : 'Publish post'}</button></div></form></Dialog>;
}

function ReportModal({ target, onClose }) {
  const { notify } = useUI();
  const [reason, setReason] = useState(target.type === 'account' ? 'Possible impersonation' : 'Misleading or harmful content');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async e => { e.preventDefault(); setLoading(true); try { const result = await api('/api/reports', { method:'POST', body:JSON.stringify({ target_type:target.type, target_id:target.id || null, reason, details }) }); notify(`${result.message} Reference #${result.id}.`); onClose(); } catch (e) { notify(e.message, 'error'); } finally { setLoading(false); } };
  const reasons = target.type === 'account' ? ['Possible impersonation', 'Suspicious automated activity', 'Harassment or abuse', 'Spam', 'Other concern'] : target.type === 'factcheck' ? ['Incorrect or incomplete assessment', 'Missing evidence', 'Broken source link', 'Other concern'] : ['Misleading or harmful content', 'Harassment or abuse', 'Spam or repetitive content', 'Impersonation', 'Other concern'];
  return <Dialog title="Report for review" onClose={onClose}><div className="report-modal-target"><span className="report-modal-icon"><Flag size={18} /></span><div><b>{target.label || `Report ${target.type}`}</b><small>Reports are stored and routed to the review queue.</small></div></div><form className="dialog-form" onSubmit={submit}><label>What’s the concern?<select value={reason} onChange={e => setReason(e.target.value)}>{reasons.map(r => <option key={r}>{r}</option>)}</select></label><label>Additional context (optional)<textarea rows={3} value={details} onChange={e => setDetails(e.target.value)} maxLength={2000} placeholder="Share enough detail for a reviewer to understand the issue…" /></label><div className="dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-dark" disabled={loading}>{loading ? <Spinner /> : <Flag size={15} />} Submit report</button></div></form></Dialog>;
}

function Dialog({ title, children, onClose, wide = false }) {
  useEffect(() => { const fn = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div><div className="dialog-body">{children}</div></section></div>;
}

function CookieBanner({ onClose }) {
  const [details, setDetails] = useState(false);
  return <div className="cookie-banner"><span className="cookie-icon"><ShieldCheck size={19} /></span><div className="cookie-copy"><b>A little transparency about storage.</b><p>MindFeed uses essential browser storage to keep your sign-in and remember your theme and consent choice. Optional analytics are not enabled by default.{details && ' If analytics is configured later, it should respect the consent choice and disclose the provider before collecting optional data.'}</p>{details && <Link to="/privacy" onClick={() => onClose('essential')}>Read privacy principles <ArrowRight size={13} /></Link>}</div><div className="cookie-actions"><button className="button button-quiet" onClick={() => setDetails(v => !v)}>{details ? 'Less detail' : 'Details'}</button><button className="button button-outline" onClick={() => onClose('essential')}>Essential only</button><button className="button button-dark" onClick={() => onClose('all')}>Allow all</button></div></div>;
}

function PublicPage({ type }) {
  const isAbout = type === 'about';
  return <div className="public-page"><Seo title={isAbout ? 'About MindFeed' : 'Privacy principles'} description={isAbout ? 'Learn about MindFeed’s approach to explainable, user-controlled social media.' : 'MindFeed privacy principles for personalization, safety, usage data and responsible AI.'} /><header className="public-nav wrap-wide"><Link to="/" className="landing-brand"><Logo /></Link><div><Link className="button button-quiet" to="/">Home</Link><Link className="button button-dark" to="/signin">Enter MindFeed <ArrowRight size={15} /></Link></div></header><main className="public-content"><span className="eyebrow"><span className="eyebrow-dot"></span>{isAbout ? 'THE IDEA BEHIND MINDFEED' : 'PRIVACY BY DESIGN'}</span><h1>{isAbout ? <>Technology should<br /><em>give you a say.</em></> : <>Your data is part of<br /><em>your trust.</em></>}</h1><p className="public-lead">{isAbout ? 'MindFeed explores a more thoughtful social experience: one where people can shape their recommendations, inspect evidence, and choose how they spend their attention.' : 'MindFeed is built around clear choices, limited data use, and honest explanations about what the application can and cannot verify.'}</p>{isAbout ? <div className="public-prose"><h2>Five ideas, one connected platform</h2><p>TrustID offers account-trust workflows. SafePost AI supports pre-publication moderation. TruthCheck AI presents claim assessments with sources and uncertainty. Adaptive AI Feed puts personalization under user control. Distraction Shield connects topic filters with digital well-being.</p><h2>AI should be explainable</h2><p>An automated score is not proof of wrongdoing. A missing source is not proof that a claim is false. MindFeed aims to make uncertainty visible and provide human review for appropriate cases.</p><h2>A transparent demonstrator</h2><p>This project includes local demonstration rules and a small curated fact-check catalogue when external AI/search providers are not configured. The interface identifies those limitations. Live model inference and live multi-source fact-checking require separately configured providers.</p></div> : <div className="public-prose"><h2>What the application stores</h2><p>Account details, feed preferences, posts, feedback, fact-check records, reports, appeals, and usage totals are stored to support the application's features. The local build uses a project database; production deployment should apply suitable access controls, retention policies, deletion workflows, backups and encryption.</p><h2>AI and external providers</h2><p>This demonstrator uses rule-based moderation fallback and a small curated evidence catalogue by default. No external AI provider or analytics provider is automatically configured. If integrations are added, their data use and privacy implications should be documented before launch.</p><h2>Usage tracking</h2><p>TimeGuard tracks activity reported by the MindFeed web application. It cannot monitor unrelated websites or devices, and browser-level active-time accounting may be approximate.</p><h2>Children and guardians</h2><p>Child-friendly features and parent-child controls are part of the intended product architecture. Before public deployment, guardian linking, age-appropriate permissions, legal requirements and privacy boundaries must be reviewed and tested for the target jurisdiction.</p><h2>Before production use</h2><p>This project page is an implementation overview, not legal advice or a substitute for a finalized privacy policy. Production release requires an accurate policy covering the real hosting, models, external services, data retention, user rights, and applicable law.</p></div>}<div className="public-callout"><ShieldCheck size={21} /><div><b>Make the limitations visible.</b><p>We prefer a clearly labeled uncertainty over a confident claim the system cannot support.</p></div></div><Link className="button button-dark" to="/">Back to MindFeed <ArrowLeft size={15} /></Link></main><footer className="landing-footer wrap-wide"><Link to="/" className="landing-brand"><Logo /></Link><span>© {new Date().getFullYear()} MindFeed</span><div><Link to="/about">About</Link><Link to="/privacy">Privacy</Link></div></footer></div>;
}

function NotFoundPage() {
  return <div className="not-found-page"><Seo title="Page not found" description="The page you were looking for could not be found on MindFeed." /><div className="not-found-number">4<span>0</span>4</div><span className="eyebrow"><span className="eyebrow-dot"></span> A SMALL DETOUR</span><h1>This page went<br /><em>off the feed.</em></h1><p>That link doesn't lead anywhere here. Let's get you back to something useful.</p><Link className="button button-dark button-large" to="/">Back to home <ArrowLeft size={16} /></Link><div className="not-found-footer"><Logo /><span>MindFeed · Your Feed. Your Mind. Your Rules.</span></div></div>;
}

function PageLoader({ title = 'Loading…' }) { return <div className="page-loader"><Spinner /><span>{title}</span></div>; }

export default App;
