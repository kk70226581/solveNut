// src/pages/Login.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../styles/Login.css';
import {
  getGoogleClientId,
  loadGoogleIdentityScript,
  saveAuthSession,
} from '../utils/googleAuth';

// ✅ Base API root from Vite env (e.g. VITE_API_BASE=https://solutionhub66.onrender.com)
import { API } from '../utils/api';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [googleError, setGoogleError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(true);
  const googleButtonRef = useRef(null);

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

  // Redirect if already logged in
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = String(params.get('mode') || '').toLowerCase();
    if (mode === 'reset') return;
    if (token && role) {
      const dashUrl =
        normalizedRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';
      navigate(dashUrl, { replace: true });
    }
  }, [location.search, token, role, normalizedRole, navigate]);

  const handleLogout = () => {
    if (!hasWindow) return;
    if (window.confirm('Logout from this device?')) {
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  const dashUrl =
    normalizedRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    setIsSubmitting(true);
    const originalText = 'Sign in';

    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        const incomingRole = String(data.role || 'client').toLowerCase();
        if (hasWindow) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.name);
          localStorage.setItem('email', data.email);
          localStorage.setItem('role', incomingRole);
        }

        const target =
          incomingRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';
        navigate(target);
      } else {
        alert(data.error || 'Invalid email or password');
        setIsSubmitting(false);
        const btn = document.getElementById('loginBtn');
        if (btn) btn.innerText = originalText;
      }
    } catch {
      alert('Connection error. Please try again later.');
      setIsSubmitting(false);
      const btn = document.getElementById('loginBtn');
      if (btn) btn.innerText = originalText;
    }
  };

  const handleGoogleCredential = useCallback(async (response) => {
    const idToken = response?.credential;
    if (!idToken) {
      setGoogleError('Unable to retrieve Google credentials. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setGoogleError('');

    try {
      const res = await fetch(`${API}/api/google-auth`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ idToken, role: 'client' }),
      });
      
      const data = await res.json().catch(() => ({ 
        success: false, 
        error: 'Invalid server response. Please try again.' 
      }));

      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'Google sign-in failed. Please try again.';
        setGoogleError(errorMsg);
        setIsSubmitting(false);
        return;
      }

      // Successful authentication
      saveAuthSession(data);
      const incomingRole = String(data.role || 'client').toLowerCase();
      const targetDash = incomingRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';
      navigate(targetDash, { replace: true });
    } catch (err) {
      const errorMsg = err.message.includes('fetch') 
        ? 'Network connection failed. Please check your internet.' 
        : 'Sign-in failed. Please try again.';
      setGoogleError(errorMsg);
      setIsSubmitting(false);
    }
  }, [navigate]);

  useEffect(() => {
    let isActive = true;

    const setupGoogleButton = async () => {
      setGoogleLoading(true);
      try {
        const [google, googleClientId] = await Promise.all([
          loadGoogleIdentityScript(),
          getGoogleClientId(API),
        ]);
        if (!isActive || !googleButtonRef.current) return;

        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredential,
          ux_mode: 'popup',
          auto_select: false,
        });
        googleButtonRef.current.replaceChildren();
        google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 430,
        });
        setGoogleError('');
      } catch (err) {
        if (isActive) {
          setGoogleError(err.message || 'Google sign-in is not available right now.');
        }
      } finally {
        if (isActive) setGoogleLoading(false);
      }
    };

    setupGoogleButton();
    return () => { isActive = false; };
  }, [handleGoogleCredential]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = String(params.get('mode') || '').toLowerCase();
    const tokenFromUrl = String(params.get('token') || '');
    if (mode === 'reset') {
      setAuthMode('reset');
      if (tokenFromUrl) setResetToken(tokenFromUrl);
    }
  }, [location.search]);

  const validateStrongPassword = (pwd) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pwd)) return 'Include at least one uppercase letter.';
    if (!/[a-z]/.test(pwd)) return 'Include at least one lowercase letter.';
    if (!/[0-9]/.test(pwd)) return 'Include at least one number.';
    if (!/[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(pwd)) {
      return 'Include at least one special character.';
    }
    return '';
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setForgotMsg('');
    const email = forgotEmail.trim().toLowerCase();
    if (!email) {
      setForgotMsg('Enter your registered email.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setForgotMsg(data.error || 'Could not process forgot password.');
      } else if (data.resetLink) {
        setForgotMsg(`Reset link generated (dev mode): ${data.resetLink}`);
      } else {
        setForgotMsg(data.message || 'If this email exists, reset link has been sent.');
      }
    } catch {
      setForgotMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setResetMsg('');
    const tokenValue = resetToken.trim();
    if (!tokenValue) {
      setResetMsg('Reset token is required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetMsg('Passwords do not match.');
      return;
    }
    const pwdErr = validateStrongPassword(newPassword);
    if (pwdErr) {
      setResetMsg(pwdErr);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setResetMsg(data.error || 'Could not reset password.');
        setIsSubmitting(false);
        return;
      }
      setResetMsg('Password reset successful. You can now sign in.');
      setAuthMode('login');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setResetMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="ambient-glow" aria-hidden="true"></div>

      {/* HEADER */}
      <header>
        <div className="container header-inner">
          <div className="logo" onClick={() => navigate('/')}>
            <div className="txt">
              Solve<span className="nut">nut</span>
            </div>
          </div>

          <nav className="desktop" aria-label="Primary navigation">
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
              <Link className="btn btn-ghost" to="/signup-client">
                Sign up
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
        <div className="container auth-layout">
          <section className="auth-intro">
            <h1>
              Login to <span>Solvenut</span>
            </h1>
            <p>
              Continue your conversations, manage sessions, and track expert
              advice all from one simple dashboard.
            </p>
            <div className="auth-points">
              <span>
                <i className="fa-solid fa-circle-check"></i> One login for both
                client and expert accounts
              </span>
              <span>
                <i className="fa-solid fa-circle-check"></i> Access your saved
                chats, calls, and payment history
              </span>
              <span>
                <i className="fa-solid fa-circle-check"></i> Switch between
                devices without losing your session
              </span>
            </div>
          </section>

          <section className="login-card">
            <div className="login-badge">
              <i className="fa-solid fa-lock"></i>
              Secure login · Encrypted
            </div>
            <h2>Welcome back</h2>
            <p>
              Use your client or expert account to access your Solvenut dashboard.
            </p>

            {authMode === 'login' && (
            <form id="loginForm" autoComplete="on" onSubmit={handleSubmit}>
              <div className="input-group">
                <label htmlFor="email">Email address</label>
                <div className="input-wrapper">
                  <i className="fas fa-envelope"></i>
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
                  <i className="fas fa-lock"></i>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div className="login-meta">
                <span>Use the same account for app and web</span>
                <button
                  type="button"
                  className="login-text-link"
                  onClick={() => {
                    setAuthMode('forgot');
                    setForgotMsg('');
                    setResetMsg('');
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="btn-login"
                id="loginBtn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Signing you in…' : 'Sign in'}
              </button>
              <div className="auth-divider"><span>or continue with</span></div>
              <div className="google-auth-slot" aria-live="polite">
                {googleLoading && <div className="google-auth-loading">Preparing secure Google sign-in…</div>}
                <div ref={googleButtonRef} className="google-official-button" />
                <div className="google-btn-content">
                  <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>{isSubmitting ? 'Signing in…' : 'Continue with Google'}</span>
                </div>
              </div>
              {googleError && (
                <div className="auth-hint auth-error">
                  <span>{googleError}</span>
                  <button type="button" onClick={() => window.location.reload()}>Retry</button>
                </div>
              )}
            </form>
            )}

            {authMode === 'forgot' && (
              <form autoComplete="on" onSubmit={handleForgotPassword}>
                <div className="input-group">
                  <label htmlFor="forgotEmail">Registered email</label>
                  <div className="input-wrapper">
                    <i className="fas fa-envelope"></i>
                    <input
                      type="email"
                      id="forgotEmail"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>
                {forgotMsg ? <div className="auth-hint">{forgotMsg}</div> : null}
                <div className="login-meta">
                  <button type="button" className="login-text-link" onClick={() => setAuthMode('login')}>Back to login</button>
                </div>
                <button type="submit" className="btn-login" disabled={isSubmitting}>
                  {isSubmitting ? 'Processing…' : 'Send reset link'}
                </button>
              </form>
            )}

            {authMode === 'reset' && (
              <form autoComplete="on" onSubmit={handleResetPassword}>
                <div className="input-group">
                  <label htmlFor="resetToken">Reset token</label>
                  <div className="input-wrapper">
                    <i className="fas fa-key"></i>
                    <input
                      type="text"
                      id="resetToken"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste token from reset link"
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="newPassword">New password</label>
                  <div className="input-wrapper">
                    <i className="fas fa-lock"></i>
                    <input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New strong password"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="input-group">
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <div className="input-wrapper">
                    <i className="fas fa-lock"></i>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="auth-hint">
                  Password must be 8+ chars with uppercase, lowercase, number, and special character.
                </div>
                {resetMsg ? <div className="auth-hint">{resetMsg}</div> : null}
                <div className="login-meta">
                  <button type="button" className="login-text-link" onClick={() => setAuthMode('login')}>Back to login</button>
                </div>
                <button type="submit" className="btn-login" disabled={isSubmitting}>
                  {isSubmitting ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            )}

            {!token && (
              <div className="auth-footer-links">
                Don’t have an account yet?
                <br />
                <Link to="/signup-client">Create client account</Link>
                &nbsp;·&nbsp;
                <Link to="/signup-expert">Apply as expert</Link>
                <br />
                <Link to="/admin-login">Admin login</Link>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="container footer-row">
          <div>
            © 2026 Solvenut. Human‑first expert advice, when you need it most.
          </div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Privacy
            </a>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Terms
            </a>
            <a href="#" style={{ color: 'var(--muted)' }}>
              Refunds
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Login;
