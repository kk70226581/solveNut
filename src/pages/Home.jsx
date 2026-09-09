import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import '../styles/Home.css';
import '../styles/HelpBot.css';
import HelpBot from '../components/HelpBot';

import { API } from '../utils/api';

/* ── Animated counter hook ── */
function useCounter(target, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || target == null) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

/* ── Intersection observer hook ── */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/* ── Static data ── */
const TESTIMONIALS = [
  {
    quote: "Solvenut helped me structure a career pivot I'd been overthinking for 2 years. Within one session I had a clear 90-day plan.",
    name: 'Priya Sharma', role: 'Product Manager → Founder', avatar: 'PS', color: '#22d3ee',
  },
  {
    quote: "The expert matched my exact situation — a startup exit and what to do next. Felt like talking to someone who'd been through it.",
    name: 'Marcus Bell', role: 'Ex-CTO, Series B startup', avatar: 'MB', color: '#34d399',
  },
  {
    quote: "I was about to make a $200k investment decision. Solvenut helped me see the trade-offs I was completely blind to.",
    name: 'Ananya R.', role: 'Angel Investor', avatar: 'AR', color: '#fbbf24',
  },
  {
    quote: "Not vague motivational advice — actual frameworks, prioritized steps, and someone who challenged my assumptions.",
    name: 'Daniel Osei', role: 'Operations Director', avatar: 'DO', color: '#a78bfa',
  },
  {
    quote: "I used Solvenut before a board-level conversation. The clarity I walked in with was completely different.",
    name: 'Sarah Kim', role: 'VP Engineering', avatar: 'SK', color: '#fb7185',
  },
  {
    quote: "Best 45 minutes I've spent on a professional decision. I finally stopped going in circles.",
    name: 'Rahul Menon', role: 'Senior Consultant', avatar: 'RM', color: '#38bdf8',
  },
];

const DEFAULT_EXPERTS = [
  { name: 'Dr. Elena Torres', domain: 'Career Transitions', exp: '14 yrs', sessions: 340, tag: 'Top rated', color: '#22d3ee', initial: 'ET' },
  { name: 'James Okafor', domain: 'Financial Planning', exp: '11 yrs', sessions: 285, tag: 'Finance expert', color: '#34d399', initial: 'JO' },
  { name: 'Neha Kapoor', domain: 'Business Strategy', exp: '9 yrs', sessions: 210, tag: 'Startup specialist', color: '#fbbf24', initial: 'NK' },
  { name: 'Leon Fischer', domain: 'Leadership & Growth', exp: '16 yrs', sessions: 420, tag: 'Executive coach', color: '#a78bfa', initial: 'LF' },
];

const DEFAULT_ACTIVITY_FEED = [
  { icon: '🎯', text: 'Career plan created', time: '2m ago' },
  { icon: '💼', text: 'Expert session completed', time: '8m ago' },
  { icon: '📈', text: 'Investment roadmap built', time: '15m ago' },
  { icon: '✅', text: 'Decision milestone reached', time: '22m ago' },
  { icon: '🚀', text: 'Business plan validated', time: '31m ago' },
];

