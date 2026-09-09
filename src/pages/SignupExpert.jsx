import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, Check, FileText,
  Menu, ShieldCheck, Sparkles, Upload, UserRound, X,
} from 'lucide-react';
import '../styles/SignupExpert.css';

import { API } from '../utils/api';

const applicationSteps = [
  { icon: UserRound, label: 'About you', text: 'Identity and account details' },
  { icon: BriefcaseBusiness, label: 'Your expertise', text: 'Experience, focus and pricing' },
  { icon: ShieldCheck, label: 'Verification', text: 'Photo and professional resume' },
];

const SignupExpert = () => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [photoName, setPhotoName] = useState('');
  const [resumeName, setResumeName] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const dashUrl = normalizedRole === 'expert' ? '/expert-dashboard' : '/client-dashboard';

  useEffect(() => {
    if (token && role) navigate(dashUrl, { replace: true });
  }, [token, role, dashUrl, navigate]);

  const handleLogout = () => {
    if (!hasWindow) return;
    if (window.confirm('Logout from this device?')) {
      localStorage.clear();
      navigate('/login', { replace: true });
    }
  };

  const handleFileChange = (event, type) => {
    const name = event.target.files?.[0]?.name || '';
    if (type === 'photo') setPhotoName(name);
    if (type === 'resume') setResumeName(name);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setMessage({ text: '', type: '' });

    const formEl = event.currentTarget;
    const formData = new FormData(formEl);
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
      setMessage({ text: passwordError, type: 'error' });
      return;
    }

    const photo = formEl.photo.files[0];
    const resume = formEl.resume.files[0];
    const maxSize = 5 * 1024 * 1024;
    if (photo && photo.size > maxSize) {
      setMessage({ text: 'Photo size must be less than 5MB.', type: 'error' });
      return;
    }
    if (resume && resume.size > maxSize) {
      setMessage({ text: 'Resume size must be less than 5MB.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API}/api/pro-signup`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!data.success) {
        setMessage({ text: data.error || 'Signup failed. Please try again.', type: 'error' });
        setIsSubmitting(false);
        return;
      }

      const expert = data.expert || {};
      localStorage.setItem('name', expert.name || String(formData.get('name') || ''));
      localStorage.setItem('email', expert.email || String(formData.get('email') || '').toLowerCase());
      localStorage.setItem('role', expert.role || 'expert');
      localStorage.setItem('field', expert.field || '');
      localStorage.setItem('headline', expert.headline || '');
      localStorage.setItem('price', String(expert.price || 0));
      localStorage.setItem('experience', String(expert.experience || 0));
      setMessage({ text: 'Application submitted. Redirecting you to login…', type: 'success' });
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      setMessage({ text: 'Server error. Please try again later.', type: 'error' });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="signup-expert-page">
      <header className="se-header">
        <div className="se-shell se-header-inner">
          <button className="se-brand" onClick={() => navigate('/')} aria-label="Solvenut home">
            <span className="se-brand-mark">S</span>
            <span>solve<span>nut</span></span>
          </button>
          <nav className="se-desktop-nav" aria-label="Main navigation">
            <a href="/#how">How it works</a>
            <a href="/#features">Why Solvenut</a>
            <Link to="/experts">Browse experts</Link>
          </nav>
          <div className="se-header-actions">
            {token && role ? (
              <>
                <span className="se-user-pill"><UserRound size={15} />{storedName || 'User'}</span>
                <Link className="se-nav-button" to={dashUrl}>Dashboard</Link>
                <button className="se-text-button" onClick={handleLogout}>Log out</button>
              </>
            ) : <Link className="se-nav-button" to="/login">Log in</Link>}
            <button className="se-menu-button" aria-expanded={isMenuOpen} aria-controls="expertMobileMenu" onClick={() => setIsMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div id="expertMobileMenu" className="se-mobile-menu" role="dialog" aria-modal="true">
          <button className="se-mobile-close" onClick={() => setIsMenuOpen(false)} aria-label="Close menu"><X size={21} /></button>
          <a href="/#how" onClick={() => setIsMenuOpen(false)}>How it works</a>
          <a href="/#features" onClick={() => setIsMenuOpen(false)}>Why Solvenut</a>
          <Link to="/experts" onClick={() => setIsMenuOpen(false)}>Browse experts</Link>
          <Link to="/login" onClick={() => setIsMenuOpen(false)}>Log in</Link>
        </div>
      )}

      <main className="se-main">
        <div className="se-shell se-layout">
          <aside className="se-intro">
            <div className="se-eyebrow"><Sparkles size={14} /> Join the expert network</div>
            <h1>Turn your experience into <span>meaningful guidance.</span></h1>
            <p className="se-intro-copy">Build a trusted expert profile, meet clients who value your knowledge, and earn on your schedule.</p>
            <div className="se-proof-row">
              <div><strong>3 steps</strong><span>Simple application</span></div>
              <div><strong>24–48h</strong><span>Typical review</span></div>
              <div><strong>100%</strong><span>You set your fee</span></div>
            </div>
            <div className="se-steps" aria-label="Application steps">
              {applicationSteps.map(({ icon, label, text }, index) => (
                <div className="se-step" key={label}>
                  <div className="se-step-icon">{React.createElement(icon, { size: 18 })}</div>
                  <div><strong>{index + 1}. {label}</strong><span>{text}</span></div>
                </div>
              ))}
            </div>
            <div className="se-trust-note">
              <BadgeCheck size={19} />
              <div><strong>Human-reviewed profiles</strong><span>Every expert is checked before appearing publicly.</span></div>
            </div>
          </aside>

          <section className="se-form-card">
            <div className="se-form-header">
              <div className="se-form-kicker">Expert application</div>
              <h2>Create your professional profile</h2>
              <p>Complete the details below. You can update your profile and fee after approval.</p>
            </div>

            <form id="proSignupForm" className="se-form" onSubmit={handleSubmit} encType="multipart/form-data">
              <section className="se-form-section">
                <div className="se-section-heading"><span>01</span><div><h3>Personal details</h3><p>How we identify and contact you</p></div></div>
                <div className="se-form-grid">
                  <div className="se-field"><label htmlFor="name" className="required">Full name</label><input id="name" type="text" name="name" placeholder="Your full name" autoComplete="name" required /></div>
                  <div className="se-field"><label htmlFor="email" className="required">Email address</label><input id="email" type="email" name="email" placeholder="you@example.com" autoComplete="email" required /></div>
                  <div className="se-field se-field-wide"><label htmlFor="password" className="required">Create password</label><input id="password" type="password" name="password" placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required /><small>Use uppercase, lowercase, a number, and a special character.</small></div>
                </div>
              </section>

              <section className="se-form-section">
                <div className="se-section-heading"><span>02</span><div><h3>Professional profile</h3><p>Help clients understand your value</p></div></div>
                <div className="se-form-grid">
                  <div className="se-field">
                    <label htmlFor="field" className="required">Domain / field</label>
                    <select id="field" name="field" required defaultValue="">
                      <option value="" disabled>Select your domain</option>
                      <option value="Programming">Programming</option><option value="DevOps">DevOps & Cloud</option>
                      <option value="Academics">Academics & Teaching</option><option value="Medical">Medical & Healthcare</option>
                      <option value="Engineering">Engineering</option><option value="Business">Business & Management</option>
                      <option value="Career">Career Counseling</option><option value="Legal">Legal & Law</option>
                      <option value="Finance">Finance & Accounting</option><option value="Design">Design & Creative</option>
                      <option value="Marketing">Marketing & Sales</option>
                    </select>
                  </div>
                  <div className="se-field"><label htmlFor="experience" className="required">Years of experience</label><input id="experience" type="number" name="experience" min="0" max="50" placeholder="5" required /></div>
                  <div className="se-field se-field-wide"><label htmlFor="headline" className="required">Professional headline</label><input id="headline" type="text" name="headline" placeholder="Senior Full-Stack Developer · React & Node.js" maxLength={100} required /><small>Keep it specific and client-focused (maximum 100 characters).</small></div>
                  <div className="se-field se-field-wide"><label htmlFor="summary" className="required">Professional summary</label><textarea id="summary" name="summary" placeholder="Describe your experience, strengths, and the problems you can help clients solve…" maxLength={500} required /><small>Use 3–5 concise sentences (maximum 500 characters).</small></div>
                  <div className="se-field se-field-wide"><label htmlFor="linkedin">LinkedIn profile <span className="se-optional">Optional</span></label><input id="linkedin" type="url" name="linkedin" placeholder="https://linkedin.com/in/yourprofile" /></div>
                </div>
              </section>

              <section className="se-form-section">
                <div className="se-section-heading"><span>03</span><div><h3>Pricing & verification</h3><p>Set your rate and provide proof</p></div></div>
                <div className="se-form-grid">
                  <div className="se-field se-field-wide"><label htmlFor="price" className="required">Consultation fee per session</label><div className="se-price-input"><span>₹</span><input id="price" type="number" name="price" min="100" max="10000" placeholder="500" required /></div><small>Choose between ₹100 and ₹10,000. You can change this later.</small></div>
                  <div className="se-field"><label htmlFor="photo" className="required">Professional photo</label><div className="se-upload"><input id="photo" type="file" name="photo" accept="image/jpeg,image/png,image/jpg" required onChange={event => handleFileChange(event, 'photo')} /><label htmlFor="photo"><Upload size={19} /><strong>{photoName || 'Upload photo'}</strong><span>JPG or PNG · Max 5MB</span></label></div></div>
                  <div className="se-field"><label htmlFor="resume" className="required">Resume / CV</label><div className="se-upload"><input id="resume" type="file" name="resume" accept=".pdf" required onChange={event => handleFileChange(event, 'resume')} /><label htmlFor="resume"><FileText size={19} /><strong>{resumeName || 'Upload resume'}</strong><span>PDF · Max 5MB</span></label></div></div>
                </div>
              </section>

              <div className="se-consent"><Check size={15} />Your information is used only for profile verification and client trust.</div>
              <button className="se-submit" type="submit" id="submitBtn" disabled={isSubmitting}><span>{isSubmitting ? 'Submitting application…' : 'Submit expert application'}</span>{!isSubmitting && <ArrowRight size={18} />}</button>
            </form>

            {message.text && <div id="message" className={`se-message ${message.type}`}>{message.text}</div>}
            <div className="se-card-footer">Already registered? <Link to="/login">Log in to your account</Link></div>
          </section>
        </div>
      </main>

      <footer className="se-footer"><div className="se-shell"><span>© 2026 Solvenut</span><span>Experts are manually reviewed before going live.</span></div></footer>
    </div>
  );
};

export default SignupExpert;
