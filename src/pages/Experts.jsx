import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, createSearchParams, useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/Experts.css';

import { API } from '../utils/api';

const FILTERS = [
  { id: 'all',         label: 'All experts',  icon: '✦' },
  { id: 'programming', label: 'Programming',  icon: '💻' },
  { id: 'devops',      label: 'DevOps',       icon: '⚙️' },
  { id: 'academics',   label: 'Academics',    icon: '📚' },
  { id: 'career',      label: 'Career',       icon: '🚀' },
  { id: 'business',    label: 'Business',     icon: '💼' },
  { id: 'medical',     label: 'Medical',      icon: '⚕️' },
];

const DOMAIN_COLORS = {
  programming: '#22d3ee',
  devops:      '#34d399',
  academics:   '#a78bfa',
  career:      '#fbbf24',
  business:    '#fb7185',
  medical:     '#38bdf8',
  default:     '#22d3ee',
};

function normalizeInitialFilter(value = '') {
  const domain = String(value).toLowerCase();
  if (domain.includes('medical')) return 'medical';
  if (domain.includes('personal')) return 'career';
  return FILTERS.some((filter) => filter.id === domain) ? domain : 'all';
}

function getDomainColor(field = '') {
  const f = field.toLowerCase();
  for (const [key, val] of Object.entries(DOMAIN_COLORS)) {
    if (f.includes(key)) return val;
  }
  return DOMAIN_COLORS.default;
}

/* ── Skeleton card ── */
function SkeletonCard() {
  return (
    <div className="ex-skeleton">
      <div className="ex-skel-top">
        <div className="ex-skel-avatar" />
        <div className="ex-skel-lines">
          <div className="ex-skel-line ex-skel-line--lg" />
          <div className="ex-skel-line ex-skel-line--sm" />
          <div className="ex-skel-line ex-skel-line--md" />
        </div>
      </div>
      <div className="ex-skel-line ex-skel-line--full" />
      <div className="ex-skel-line ex-skel-line--full" />
      <div className="ex-skel-tags">
        <div className="ex-skel-tag" />
        <div className="ex-skel-tag" />
      </div>
      <div className="ex-skel-bottom">
        <div className="ex-skel-price" />
        <div className="ex-skel-btns">
          <div className="ex-skel-btn" />
          <div className="ex-skel-btn" />
        </div>
      </div>
    </div>
  );
}