const Home = () => {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpbotOpen, setHelpbotOpen] = useState(false);
  const [homeData, setHomeData] = useState(null);
  const [expertCount, setExpertCount] = useState(null);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const innerRef = useRef(null);

  const expertsShowcase = homeData?.experts?.length ? homeData.experts : DEFAULT_EXPERTS;
  const stats = homeData?.stats || {};

  const [statsRef, statsInView] = useInView(0.3);
  const expertCountTarget = stats.approvedExperts ?? expertCount ?? 48;
  const sessionsCount = useCounter(stats.sessionsCompleted ?? 1240, 2000, statsInView);
  const expertsAnimated = useCounter(expertCountTarget, 1600, statsInView);
  const satisfactionCount = useCounter(stats.clientSatisfaction ?? 97, 1400, statsInView);
  const decisionsCount = useCounter(stats.decisionsMade ?? 3800, 2200, statsInView);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const email = typeof window !== 'undefined' ? localStorage.getItem('email') : null;
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
  const normalizedRole = (role || '').toLowerCase();
  const dashboardPath = normalizedRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';
  const isLoggedIn = Boolean(token && email);

  const deriveHomeDataFromExperts = useCallback((experts = []) => {
    const palette = ['#22d3ee', '#34d399', '#fbbf24', '#a78bfa'];
    const initials = (name = '') => String(name).split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'EX';
    const safeExperts = Array.isArray(experts) ? experts : [];
    const sorted = [...safeExperts].sort((a, b) => (Number(b.avgRating || b.rating || 0) - Number(a.avgRating || a.rating || 0))
      || (Number(b.ratingsCount || 0) - Number(a.ratingsCount || 0)));
    const showcase = sorted.slice(0, 4).map((e, i) => ({
      name: e.name || 'Expert',
      domain: e.field || 'General Consulting',
      exp: `${Number(e.experience || 0)}+ yrs`,
      sessions: Number(e.ratingsCount || 0),
      tag: Number(e.avgRating || e.rating || 0) >= 4.7 ? 'Top rated' : 'Verified expert',
      color: palette[i % palette.length],
      initial: initials(e.name),
    }));
    const approvedExperts = safeExperts.length;
    const sessionsCompleted = safeExperts.reduce((sum, e) => sum + Number(e.ratingsCount || 0), 0);
    const totalRatingWeight = safeExperts.reduce((sum, e) => sum + Number(e.ratingsCount || 0), 0);
    const weightedRating = safeExperts.reduce((sum, e) => sum + (Number(e.avgRating || e.rating || 0) * Number(e.ratingsCount || 0)), 0);
    const avgRating = totalRatingWeight > 0 ? (weightedRating / totalRatingWeight) : 0;
    const clientSatisfaction = avgRating > 0 ? Math.round((avgRating / 5) * 100) : 97;
    const decisionsMade = sessionsCompleted + approvedExperts * 3;
    const activity = [
      { icon: '🎯', text: `${approvedExperts} approved experts active`, time: 'live' },
      { icon: '💼', text: `${sessionsCompleted} rated sessions completed`, time: 'live' },
      { icon: '📈', text: `Average expert rating ${avgRating ? avgRating.toFixed(1) : 'new'}`, time: 'live' },
      { icon: '✅', text: `${clientSatisfaction}% client satisfaction`, time: 'live' },
      { icon: '🚀', text: 'New consultations starting daily', time: 'live' },
    ];
    return {
      stats: { approvedExperts, sessionsCompleted, decisionsMade, clientSatisfaction },
      experts: showcase,
      activity,
    };
  }, []);

  /* Hero entrance */
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  /* Scroll header */
  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Body overflow */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  /* Escape key */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Fetch real home data */
  useEffect(() => {
    let mounted = true;
    fetch(`${API}/api/public-home-data`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!mounted || !data) return;
        setHomeData(data);
        const n = Number(data?.stats?.approvedExperts);
        if (Number.isFinite(n) && n >= 0) setExpertCount(n);
      })
      .catch(() => {
        fetch(`${API}/api/experts?status=approved`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!mounted || !Array.isArray(data)) return;
            setExpertCount(data.length);
            setHomeData(deriveHomeDataFromExperts(data));
          })
          .catch(() => {});
      });
    return () => { mounted = false; };
  }, [deriveHomeDataFromExperts]);

  /* Testimonial auto-rotate */
  useEffect(() => {
    const t = setInterval(() => setActiveTestimonial(v => (v + 1) % TESTIMONIALS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const go = useCallback((path) => { navigate(path); setMobileOpen(false); }, [navigate]);
  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileOpen(false);
  }, []);
  const handleLogout = () => {
    ['token', 'email', 'name', 'username', 'role'].forEach(k => localStorage.removeItem(k));
    navigate('/login');
  };

  return (
    <div className="hp">
      {/* ── Ambient canvas ── */}
      <div className="hp-canvas" aria-hidden>
        <div className="hp-orb hp-orb-1" />
        <div className="hp-orb hp-orb-2" />
        <div className="hp-orb hp-orb-3" />
        <div className="hp-grid" />
      </div>

      {/* ══════════ HEADER ══════════ */}
      <header className={`hp-header ${headerScrolled ? 'hp-header--scrolled' : ''}`} role="banner">
        <div className="hp-shell hp-header-inner">
          <button className="hp-logo" onClick={() => go('/')} aria-label="Solvenut home">
            <span className="hp-logo-text">Solve<span className="hp-logo-accent">nut</span></span>
          </button>

          <nav className="hp-nav" aria-label="Main navigation">
            {['why-solvenut', 'solutions', 'process', 'faq'].map(id => (
              <button key={id} className="hp-nav-link" onClick={() => scrollTo(id)}>
                {id === 'why-solvenut' ? 'Why Solvenut' : id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </nav>

          <div className="hp-nav-actions">
            {isLoggedIn ? (
              <>
                <button className="hp-btn hp-btn-ghost" onClick={() => go(dashboardPath)}>Dashboard</button>
                <button className="hp-btn hp-btn-primary" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <button className="hp-btn hp-btn-ghost" onClick={() => go('/login')}>Log in</button>
                <button className="hp-btn hp-btn-primary" onClick={() => go('/signup-client')}>
                  <span>Get started</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </>
            )}
          </div>

          <button className="hp-hamburger" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu" aria-expanded={mobileOpen}>
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
            <span className={mobileOpen ? 'open' : ''} />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      <div className={`hp-drawer ${mobileOpen ? 'hp-drawer--open' : ''}`} aria-hidden={!mobileOpen}
        onMouseDown={e => { if (!innerRef.current?.contains(e.target)) setMobileOpen(false); }}>
        <div className="hp-drawer-inner" ref={innerRef} onMouseDown={e => e.stopPropagation()}>
          <button className="hp-drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close">✕</button>
          {['why-solvenut', 'solutions', 'process', 'faq'].map(id => (
            <button key={id} className="hp-drawer-link" onClick={() => scrollTo(id)}>
              {id === 'why-solvenut' ? 'Why Solvenut' : id.charAt(0).toUpperCase() + id.slice(1)}
            </button>
          ))}
          <button className="hp-drawer-link" onClick={() => go('/experts')}>Browse experts</button>
          <div className="hp-drawer-actions">
            {isLoggedIn ? (
              <>
                <button className="hp-btn hp-btn-ghost full" onClick={() => go(dashboardPath)}>Dashboard</button>
                <button className="hp-btn hp-btn-primary full" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <button className="hp-btn hp-btn-ghost full" onClick={() => go('/login')}>Log in</button>
                <button className="hp-btn hp-btn-primary full" onClick={() => go('/signup-client')}>Get started</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ MAIN ══════════ */}
      <main className="hp-main">
        <div className="hp-shell">

          {/* ── HERO ── */}
          <section className={`hp-hero ${heroVisible ? 'hp-hero--visible' : ''}`}>
            <div className="hp-hero-layout">
              {/* Left copy */}
              <div className="hp-hero-copy">
                <div className="hp-hero-badge">
                  <span className="hp-hero-badge-dot" />
                  A flexible expert knowledge marketplace
                </div>

                <h1 className="hp-hero-title">
                  Real-world expertise,
                  <span className="hp-hero-gradient"> when you need it most</span>
                </h1>

                <p className="hp-hero-sub">
                  Solvenut connects you with experienced people across career, business, technology, academics, and more. They share practical knowledge in their available time, so you can get focused guidance at a clear per-session price — without traditional consulting overhead.
                </p>

                <div className="hp-hero-tags">
                  {['AI first', 'Book a human expert', 'Flexible availability', 'Clear session pricing'].map(tag => (
                    <span key={tag} className="hp-tag">{tag}</span>
                  ))}
                </div>

                <div className="hp-hero-ctas">
                  <button className="hp-btn hp-btn-primary hp-btn-lg"
                    onClick={() => isLoggedIn ? go(dashboardPath) : go('/signup-client')}>
                    {isLoggedIn ? 'Go to dashboard' : 'Find your next step'}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                  <button className="hp-btn hp-btn-outline hp-btn-lg" onClick={() => go('/ai-expert')}>
                    Try AI Expert
                  </button>
                </div>

                <div className="hp-social-proof">
                  <div className="hp-avatars">
                    {['#22d3ee','#34d399','#fbbf24','#a78bfa'].map((c,i) => (
                      <div key={i} className="hp-avatar" style={{ background: c, marginLeft: i ? '-10px' : 0 }} />
                    ))}
                  </div>
                  <div className="hp-proof-text">
                    <strong>2,400+ professionals</strong> made better decisions this year
                  </div>
                </div>
              </div>

              {/* Right panel */}
              <div className="hp-hero-panel">
                {/* Value preview card */}
                <div className="hp-value-card">
                  <div className="hp-value-card-head">
                    <div className="hp-value-icon">⚡</div>
                    <div>
                      <div className="hp-value-label">What you walk away with</div>
                      <div className="hp-value-sublabel">Every session delivers:</div>
                    </div>
                  </div>
                  {[
                    { icon: '🎯', label: 'Crystal-clear options', desc: 'Ranked by your priorities' },
                    { icon: '🗺️', label: 'Action roadmap', desc: 'Week-by-week milestones' },
                    { icon: '⚖️', label: 'Trade-off analysis', desc: 'Risks, costs & upside' },
                    { icon: '🔁', label: 'Follow-up plan', desc: 'Checkpoints & adjustments' },
                  ].map(({ icon, label, desc }) => (
                    <div key={label} className="hp-value-row">
                      <span className="hp-value-row-icon">{icon}</span>
                      <div className="hp-value-row-text">
                        <span className="hp-value-row-label">{label}</span>
                        <span className="hp-value-row-desc">{desc}</span>
                      </div>
                      <span className="hp-value-check">✓</span>
                    </div>
                  ))}
                </div>

                {/* Floating badge */}
                <div className="hp-float-badge">
                  <span className="hp-float-badge-emoji">🛡️</span>
                  <span>Vetted experts only</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── STATS BAR ── */}
          <div className="hp-stats-bar" ref={statsRef}>
            {[
              { value: expertsAnimated, suffix: '+', label: 'Approved experts' },
              { value: sessionsCount, suffix: '+', label: 'Sessions completed' },
              { value: decisionsCount, suffix: '+', label: 'Decisions made' },
              { value: satisfactionCount, suffix: '%', label: 'Client satisfaction' },
            ].map(({ value, suffix, label }) => (
              <div key={label} className="hp-stat-block">
                <div className="hp-stat-value">{statsInView ? value : 0}{suffix}</div>
                <div className="hp-stat-label">{label}</div>
              </div>
            ))}
          </div>

          {/* ── WHY SOLVENUT ── */}
          <section className="hp-section" id="why-solvenut">
            <div className="hp-section-head">
              <div className="hp-kicker">Why Solvenut</div>
              <h2 className="hp-section-title">Not just advice — a structured decision system</h2>
              <p className="hp-section-sub">Every feature is built to take you from fuzzy uncertainty to confident execution.</p>
            </div>

            <div className="hp-why-grid">
              {[
                { icon: '🔬', title: 'Expert-first matching', body: 'Every expert is manually vetted for domain depth and ability to guide real decisions — not just teach theory.', accent: '#22d3ee' },
                { icon: '🧭', title: 'Structured decision process', body: 'From problem framing to final action plan, every session follows a proven format that produces output, not just insight.', accent: '#34d399' },
                { icon: '🔒', title: 'Private by design', body: 'Your sessions, goals, and decisions live in dedicated private spaces. Nothing is public or shared without your explicit consent.', accent: '#fbbf24' },
                { icon: '📋', title: 'Actionable output', body: "You don't leave with motivation — you leave with a document: options ranked, trade-offs mapped, next steps prioritized.", accent: '#a78bfa' },
                { icon: '🔄', title: 'Continuity & follow-through', body: 'Continue with the same expert across sessions. Track milestones, revisit plans, and adjust as your situation evolves.', accent: '#fb7185' },
                { icon: '⏱️', title: 'Flexible expert marketplace', body: 'Experienced professionals can share knowledge around their real schedules, giving you more choice and a practical alternative to traditional consulting costs.', accent: '#38bdf8' },
              ].map(({ icon, title, body, accent }) => (
                <article key={title} className="hp-why-card" style={{ '--card-accent': accent }}>
                  <div className="hp-why-icon">{icon}</div>
                  <h3 className="hp-why-title">{title}</h3>
                  <p className="hp-why-body">{body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ── SOLUTIONS ── */}
          <section className="hp-section" id="solutions">
            <div className="hp-section-head">
              <div className="hp-kicker">Solutions</div>
              <h2 className="hp-section-title">Decisions we're built for</h2>
              <p className="hp-section-sub">Solvenut specialises in moments that matter — where the stakes are real and generic advice falls short.</p>
            </div>

            <div className="hp-solutions-grid">
              {[
                {
                  emoji: '💼', title: 'Career & job moves',
                  body: 'Should you stay or switch? Accept the offer or negotiate? Take the promotion or protect your time? Get structured clarity.',
                  bullets: ['Stay vs. switch analysis', 'Offer negotiation framing', 'Role growth roadmapping', 'Compensation trade-off mapping'],
                  accent: '#22d3ee',
                },
                {
                  emoji: '💰', title: 'Money & financial direction',
                  body: 'Navigate investment decisions, income planning, and spending priorities without getting lost in generic financial content.',
                  bullets: ['Investment decision frameworks', 'Income diversification plans', 'Risk-based scenario mapping', 'Priority allocation guidance'],
                  accent: '#34d399',
                },
                {
                  emoji: '🚀', title: 'Business & side ventures',
                  body: "What to launch, pause, or scale? Validate your idea against real criteria and sequence your execution with expert guidance.",
                  bullets: ['Idea viability assessment', 'Execution sequencing', 'Growth milestone planning', 'Pivot vs. persist decisions'],
                  accent: '#fbbf24',
                },
                {
                  emoji: '🏔️', title: 'Leadership & personal growth',
                  body: 'Step into leadership with confidence. Make decisions about team dynamics, communication style, and long-term personal direction.',
                  bullets: ['Leadership style clarity', 'Team decision frameworks', 'Conflict resolution strategy', 'Long-term growth planning'],
                  accent: '#a78bfa',
                },
              ].map(({ emoji, title, body, bullets, accent }) => (
                <article key={title} className="hp-solution-card" style={{ '--sol-accent': accent }}>
                  <div className="hp-sol-emoji">{emoji}</div>
                  <h3 className="hp-sol-title">{title}</h3>
                  <p className="hp-sol-body">{body}</p>
                  <ul className="hp-sol-list">
                    {bullets.map(b => <li key={b}>{b}</li>)}
                  </ul>
                  <div className="hp-sol-footer">
                    <button className="hp-sol-cta" onClick={() => go('/experts')}>Find an expert →</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ── PROCESS ── */}
          <section className="hp-section" id="process">
            <div className="hp-section-head">
              <div className="hp-kicker">Process</div>
              <h2 className="hp-section-title">From confused to confident in 3 steps</h2>
              <p className="hp-section-sub">A repeatable process designed for real-world decisions, not motivational workshops.</p>
            </div>

            <div className="hp-process-track">
              {[
                {
                  step: '01', title: 'Frame your decision',
                  body: 'Describe the decision you\'re facing, your constraints, timeline, and what success looks like. This framing session alone creates instant clarity.',
                  details: ['What you want vs. what you fear', 'Decision deadline & urgency', 'Resources & constraints', 'Success criteria'],
                  icon: '🎯', color: '#22d3ee',
                },
                {
                  step: '02', title: 'Work with your expert',
                  body: 'Get matched with a domain expert who has lived through similar decisions. They challenge your assumptions and map your real options with you.',
                  details: ['Domain-matched pairing', 'Assumption challenging', 'Option mapping & ranking', 'Trade-off deep-dive'],
                  icon: '🤝', color: '#34d399',
                },
                {
                  step: '03', title: 'Execute with your plan',
                  body: "You leave with a written action plan: options ranked, next steps sequenced, milestones set. Not inspiration — implementation.",
                  details: ['Written action roadmap', 'Prioritized first 30 days', 'Measurable checkpoints', 'Follow-up session option'],
                  icon: '🚀', color: '#fbbf24',
                },
              ].map(({ step, title, body, details, icon, color }) => (
                <div key={step} className="hp-step" style={{ '--step-color': color }}>
                  <div className="hp-step-number">{step}</div>
                  <div className="hp-step-connector" aria-hidden />
                  <div className="hp-step-content">
                    <div className="hp-step-icon">{icon}</div>
                    <h3 className="hp-step-title">{title}</h3>
                    <p className="hp-step-body">{body}</p>
                    <ul className="hp-step-details">
                      {details.map(d => <li key={d}>{d}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── EXPERTS SHOWCASE ── */}
          <section className="hp-section">
            <div className="hp-section-head">
              <div className="hp-kicker">Expert network</div>
              <h2 className="hp-section-title">Meet some of our verified experts</h2>
              <p className="hp-section-sub">Every expert is manually reviewed for domain depth, communication quality, and decision-guidance ability.</p>
            </div>

            <div className="hp-experts-grid">
              {expertsShowcase.map(({ name, domain, exp, sessions, tag, color, initial }) => (
                <article key={name} className="hp-expert-card" style={{ '--exp-color': color }}>
                  <div className="hp-expert-avatar" style={{ background: color }}>{initial}</div>
                  <div className="hp-expert-tag">{tag}</div>
                  <h3 className="hp-expert-name">{name}</h3>
                  <div className="hp-expert-domain">{domain}</div>
                  <div className="hp-expert-stats">
                    <span><strong>{exp}</strong> experience</span>
                    <span><strong>{sessions}+</strong> sessions</span>
                  </div>
                  <div className="hp-expert-stars">{'★★★★★'}</div>
                </article>
              ))}
            </div>

            <div className="hp-experts-cta">
              <button className="hp-btn hp-btn-outline" onClick={() => go('/experts')}>
                View all experts
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </section>

          {/* ── TESTIMONIALS ── */}
          <section className="hp-section hp-testimonials-section">
            <div className="hp-section-head">
              <div className="hp-kicker">Client stories</div>
              <h2 className="hp-section-title">What clients say after their sessions</h2>
            </div>

            <div className="hp-testimonials-grid">
              {TESTIMONIALS.map((t, i) => (
                <article key={t.name}
                  className={`hp-testimonial ${i === activeTestimonial ? 'hp-testimonial--active' : ''}`}
                  onClick={() => setActiveTestimonial(i)}>
                  <div className="hp-testimonial-stars">★★★★★</div>
                  <p className="hp-testimonial-quote">"{t.quote}"</p>
                  <div className="hp-testimonial-author">
                    <div className="hp-testimonial-avatar" style={{ background: t.color }}>{t.avatar}</div>
                    <div>
                      <div className="hp-testimonial-name">{t.name}</div>
                      <div className="hp-testimonial-role">{t.role}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hp-testimonial-dots">
              {TESTIMONIALS.map((_, i) => (
                <button key={i} className={`hp-dot ${i === activeTestimonial ? 'hp-dot--active' : ''}`}
                  onClick={() => setActiveTestimonial(i)} aria-label={`Testimonial ${i + 1}`} />
              ))}
            </div>
          </section>

          {/* ── FOR CLIENTS / EXPERTS ── */}
          <section className="hp-section hp-paths-section">
            <div className="hp-section-head">
              <div className="hp-kicker">Choose your path</div>
              <h2 className="hp-section-title">Built for both sides of every decision</h2>
            </div>
            <div className="hp-paths-grid">
              <article className="hp-path-card hp-path-client">
                <div className="hp-path-emoji">👤</div>
                <h3>For decision-makers</h3>
                <p>Get expert guidance on your most important professional and life decisions. Walk away with clarity, not just conversation.</p>
                <ul>
                  <li>Match with vetted domain experts</li>
                  <li>Structured sessions with actionable output</li>
                  <li>Private decision workspace</li>
                  <li>Follow-up and milestone tracking</li>
                </ul>
                <button className="hp-btn hp-btn-primary"
                  onClick={() => isLoggedIn ? go(dashboardPath) : go('/signup-client')}>
                  {isLoggedIn ? 'Client dashboard' : 'Start as client'}
                </button>
              </article>
              <article className="hp-path-card hp-path-expert">
                <div className="hp-path-emoji">🏅</div>
                <h3>For domain experts</h3>
                <p>Work with serious, vetted clients who come prepared. Build your reputation, run high-value sessions, and grow your impact.</p>
                <ul>
                  <li>Pre-qualified, serious clients only</li>
                  <li>Structured session format</li>
                  <li>Build your expert profile & reputation</li>
                  <li>Flexible scheduling & pricing</li>
                </ul>
                <button className="hp-btn hp-btn-outline"
                  onClick={() => isLoggedIn ? go('/expert-dashboard') : go('/signup-expert')}>
                  {isLoggedIn ? 'Expert dashboard' : 'Join as expert'}
                </button>
              </article>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section className="hp-section" id="faq">
            <div className="hp-section-head">
              <div className="hp-kicker">FAQ</div>
              <h2 className="hp-section-title">Questions before you get started</h2>
            </div>
            <div className="hp-faq-grid">
              {[
                { q: 'How do I know which expert to choose?', a: 'Browse profiles by domain, years of experience, and session count. Each expert page includes their decision methodology and areas of focus. We also offer a matching suggestion if you\'re unsure.' },
                { q: 'How long is a typical session?', a: 'Most sessions are 45–60 minutes. That\'s enough time to frame your decision, explore options, and build a concrete action plan. Complex decisions may benefit from a follow-up.' },
                { q: 'Can I continue with the same expert?', a: 'Yes — and most clients do. Continuity means your expert knows your context, priorities, and past decisions, which makes each subsequent session much more efficient.' },
                { q: 'Is Solvenut only for career decisions?', a: 'No. The platform covers career, financial, business, and personal growth decisions. Anything where structured thinking and expert input would improve your outcome.' },
                { q: 'What makes this different from a normal coach?', a: 'Coaches often focus on mindset and motivation. Solvenut experts focus on decision quality — mapping options, analysing trade-offs, and producing written action plans. The output is a document, not a feeling.' },
                { q: 'How are experts vetted?', a: 'Every expert goes through a manual review: domain assessment, communication quality check, and a structured onboarding session. Only approved experts appear on the platform.' },
              ].map(({ q, a }) => (
                <details key={q} className="hp-faq-item">
                  <summary className="hp-faq-q">{q}</summary>
                  <p className="hp-faq-a">{a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* ── CTA BANNER ── */}
          <section className="hp-cta-banner">
            <div className="hp-cta-glow" aria-hidden />
            <div className="hp-cta-content">
              <div className="hp-kicker" style={{ color: 'rgba(34,211,238,0.8)' }}>Ready when you are</div>
              <h2 className="hp-cta-title">Stop overthinking. Start deciding.</h2>
              <p className="hp-cta-sub">Join 2,400+ professionals who made their most important decisions with Solvenut.</p>
              <div className="hp-cta-actions">
                <button className="hp-btn hp-btn-primary hp-btn-lg"
                  onClick={() => isLoggedIn ? go(dashboardPath) : go('/signup-client')}>
                  {isLoggedIn ? 'Go to dashboard' : 'Start now — it\'s free'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
                <button className="hp-btn hp-btn-outline hp-btn-lg" onClick={() => go('/experts')}>
                  See expert network
                </button>
              </div>
              <div className="hp-cta-trust">
                <span>✓ No credit card required</span>
                <span>✓ Vetted experts only</span>
                <span>✓ First session guarantee</span>
              </div>
            </div>
          </section>

        </div>{/* /shell */}
      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="hp-footer" aria-label="Site footer">
        <div className="hp-shell">
          <div className="hp-footer-main">
            <div className="hp-footer-brand-col">
              <div className="hp-footer-brand">
                <span className="hp-footer-brand-name">Solve<span>nut</span></span>
              </div>
              <p className="hp-footer-desc">
                A professional platform for making high-stakes decisions with expert guidance, structured thinking, and actionable plans.
              </p>
              <div className="hp-footer-badges">
                {['Outcome-focused', 'Vetted experts', 'Private & secure'].map(b => (
                  <span key={b} className="hp-footer-badge">{b}</span>
                ))}
              </div>
              <div className="hp-footer-contact">
                <div className="hp-footer-contact-card">
                  <span className="hp-footer-contact-label">Support</span>
                  <a href="mailto:hello@solvenut.com">hello@solvenut.com</a>
                </div>
                <div className="hp-footer-contact-card">
                  <span className="hp-footer-contact-label">Response</span>
                  <span>Within 24 hours</span>
                </div>
              </div>
            </div>

            <div className="hp-footer-links-grid">
              {[
                { heading: 'Platform', links: [{ label: 'Browse experts', path: '/experts' }, { label: 'For clients', path: '/signup-client' }, { label: 'For experts', path: '/signup-expert' }] },
                { heading: 'Product', scrollLinks: [{ label: 'Why Solvenut', id: 'why-solvenut' }, { label: 'Solutions', id: 'solutions' }, { label: 'Process', id: 'process' }, { label: 'FAQ', id: 'faq' }] },
                { heading: 'Dashboards', links: [{ label: 'Client dashboard', path: '/client-dashboard' }, { label: 'Expert dashboard', path: '/expert-dashboard' }, { label: 'Admin panel', path: '/admin-login' }] },
              ].map(({ heading, links, scrollLinks }) => (
                <div key={heading} className="hp-footer-col">
                  <h4>{heading}</h4>
                  {(links || []).map(({ label, path }) => (
                    <button key={label} onClick={() => go(path)}>{label}</button>
                  ))}
                  {(scrollLinks || []).map(({ label, id }) => (
                    <button key={label} onClick={() => scrollTo(id)}>{label}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="hp-footer-bottom">
            <span className="hp-footer-copy">© {currentYear} Solvenut. All rights reserved.</span>
            <div className="hp-footer-social">
              {[{ label: 'X', href: 'https://x.com' }, { label: 'LinkedIn', href: 'https://linkedin.com' }, { label: 'Email', href: 'mailto:hello@solvenut.com' }].map(({ label, href }) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{label}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Help Button */}
      <button
        className="hp-floating-help-btn"
        onClick={() => setHelpbotOpen(true)}
        title="Get help with Solvenut"
        aria-label="Open help chat"
      >
        <HelpCircle size={24} />
      </button>

      {/* Help Bot */}
      <HelpBot open={helpbotOpen} onClose={() => setHelpbotOpen(false)} />
    </div>
  );
};

export default Home;
