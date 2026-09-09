import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import '../styles/AdminLogin.css';

import { API } from '../utils/api';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const AdminLogin = () => {
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [effectiveGoogleClientId, setEffectiveGoogleClientId] = useState(GOOGLE_CLIENT_ID);

  const finishAdminLogin = useCallback((data) => {
    if (data?.adminSessionToken) {
      localStorage.setItem('adminSessionToken', data.adminSessionToken);
      navigate('/admin-dashboard');
    } else if (data?.pre2faToken) {
      alert('Admin API is still returning the old 2FA login response. Restart the backend server so the latest no-2FA route is active.');
    } else {
      alert('Login failed: No session token received');
    }
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const loadAuthConfig = async () => {
      setConfigLoading(true);
      try {
        const res = await fetch(`${API}/api/admin/auth-config`);
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && !data?.error && data?.googleClientId) {
          setEffectiveGoogleClientId(String(data.googleClientId));
        }
      } catch {
        // Keep the login surface quiet if the config probe is unavailable.
      } finally {
        if (active) setConfigLoading(false);
      }
    };
    loadAuthConfig();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!effectiveGoogleClientId) return;
    let active = true;
    const setupGoogle = () => {
      if (!active || !window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: effectiveGoogleClientId,
        callback: async (resp) => {
          if (!resp?.credential) return;
          setLoading(true);
          try {
            const res = await fetch(`${API}/api/admin/google-auth`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: resp.credential }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.error) throw new Error(data?.error || 'Google login failed');
            finishAdminLogin(data);
          } catch (err) {
            alert(err.message || 'Google login failed');
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 360,
        text: 'signin_with',
      });
    };

    if (window.google?.accounts?.id) {
      setupGoogle();
      return () => { active = false; };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = setupGoogle;
    document.body.appendChild(script);

    return () => { active = false; };
  }, [effectiveGoogleClientId, finishAdminLogin]);

  return (
    <div className="admin-login-page">
      <div className="admin-login-bg" aria-hidden />
      <div className="admin-login-card">
        <div className="admin-login-head">
          <div className="admin-login-mark">
            <ShieldCheck size={20} />
          </div>
          <div className="admin-login-badge">Admin access</div>
          <h2>Secure Admin Login</h2>
          <p>Continue with your approved Google account to open the admin dashboard.</p>
        </div>

        {!configLoading && !effectiveGoogleClientId ? (
          <div className="admin-login-error">
            Admin sign-in is not configured right now.
          </div>
        ) : null}
        {configLoading ? <div className="admin-login-loading">Preparing secure sign-in...</div> : null}
        {loading ? <div className="admin-login-loading">Opening dashboard...</div> : null}
        <div ref={googleBtnRef} className="admin-google-wrap" />

        <button
          type="button"
          onClick={() => navigate('/')}
          className="admin-login-btn ghost"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default AdminLogin;
