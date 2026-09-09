import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminDashboard.css';

import { API } from '../utils/api';

const toAssetUrl = (p) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const normalized = String(p).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '');
  return `${String(API).replace(/\/+$/, '')}/${normalized}`;
};

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [adminSessionToken, setAdminSessionToken] = useState(localStorage.getItem('adminSessionToken') || '');
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState('');
  const [tab, setTab] = useState('pending');
  const [experts, setExperts] = useState([]);
  const [toast, setToast] = useState({ text: '', type: '' });
  const [previewSrc, setPreviewSrc] = useState('');

  useEffect(() => {
    if (!adminSessionToken) navigate('/admin-login', { replace: true });
  }, [adminSessionToken, navigate]);

  const adminHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminSessionToken}`,
    'x-admin-session': adminSessionToken,
  }), [adminSessionToken]);

  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: '', type: '' }), 2800);
  }, []);

  const fetchExperts = useCallback(async () => {
    if (!adminSessionToken) return;
    setLoading(true);
    try {
      const [allRes, healthRes] = await Promise.all([
        fetch(`${API}/api/experts?status=all`, { headers: { Authorization: `Bearer ${adminSessionToken}`, 'x-admin-session': adminSessionToken } }),
        fetch(`${API}/api/health`, { headers: { Authorization: `Bearer ${adminSessionToken}`, 'x-admin-session': adminSessionToken } }),
      ]);

      if (allRes.status === 401 || healthRes.status === 401) {
        localStorage.removeItem('adminSessionToken');
        setAdminSessionToken('');
        navigate('/admin-login', { replace: true });
        return;
      }

      const allData = await allRes.json().catch(() => []);
      setExperts(Array.isArray(allData) ? allData : []);
    } catch {
      showToast('Failed to load admin data', 'error');
    } finally {
      setLoading(false);
    }
  }, [adminSessionToken, navigate, showToast]);

  useEffect(() => {
    fetchExperts();
  }, [fetchExperts]);

  const filteredExperts = useMemo(() => (
    tab === 'all' ? experts : experts.filter((e) => String(e.status || '').toLowerCase() === tab)
  ), [experts, tab]);

  const stats = useMemo(() => ({
    total: experts.length,
    pending: experts.filter((e) => String(e.status).toLowerCase() === 'pending').length,
    approved: experts.filter((e) => String(e.status).toLowerCase() === 'approved').length,
    rejected: experts.filter((e) => String(e.status).toLowerCase() === 'rejected').length,
  }), [experts]);

  const updateStatus = async (email, status) => {
    if (!email || !status) return;
    setSavingEmail(email);
    try {
      const res = await fetch(`${API}/api/admin/expert-status`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ email, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || 'Status update failed');

      setExperts((prev) => prev.map((e) => (
        String(e.email).toLowerCase() === String(email).toLowerCase() ? { ...e, status } : e
      )));
      showToast(`Expert ${status} successfully`, 'success');
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setSavingEmail('');
    }
  };

  const logoutAdmin = () => {
    localStorage.removeItem('adminSessionToken');
    setAdminSessionToken('');
    navigate('/admin-login', { replace: true });
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-shell">
        <header className="admin-header">
          <div className="admin-header-top">
            <div>
              <h1 className="admin-title"><i className="fa-solid fa-shield-halved" />Admin Dashboard</h1>
              <p className="admin-subtitle">Manage expert verification and approvals</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="admin-refresh-btn" onClick={fetchExperts} disabled={loading}>
                <i className="fa-solid fa-rotate" />{loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button className="admin-refresh-btn" onClick={logoutAdmin}>
                <i className="fa-solid fa-right-from-bracket" />Logout
              </button>
            </div>
          </div>
          {toast.text && (
            <div className={`admin-toast ${toast.type === 'error' ? 'admin-toast-error' : 'admin-toast-success'}`}>
              {toast.text}
            </div>
          )}
          <div className="admin-stats-grid">
            <div className="admin-stat-card"><div className="admin-stat-number admin-stat-total">{stats.total}</div><div className="admin-stat-label"><i className="fa-solid fa-users" />Total experts</div></div>
            <div className="admin-stat-card"><div className="admin-stat-number admin-stat-pending">{stats.pending}</div><div className="admin-stat-label"><i className="fa-solid fa-hourglass-half" />Pending</div></div>
            <div className="admin-stat-card"><div className="admin-stat-number admin-stat-approved">{stats.approved}</div><div className="admin-stat-label"><i className="fa-solid fa-circle-check" />Approved</div></div>
            <div className="admin-stat-card"><div className="admin-stat-number" style={{ color: '#fda4af' }}>{stats.rejected}</div><div className="admin-stat-label"><i className="fa-solid fa-circle-xmark" />Rejected</div></div>
          </div>
        </header>

        <div className="admin-tabs">
          {['pending', 'approved', 'rejected', 'all'].map((t) => (
            <button key={t} className={`admin-tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <section className="admin-expert-grid">
          {loading ? (
            <div className="admin-empty"><i className="fa-solid fa-spinner fa-spin" />Loading experts...</div>
          ) : filteredExperts.length === 0 ? (
            <div className="admin-empty"><i className="fa-regular fa-folder-open" />No experts in this tab</div>
          ) : filteredExperts.map((expert) => {
            const status = String(expert.status || '').toLowerCase() || 'pending';
            const cls = status === 'approved' ? 'admin-expert-approved' : status === 'rejected' ? 'admin-expert-rejected' : 'admin-expert-pending';
            const photo = toAssetUrl(expert.avatar);
            const resumeUrl = toAssetUrl(expert.resumePath);
            const initials = (expert.name?.[0] || 'E').toUpperCase();
            return (
              <article key={expert._id || expert.email} className={`admin-expert-card ${cls}`}>
                <div className="admin-expert-banner" />
                <div className="admin-avatar-container" onClick={() => photo && setPreviewSrc(photo)}>
                  {photo ? <img className="admin-avatar-img" src={photo} alt={expert.name || 'Expert'} /> : <div className="admin-avatar-fallback">{initials}</div>}
                </div>
                <div className="admin-expert-header">
                  <h3 className="admin-expert-name">{expert.name || 'Expert'}</h3>
                  <p className="admin-expert-field">{expert.field || 'General'}</p>
                  <p className="admin-expert-email">{expert.email}</p>
                </div>
                <div className="admin-expert-details">
                  <div className="admin-detail-row">
                    <span className="k">Experience</span>
                    <span className="v">{expert.experience ? `${expert.experience} years` : '—'}</span>
                  </div>
                  <div className="admin-detail-row">
                    <span className="k">Location</span>
                    <span className="v">{expert.location || '—'}</span>
                  </div>
                  <div className="admin-detail-row">
                    <span className="k">Headline</span>
                    <span className="v">{expert.headline || '—'}</span>
                  </div>
                  <div className="admin-detail-row">
                    <span className="k">Applied On</span>
                    <span className="v">{formatDate(expert.createdAt)}</span>
                  </div>
                  <div className="admin-detail-block">
                    <div className="k">Bio / Summary</div>
                    <div className="v pre">{expert.summary || '—'}</div>
                  </div>
                  <div className="admin-detail-actions">
                    <a
                      className={`admin-detail-link ${resumeUrl ? '' : 'disabled'}`}
                      href={resumeUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => { if (!resumeUrl) e.preventDefault(); }}
                    >
                      View Resume
                    </a>
                    <a
                      className={`admin-detail-link ${expert.linkedin ? '' : 'disabled'}`}
                      href={expert.linkedin || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => { if (!expert.linkedin) e.preventDefault(); }}
                    >
                      LinkedIn
                    </a>
                  </div>
                </div>
                <div className="admin-expert-actions">
                  <button
                    className="admin-action-btn admin-approve-btn"
                    disabled={savingEmail === expert.email || status === 'approved'}
                    onClick={() => updateStatus(expert.email, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    className="admin-action-btn admin-reject-btn"
                    disabled={savingEmail === expert.email || status === 'rejected'}
                    onClick={() => updateStatus(expert.email, 'rejected')}
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {previewSrc && (
        <div className="admin-modal-backdrop" onClick={() => setPreviewSrc('')}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <button className="admin-modal-close" onClick={() => setPreviewSrc('')}>x</button>
            <img className="admin-modal-image" src={previewSrc} alt="Expert avatar" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