/* ── Expert card ── */
function ExpertCard({ expert, onPay, onChat, checkingFor, processingPayment, getPhotoUrl }) {
  const [imgError, setImgError] = useState(false);
  const photoUrl = getPhotoUrl(expert);
  const color = getDomainColor(expert.field || '');
  const isChecking = checkingFor === (expert.email || '');

  return (
    <article className="ex-card" style={{ '--card-color': color }}>
      {/* Top accent bar */}
      <div className="ex-card-bar" />

      <div className="ex-card-head">
        <div className="ex-card-avatar" style={{ background: color }}>
          {photoUrl && !imgError
            ? <img src={photoUrl} alt={expert.name} onError={() => setImgError(true)} />
            : <span>{(expert.name || 'E')[0].toUpperCase()}</span>}
        </div>
        <div className="ex-card-identity">
          <div className="ex-card-domain-badge" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
            {expert.field || 'General Guidance'}
          </div>
          <h3 className="ex-card-name">{expert.name}</h3>
          <div className="ex-card-meta">
            <span className="ex-card-rating">
              <span className="ex-card-star">★</span>
              {(expert.avgRating || expert.rating) ? (expert.avgRating || expert.rating) : 'New'}
            </span>
            <span className="ex-card-sep">·</span>
            <span>{expert.experience || 1}+ yrs exp</span>
            {Number(expert.ratingsCount || 0) > 0 && (
              <>
                <span className="ex-card-sep">·</span>
                <span>{expert.ratingsCount} ratings</span>
              </>
            )}
            {expert.sessions && (
              <>
                <span className="ex-card-sep">·</span>
                <span>{expert.sessions}+ sessions</span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="ex-card-headline">
        {expert.headline || 'Practical, structured guidance tailored to your exact context and goals.'}
      </p>

      <div className="ex-card-skills">
        {Array.isArray(expert.skills) && expert.skills.length > 0
          ? expert.skills.slice(0, 3).map((s, i) => <span key={i} className="ex-skill-tag">{s}</span>)
          : <>
              <span className="ex-skill-tag">Actionable advice</span>
              <span className="ex-skill-tag">Fast response</span>
            </>
        }
      </div>

      <div className="ex-card-availability">
        <span className="ex-availability-dot" style={{ background: color }} />
        <span>{expert.availability || 'Available this week'}</span>
        {Number(expert.sessionCount || expert.sessions || 0) > 0 && (
          <span className="ex-session-count">{expert.sessionCount || expert.sessions} sessions</span>
        )}
      </div>

      <div className="ex-card-footer">
        <div className="ex-card-price">
          <span className="ex-price-amount" style={{ color }}>₹{expert.price || 500}</span>
          <span className="ex-price-unit">/ session</span>
        </div>
        <div className="ex-card-actions">
          <button
            className="ex-btn ex-btn-ghost"
            onClick={() => onChat(expert)}
            disabled={isChecking || processingPayment}
          >
            {isChecking ? (
              <><span className="ex-spinner" />Checking...</>
            ) : 'Chat now'}
          </button>
          <button
            className="ex-btn ex-btn-primary"
            onClick={() => onPay(expert)}
            disabled={processingPayment}
            style={{ '--btn-color': color }}
          >
            Pay & talk
          </button>
        </div>
      </div>
    </article>
  );
}

/* ══════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════ */
const Experts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialFilter = normalizeInitialFilter(searchParams.get('domain') || searchParams.get('field') || '');

  const [experts, setExperts] = useState([]);
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [checkingChatFor, setCheckingChatFor] = useState('');
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  const token      = localStorage.getItem('token');
  const role       = localStorage.getItem('role');
  const storedName = localStorage.getItem('name') || localStorage.getItem('username') || 'User';
  const userEmail  = localStorage.getItem('email');
  const dashUrl    = role === 'expert' ? '/expert-dashboard' : '/client-dashboard';

  /* ── Hero entrance ── */
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  /* ── Scroll header ── */
  useEffect(() => {
    const fn = () => setHeaderScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* ── Fetch experts ── */
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetch(`${API}/api/experts?status=approved`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (mounted) setExperts(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) setExperts([]); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);


  /* ── Razorpay script ── */
  useEffect(() => {
    if (document.getElementById('razorpay-checkout')) return;
    const s = document.createElement('script');
    s.id = 'razorpay-checkout';
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  /* ── Filtered list ── */
  const filteredExperts = useMemo(() => {
    let list = [...experts];
    if (activeFilter !== 'all') {
      list = list.filter(e => (e.field || '').toLowerCase().includes(activeFilter.toLowerCase()));
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.field || '').toLowerCase().includes(q) ||
        (e.headline || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'rating')      return ((b.avgRating ?? b.rating) || 0) - ((a.avgRating ?? a.rating) || 0);
      if (sortBy === 'price-low')   return (a.price || 500) - (b.price || 500);
      if (sortBy === 'price-high')  return (b.price || 500) - (a.price || 500);
      if (sortBy === 'experience')  return (b.experience || 0) - (a.experience || 0);
      return 0;
    });
    return list;
  }, [experts, activeFilter, searchTerm, sortBy]);

  const avgPrice = useMemo(() => {
    if (!experts.length) return 500;
    return Math.round(experts.reduce((acc, e) => acc + Number(e.price || 500), 0) / experts.length);
  }, [experts]);

  const seasonedCount = useMemo(() => experts.filter((expert) => Number(expert.experience || 0) >= 8).length, [experts]);
  const domainCount = useMemo(() => new Set(experts.map((expert) => expert.field).filter(Boolean)).size, [experts]);
  const availableTodayCount = useMemo(
    () => experts.filter((expert) => /today|within 2 hours/i.test(expert.availability || '')).length,
    [experts]
  );

  /* ── Utils ── */
  const getPhotoUrl = useCallback((expert) => {
    const avatar = expert?.avatar;
    if (!avatar) return null;
    if (avatar.startsWith('data:') || avatar.startsWith('blob:')) return avatar;
    if (avatar.startsWith('http')) return avatar;
    return `${API}/${avatar.replace(/^\/+/, '')}`;
  }, []);

  /* ── Payment flow ── */
  const handlePayment = async (expert) => {
    const freshToken = localStorage.getItem('token');
    if (!freshToken) { alert('Please login first.'); navigate('/login'); return; }
    try {
      setIsProcessingPayment(true);
      const orderRes = await fetch(`${API}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ expertEmail: expert.email, expertField: expert.field }),
      });
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        throw new Error(err.error || 'Order creation failed');
      }
      const orderData = await orderRes.json();
      setIsProcessingPayment(false);
      if (!window.Razorpay) { alert('Payment service loading. Please try again.'); return; }
      const rzp = new window.Razorpay({
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Solvenut',
        description: `Consultation with ${expert.name}`,
        order_id: orderData.orderId,
        prefill: { name: storedName, email: userEmail },
        handler: (response) => verifyPayment(response, expert),
      });
      rzp.open();
    } catch (e) {
      setIsProcessingPayment(false);
      alert(e.message || 'Payment failed to initialize.');
    }
  };

  const verifyPayment = async (paymentResponse, expert) => {
    try {
      setIsProcessingPayment(true);
      const freshToken = localStorage.getItem('token');
      const res = await fetch(`${API}/api/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      });
      const data = await res.json();
      setIsProcessingPayment(false);
      if (!data.success) throw new Error(data.error || 'Verification failed');
      navigate({ pathname: '/chat', search: `?${createSearchParams({ email: expert.email, paymentId: data.paymentId }).toString()}` });
    } catch {
      setIsProcessingPayment(false);
      alert('Payment verification failed.');
    }
  };

  const handleChatNow = async (expert) => {
    const freshToken = localStorage.getItem('token');
    if (!freshToken) { alert('Please login first.'); navigate('/login'); return; }
    try {
      setCheckingChatFor(expert.email || '');
      const res = await fetch(`${API}/api/check-payment?expertEmail=${encodeURIComponent(expert.email || '')}`,
        { headers: { Authorization: `Bearer ${freshToken}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.hasAccess) {
        navigate({ pathname: '/chat', search: `?${createSearchParams({ email: expert.email, paymentId: data.payment.paymentId }).toString()}` });
        return;
      }
      if (data?.reason === 'window_expired') {
        alert('Your 24-hour chat window has expired. Please pay again to continue.');
      } else {
        alert('Please complete payment first to unlock chat with this expert.');
      }
    } catch {
      alert('Unable to verify chat access. Please try again.');
    } finally {
      setCheckingChatFor('');
    }
  };

  const handleLogout = () => {
    ['token', 'email', 'name', 'username', 'role'].forEach(k => localStorage.removeItem(k));
    navigate('/login');
  };

  return (
    <div className="ex-page">
      {/* ── Canvas ── */}
      <div className="ex-canvas" aria-hidden>
        <div className="ex-orb ex-orb-1" />
        <div className="ex-orb ex-orb-2" />
        <div className="ex-orb ex-orb-3" />
        <div className="ex-grid-texture" />
      </div>

      {/* ══════ HEADER ══════ */}
      <header className={`ex-header ${headerScrolled ? 'ex-header--scrolled' : ''}`} role="banner">
        <div className="ex-shell ex-header-inner">
          <button className="ex-logo" onClick={() => navigate('/')} aria-label="Solvenut home">
            <div className="ex-logo-info">
              <span className="ex-logo-name">Solve<span className="ex-logo-accent">nut</span></span>
              <span className="ex-logo-sub">Expert marketplace</span>
            </div>
          </button>

          <nav className="ex-nav" aria-label="Primary navigation">
            <Link to="/" className="ex-nav-link">Home</Link>
            <Link to="/experts" className="ex-nav-link ex-nav-link--active">Experts</Link>
            <Link to="/client-dashboard" className="ex-nav-link">Dashboard</Link>
          </nav>

          <div className="ex-header-right">
            {token ? (
              <>
                <div className="ex-user-chip">
                  <div className="ex-user-avatar">{(storedName[0] || 'U').toUpperCase()}</div>
                  <div className="ex-user-info">
                    <span className="ex-user-name">{storedName}</span>
                    <span className="ex-user-role">{role === 'expert' ? 'Expert' : 'Client'}</span>
                  </div>
                </div>
                <Link to={dashUrl} className="ex-btn-sm ex-btn-sm--ghost">Dashboard</Link>
                <button className="ex-btn-sm ex-btn-sm--outline" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="ex-btn-sm ex-btn-sm--ghost">Log in</Link>
                <Link to="/signup-client" className="ex-btn-sm ex-btn-sm--primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ══════ MAIN ══════ */}
      <main className="ex-main">
        <div className="ex-shell">

          {/* ── HERO ── */}
          <section className={`ex-hero ${heroVisible ? 'ex-hero--visible' : ''}`}>
            <div className="ex-hero-layout">
              <div className="ex-hero-copy">
                <div className="ex-hero-badge">
                  <span className="ex-hero-badge-dot" />
                  Verified expert network
                </div>
                <h1 className="ex-hero-title">
                  Find the expert who's been
                  <span className="ex-hero-gradient"> exactly where you are</span>
                </h1>
                <p className="ex-hero-sub">
                  Browse {isLoading ? '—' : experts.length}+ vetted professionals across career, business, finance, technology, and more. Book a session and get a structured action plan — not just a conversation.
                </p>
                <div className="ex-hero-trust">
                  <div className="ex-trust-item">
                    <span className="ex-trust-icon">🛡️</span>
                    <span>Manual vetting</span>
                  </div>
                  <div className="ex-trust-item">
                    <span className="ex-trust-icon">⚡</span>
                    <span>Fast response</span>
                  </div>
                  <div className="ex-trust-item">
                    <span className="ex-trust-icon">📋</span>
                    <span>Written action plan</span>
                  </div>
                  <div className="ex-trust-item">
                    <span className="ex-trust-icon">🔒</span>
                    <span>Secure payment</span>
                  </div>
                </div>
              </div>

              <div className="ex-hero-stats-panel">
                <div className="ex-hero-stats-grid">
                  <div className="ex-hero-stat-card">
                    <div className="ex-hero-stat-icon">👥</div>
                    <div className="ex-hero-stat-value">{isLoading ? '—' : `${experts.length}+`}</div>
                    <div className="ex-hero-stat-label">Verified experts</div>
                  </div>
                  <div className="ex-hero-stat-card">
                    <div className="ex-hero-stat-icon">⭐</div>
                    <div className="ex-hero-stat-value">{isLoading ? '—' : `${seasonedCount}+`}</div>
                    <div className="ex-hero-stat-label">8+ yrs experience</div>
                  </div>
                  <div className="ex-hero-stat-card">
                    <div className="ex-hero-stat-icon">💸</div>
                    <div className="ex-hero-stat-value">{isLoading ? '—' : `₹${avgPrice}`}</div>
                    <div className="ex-hero-stat-label">Avg session fee</div>
                  </div>
                  <div className="ex-hero-stat-card">
                    <div className="ex-hero-stat-icon">💬</div>
                    <div className="ex-hero-stat-value">{isLoading ? '—' : `${availableTodayCount}+`}</div>
                    <div className="ex-hero-stat-label">Available soon</div>
                  </div>
                </div>
                <div className="ex-hero-cta-row">
                  <button className="ex-btn ex-btn-primary" onClick={() => document.getElementById('ex-listings')?.scrollIntoView({ behavior: 'smooth' })}>
                    Browse experts
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                  </button>
                  {!token && (
                    <Link to="/signup-client" className="ex-btn ex-btn-outline">Create account</Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── CONTROLS ── */}
          <div className="ex-controls-wrap" id="ex-listings">
            <div className="ex-ai-match-card">
              <div>
                <span className="ex-ai-match-eyebrow">NOT SURE WHO TO PICK?</span>
                <strong>Start with AI Expert, then hand off to the right human when you need one.</strong>
                <p>Share your situation once. Your context follows you into the expert match.</p>
              </div>
              <Link to="/ai-expert" className="ex-ai-match-link">Try AI Expert <span aria-hidden>→</span></Link>
            </div>
            <div className="ex-controls-top">
              <div className="ex-filters-group">
                <span className="ex-controls-label">Domain</span>
                <div className="ex-filters">
                  {FILTERS.map(f => (
                    <button
                      key={f.id}
                      className={`ex-filter-pill ${activeFilter === f.id ? 'ex-filter-pill--active' : ''}`}
                      onClick={() => setActiveFilter(f.id)}
                    >
                      <span className="ex-filter-icon">{f.icon}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="ex-controls-bottom">
              <div className="ex-search-wrap">
                <svg className="ex-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  className="ex-search-input"
                  placeholder="Search name, field, or skill…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button className="ex-search-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">✕</button>
                )}
              </div>

              <div className="ex-sort-wrap">
                <span className="ex-controls-label">Sort by</span>
                <div className="ex-sort-select-wrap">
                  <select className="ex-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="rating">Top rated</option>
                    <option value="price-low">Price: low → high</option>
                    <option value="price-high">Price: high → low</option>
                    <option value="experience">Most experienced</option>
                  </select>
                  <svg className="ex-sort-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>

              <div className="ex-view-toggle">
                <button
                  className={`ex-view-btn ${viewMode === 'grid' ? 'ex-view-btn--active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
                <button
                  className={`ex-view-btn ${viewMode === 'list' ? 'ex-view-btn--active' : ''}`}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="ex-results-bar">
              <span className="ex-results-count">
                Showing <strong>{filteredExperts.length}</strong> of <strong>{experts.length}</strong> experts
                {activeFilter !== 'all' && <span className="ex-results-filter"> in <em>{FILTERS.find(f => f.id === activeFilter)?.label}</em></span>}
              </span>
              {!isLoading && experts.length > 0 && <span className="ex-results-coverage">Across {domainCount} specialties</span>}
              {(activeFilter !== 'all' || searchTerm) && (
                <button type="button" className="ex-clear-btn" onClick={() => { setActiveFilter('all'); setSearchTerm(''); setSortBy('rating'); }}>
                  Clear filters ✕
                </button>
              )}
            </div>
          </div>

          {/* ── EXPERT GRID ── */}
          <section className={`ex-grid ex-grid--${viewMode}`} aria-label="Experts listing">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : filteredExperts.length === 0 ? (
              <div className="ex-empty">
                <div className="ex-empty-icon">🔍</div>
                <h3>{experts.length ? 'No experts found for that search' : 'Expert profiles are being added'}</h3>
                <p>{experts.length ? 'Try broadening your search or clearing one filter at a time to surface more matches.' : 'Start with AI Expert now and it will guide you toward the right human specialist.'}</p>
                {experts.length ? (
                  <button type="button" className="ex-btn ex-btn-outline" onClick={() => { setActiveFilter('all'); setSearchTerm(''); setSortBy('rating'); }}>
                    Clear all filters
                  </button>
                ) : <Link to="/ai-expert" className="ex-btn ex-btn-primary">Try AI Expert</Link>}
              </div>
            ) : (
              filteredExperts.map((expert, idx) => (
                <ExpertCard
                  key={`${expert.email || expert.name}-${idx}`}
                  expert={expert}
                  onPay={handlePayment}
                  onChat={handleChatNow}
                  checkingFor={checkingChatFor}
                  processingPayment={isProcessingPayment}
                  getPhotoUrl={getPhotoUrl}
                />
              ))
            )}
          </section>

          {/* ── TRUST SECTION ── */}
          {!isLoading && filteredExperts.length > 0 && (
            <section className="ex-trust-section">
              <div className="ex-trust-grid">
                {[
                  { icon: '🛡️', title: 'Manually vetted', body: 'Every expert is individually reviewed for domain expertise and communication quality before joining the platform.' },
                  { icon: '🔒', title: 'Secure payments', body: 'All transactions are processed through Razorpay with bank-grade encryption. Your payment is safe.' },
                  { icon: '📋', title: 'Actionable outcomes', body: "You don't leave with just a conversation. Every session produces a structured action plan you can implement." },
                  { icon: '🔄', title: 'Continuity option', body: 'Continue with the same expert across multiple sessions for deeper context and better follow-through.' },
                ].map(({ icon, title, body }) => (
                  <div key={title} className="ex-trust-card">
                    <span className="ex-trust-card-icon">{icon}</span>
                    <h4>{title}</h4>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>{/* /shell */}
      </main>

      {/* ══════ FOOTER ══════ */}
      <footer className="ex-footer" aria-label="Site footer">
        <div className="ex-shell ex-footer-inner">
          <div className="ex-footer-brand-col">
            <div className="ex-footer-logo">
              <span className="ex-footer-brand-name">Solve<span>nut</span></span>
            </div>
            <p className="ex-footer-desc">Connecting professionals with vetted domain experts for structured, high-quality decision guidance.</p>
          </div>
          <div className="ex-footer-nav">
            {[
              { label: 'Home', path: '/' },
              { label: 'Client dashboard', path: '/client-dashboard' },
              { label: 'Expert dashboard', path: '/expert-dashboard' },
              { label: 'Join as client', path: '/signup-client' },
              { label: 'Join as expert', path: '/signup-expert' },
            ].map(({ label, path }) => (
              <button key={label} onClick={() => navigate(path)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="ex-shell ex-footer-bottom">
          <span>© 2026 Solvenut. All rights reserved.</span>
          <div className="ex-footer-social">
            <a href="https://x.com" target="_blank" rel="noreferrer">X</a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="mailto:hello@solvenut.com">Email</a>
          </div>
        </div>
      </footer>

      {/* ── Payment overlay ── */}
      {isProcessingPayment && (
        <div className="ex-payment-overlay" role="dialog" aria-modal aria-label="Processing payment">
          <div className="ex-payment-box">
            <div className="ex-payment-spinner" />
            <span>Initializing secure payment…</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Experts;
