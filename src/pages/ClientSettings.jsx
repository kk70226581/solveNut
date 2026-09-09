import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, UserRound } from 'lucide-react';

import { API } from '../utils/api';
const fields = [
  { key: 'name', label: 'Your name', max: 100, autoComplete: 'name' },
  { key: 'phone', label: 'Phone (optional)', max: 40, autoComplete: 'tel' },
  { key: 'location', label: 'Location (optional)', max: 160, autoComplete: 'address-level2' },
  { key: 'focusArea', label: 'What would you like help with? (optional)', max: 500, autoComplete: 'off' },
];

export default function ClientSettings() {
  const [profile, setProfile] = useState({ name: '', phone: '', location: '', focusArea: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const email = localStorage.getItem('email');
  const token = localStorage.getItem('token');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/api/profile?email=${encodeURIComponent(email)}`, {
      signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
    }).then(async response => {
      if (!response.ok) throw new Error('Your profile could not be loaded. Please retry.');
      const data = await response.json();
      setProfile(Object.fromEntries(fields.map(({ key }) => [key, data[key] || ''])));
      setError('');
      setLoading(false);
    }).catch(err => {
      if (err.name !== 'AbortError') { setError(err.message); setLoading(false); }
    });
    return () => controller.abort();
  }, [email, token, attempt]);

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await fetch(`${API}/api/profile`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your profile.');
      localStorage.setItem('name', data.user.name);
      localStorage.setItem('username', data.user.name);
      setSaved(true);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return <main className="cd-page settings-page">
    <div className="settings-shell">
      <Link className="settings-back" to="/client-dashboard"><ArrowLeft size={18} /> Back to dashboard</Link>
      <div className="settings-heading"><UserRound size={26} /><span>YOUR ACCOUNT</span></div>
      <h1>Make it yours.</h1>
      <p>Keep your details up to date and give your next conversation a clear starting point.</p>
      <form className="settings-card" onSubmit={save}>
        <div className="settings-email"><span>Signed in as</span><strong>{email}</strong></div>
        {error && <div role="alert" className="settings-error">{error} <button type="button" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>Reload profile</button></div>}
        {loading ? <p role="status">Loading your profile…</p> : fields.map(({ key, label, max, autoComplete }) => <label key={key} className="settings-field">
          <span>{label}</span>
          <input value={profile[key]} required={key === 'name'} maxLength={max} autoComplete={autoComplete}
            type={key === 'phone' ? 'tel' : 'text'} onChange={event => {
              setProfile(prev => ({ ...prev, [key]: event.target.value })); setSaved(false);
            }} />
        </label>)}
        <div className="settings-actions"><button className="cd-btn cd-btn-primary" disabled={loading || saving || !profile.name.trim()}><Save size={17} />{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span role="status">Profile saved</span>}</div>
      </form>
    </div>
  </main>;
}
