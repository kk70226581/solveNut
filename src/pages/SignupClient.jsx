// src/pages/SignupClient.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/SignupClient.css';
import {
  getGoogleClientId,
  loadGoogleIdentityScript,
  saveAuthSession,
} from '../utils/googleAuth';

// ✅ Base API root from Vite env (e.g. VITE_API_BASE=https://solutionhub66.onrender.com)
import { API } from '../utils/api';

const SignupClient = () => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState('');

  const hasWindow = typeof window !== 'undefined';

  const token = hasWindow ? localStorage.getItem('token') : null;
  const role = hasWindow ? localStorage.getItem('role') : null;
  const normalizedRole = (role || '').toLowerCase();
  const storedName =
    (hasWindow && localStorage.getItem('name')) ||
    (hasWindow && localStorage.getItem('username')) ||
    (hasWindow && localStorage.getItem('email')
      ? localStorage.getItem('email').split('@')[0]
      : null);

  const dashUrl =
    normalizedRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';

  // Redirect if already logged in
  useEffect(() => {
    if (token && role) {
      navigate(dashUrl, { replace: true });
    }
  }, [token, role, dashUrl, navigate]);

  const handleLogout = () => {
    if (!hasWindow) return;
    if (window.confirm('Logout from this device?')) {
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    const passwordError = (() => {
      if (password.length < 8) return 'Password must be at least 8 characters.';
      if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
      if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
      if (!/[0-9]/.test(password)) return 'Password must include a number.';
      if (!/[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password)) return 'Password must include a special character.';
      return '';
    })();
    if (passwordError) {
      alert(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.error || 'Signup failed. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Persist backend-confirmed identity/profile keys used across dashboards.
      const user = data.user || {};
      localStorage.setItem('name', user.name || name);
      localStorage.setItem('email', user.email || email);
      localStorage.setItem('role', user.role || 'client');
      localStorage.setItem('field', user.field || '');
      localStorage.setItem('headline', user.headline || '');
      localStorage.setItem('price', String(user.price || 0));
      localStorage.setItem('experience', String(user.experience || 0));

      const btn = document.getElementById('signupBtn');
      if (btn) {
        btn.innerHTML =
          '<i class="fa-solid fa-circle-check"></i> Account created!';
      }
      setTimeout(() => {
        navigate('/login');
      }, 1000);
    } catch {
      alert('Connection error. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (response) => {
    const idToken = response?.credential;
    if (!idToken) {
      setGoogleError('Google did not return a sign-up token.');
      return;
    }

    setIsSubmitting(true);
    setGoogleError('');

    try {
      const res = await fetch(`${API}/api/google-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, role: 'client' }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setGoogleError(data.error || 'Google sign-up failed.');
        setIsSubmitting(false);
        return;
      }

      saveAuthSession(data);
      const incomingRole = String(data.role || 'client').toLowerCase();
      navigate(incomingRole === 'expert' ? '/expert-dashboard' : '/client-dashboard');
    } catch {
      setGoogleError('Connection error. Please try again later.');
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (isSubmitting) return;
    setGoogleError('');

    try {
      const [google, googleClientId] = await Promise.all([
        loadGoogleIdentityScript(),
        getGoogleClientId(API),
      ]);
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
        ux_mode: 'popup',
      });
      google.accounts.id.prompt((notification) => {
        if (
          notification.isNotDisplayed?.() ||
          notification.isSkippedMoment?.()
        ) {
          setGoogleError('Google account chooser was closed or blocked.');
        }
      });
    } catch (err) {
      setGoogleError(err.message || 'Google sign-up is not available right now.');
    }
  };

  return (
    <div className="signup-page">
      <div className="ambient-glow" aria-hidden="true"></div>

      {/* HEADER */}
      <header>
        <div className="container header-inner">
          <div className="logo" onClick={() => navigate('/')}>
            <div className="txt">
              Solve<span className="nut">nut</span>
            </div>
          </div>

          <nav className="desktop">
            <a href="/#categories">Categories</a>
            <a href="/#how">How It Works</a>
            <a href="/#features">Features</a>
            <Link to="/experts">Find Experts</Link>
          </nav>

          <div className="actions">
            {token && role ? (
              <>
                <div className="nav-user-pill">
                  <i className="fa-regular fa-circle-user"></i>
                  <span>{storedName || 'User'}</span>
                </div>
                <Link
                  className="btn btn-ghost"
                  to={dashUrl}
                  style={{ fontSize: '13px', padding: '6px 12px' }}
                >
                  Dashboard
                </Link>
                <button className="nav-logout" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <Link className="btn btn-ghost" to="/login">
                Log in
              </Link>
            )}
          </div>

          <button
            className="mobile-toggle"
            aria-expanded={isMenuOpen}
            aria-controls="mobileDrawer"
            onClick={() => setIsMenuOpen(true)}
          >
            <i className="fa-solid fa-bars"></i>
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      <div
        id="mobileDrawer"
        className={`mobile-drawer ${isMenuOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isMenuOpen}
        style={{ display: isMenuOpen ? 'flex' : 'none' }}
      >
        <button
          style={{
            alignSelf: 'flex-end',
            background: 'transparent',
            border: 0,
            color: 'var(--text)',
            fontSize: '24px',
            padding: '6px',
            cursor: 'pointer',
          }}
          onClick={() => setIsMenuOpen(false)}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
        <a href="/#categories" onClick={() => setIsMenuOpen(false)}>
          Categories
        </a>
        <a href="/#how" onClick={() => setIsMenuOpen(false)}>
          How It Works
        </a>
        <a href="/#features" onClick={() => setIsMenuOpen(false)}>
          Features
        </a>
        <Link to="/experts" onClick={() => setIsMenuOpen(false)}>
          Find Experts
        </Link>
      </div>

      {/* MAIN */}
      <main>
        <div className="container">
          <div className="auth-card">
            <section className="auth-info">
              <h1>
                Create your <span>client account</span>
              </h1>
              <p>
                Ask verified human experts about health, money, studies,
                relationships, and more—anytime you feel stuck.
              </p>
              <div className="info-points">
                <span>
                  <i className="fa-solid fa-circle-check"></i> One account to
                  talk to any expert on Solvenut
                </span>
                <span>
                  <i className="fa-solid fa-circle-check"></i> Pay only for the
                  minutes you actually use
                </span>
                <span>
                  <i className="fa-solid fa-circle-check"></i> Your chats and
                  call notes are securely stored
                </span>
              </div>
            </section>

            <section className="auth-form-side">
              <div className="form-header">
                <h2>Create your client account</h2>
                <p>
                  It takes less than a minute. You can delete your account anytime.
                </p>
              </div>

              <form id="signupForm" autoComplete="on" onSubmit={handleSubmit}>
                <div className="input-group">
                  <label htmlFor="name">Full name</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-user"></i>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      placeholder="Your full name"
                      required
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="email">Email address</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-envelope"></i>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-lock"></i>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      placeholder="8+ chars, Aa1!"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <small style={{ color: 'var(--muted)' }}>
                    Use 8+ characters with uppercase, lowercase, number, and special character.
                  </small>
                </div>

                <div className="input-group">
                  <label htmlFor="interest">
                    Main category you care about
                  </label>
                  <div className="input-wrapper">
                    <i className="fa-solid fa-layer-group"></i>
                    <select id="interest" name="interest" defaultValue="">
                      <option value="" disabled>
                        Select a category (optional)
                      </option>
                      <option value="health">Health & wellness</option>
                      <option value="studies">Studies & exams</option>
                      <option value="money">Money & finance</option>
                      <option value="tech">Tech & coding</option>
                      <option value="relationships">Life & relationships</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-signup"
                  id="signupBtn"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? 'Creating your account…'
                    : 'Create my Solvenut account'}
                </button>
                <div className="auth-divider"><span>or</span></div>
                <button
                  type="button"
                  className="google-auth-btn"
                  onClick={handleGoogleSignup}
                  disabled={isSubmitting}
                >
                  <div className="google-btn-content">
                    <svg className="google-icon" viewBox="0 0 24 24" width="24" height="24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>{isSubmitting ? 'Signing up…' : 'Continue with Google'}</span>
                  </div>
                </button>
                {googleError ? <div className="auth-hint auth-error">{googleError}</div> : null}
              </form>

              <div className="terms-note">
                By signing up, you agree to Solvenut’s <a href="#">Terms</a>{' '}
                and <a href="#">Privacy Policy</a>.
              </div>
              <div className="have-account">
                Already have an account? <Link to="/login">Log in</Link>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="container footer-row">
          <div>
            © 2026 Solvenut. Making expert knowledge accessible and affordable.
          </div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Privacy
            </a>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Terms
            </a>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SignupClient;
