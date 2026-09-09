import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import VideoCall from '../components/VideoCall';
import {
  TrendingUp, Star, Clock, MessageCircle, Users, Briefcase,
  DollarSign, BarChart3, Settings, Bell, Edit3, Eye, CheckCircle,
  XCircle, Calendar, Award, ArrowRight, Zap, Mail, MapPin, ArrowUp, ArrowDown, House, Send, Paperclip, X,
  Search, ChevronLeft, Smile, Mic, MoreVertical, Image, Check, CheckCheck, Menu, ChevronDown,
  Activity, TrendingDown, Filter, RefreshCw, LogOut, Home, MessageSquare,
} from 'lucide-react';
import '../styles/ExpertDashboard.css';
import {
  clearStoredIncomingCall,
  getStoredIncomingCall,
  subscribeToIncomingCallChanges,
} from '../utils/incomingCallStorage';
import {
  CHAT_ATTACHMENT_ACCEPT,
  getChatAttachmentPayload,
  getChatAttachmentType,
  getChatMessageAttachment,
  readFileAsDataUrl,
  validateChatAttachmentFile,
} from '../utils/chatAttachments';

import { API } from '../utils/api';

const fmtInr = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
};

const fmtShortInr = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '₹0';
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
};

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const formatRelative = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateHeader = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
const toAssetUrl = (p) => {
  if (!p) return '';
  if (/^data:/i.test(p) || /^blob:/i.test(p)) return p;
  if (/^https?:\/\//i.test(p)) return p;
  const normalized = String(p).replace(/\\/g, '/').replace(/^\.?\//, '');
  return `${API}/${normalized}`;
};
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function useCounter(target, duration = 1400, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let t0 = null;
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(e * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return val;
}

const DOMAIN_COLORS = {
  programming: '#22d3ee', devops: '#34d399', academics: '#a78bfa',
  career: '#fbbf24', business: '#fb7185', medical: '#38bdf8', default: '#22d3ee',
};
function getDomainColor(field = '') {
  const f = String(field || '').toLowerCase();
  for (const [k, v] of Object.entries(DOMAIN_COLORS)) if (f.includes(k)) return v;
  return DOMAIN_COLORS.default;
}

const TIPS = [
  'Respond quickly to improve expert ranking.',
  'Keep your profile headline updated for better conversion.',
  'Clear session summaries improve repeat client rate.',
  'Use specific domain keywords in your profile field.',
  'Track pending payments weekly to avoid payout confusion.',
];

const QUICK_EMOJIS = ['👍', '❤️', '😊', '🎉', '🙏', '💯'];

function SessionRow({ session }) {
  const STATUS = {
    upcoming: { label: 'Upcoming', color: '#22d3ee', bg: 'rgba(34,211,238,.1)', border: 'rgba(34,211,238,.3)' },
    completed: { label: 'Completed', color: '#34d399', bg: 'rgba(52,211,153,.1)', border: 'rgba(52,211,153,.3)' },
    cancelled: { label: 'Cancelled', color: '#fb7185', bg: 'rgba(251,113,133,.1)', border: 'rgba(251,113,133,.3)' },
  };
  const meta = STATUS[session.status] || STATUS.upcoming;

  return (
    <div className={`ed-session-row ed-session-row--${session.status}`}>
      <div className="ed-session-client">
        <div className="ed-session-avatar">{(session.client || 'C')[0].toUpperCase()}</div>
        <div>
          <div className="ed-session-name">{session.client}</div>
          <div className="ed-session-topic">{session.topic}</div>
        </div>
      </div>
      <div className="ed-session-date">
        <Calendar size={13} />
        {session.date}
      </div>
      {session.rating ? (
        <div className="ed-session-rating">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={13} fill={i < session.rating ? '#fbbf24' : 'none'} color={i < session.rating ? '#fbbf24' : '#4b5563'} />
          ))}
        </div>
      ) : <div className="ed-session-rating-empty">—</div>}
      <div className="ed-session-amount" style={{ color: session.amount ? '#34d399' : '#4b5563' }}>
        {session.amount ? fmtInr(session.amount) : '—'}
      </div>
      <span className="ed-session-status-badge" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
        {meta.label}
      </span>
    </div>
  );
}

function EarningsChart({ data }) {
  const max = Math.max(...data.map(d => d.amount), 1);
  return (
    <div className="ed-chart">
      {data.map((d, i) => (
        <div key={`${d.month}-${i}`} className="ed-chart-col">
          <div className="ed-chart-bar-wrap">
            <div className="ed-chart-bar" style={{ height: `${(d.amount / max) * 100}%`, animationDelay: `${i * 80}ms` }}>
              <div className="ed-chart-bar-tooltip">{fmtShortInr(d.amount)}</div>
            </div>
          </div>
          <div className="ed-chart-label">{d.month}</div>
          <div className="ed-chart-val">{fmtShortInr(d.amount)}</div>
        </div>
      ))}
    </div>
  );
}

function EditProfileModal({ profile, onSave, onClose, saving }) {
  const [form, setForm] = useState({ ...profile });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar ? toAssetUrl(profile.avatar) : '');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="ed-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ed-modal">
        <div className="ed-modal-head">
          <h3>Edit Expert Profile</h3>
          <button className="ed-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ed-modal-body">
          <div className="ed-avatar-edit">
            <div className="ed-avatar-edit-preview">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Preview" />
              ) : (
                <span>{(form.name?.[0] || 'E').toUpperCase()}</span>
              )}
            </div>
            <div>
              <label className="ed-avatar-upload-btn">
                <Image size={14} /> Change Photo
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setAvatarFile(f);
                  setAvatarPreview(URL.createObjectURL(f));
                }} />
              </label>
              <p className="ed-avatar-hint">JPG or PNG, max 2MB</p>
            </div>
          </div>
          {[
            { label: 'Display name', key: 'name', placeholder: 'Your full name', icon: <Users size={13} /> },
            { label: 'Headline', key: 'headline', placeholder: 'e.g. Senior Product Manager', icon: <Award size={13} /> },
            { label: 'Field / domain', key: 'field', placeholder: 'e.g. Career, Business, Programming', icon: <Briefcase size={13} /> },
            { label: 'Location', key: 'location', placeholder: 'e.g. Mumbai', icon: <MapPin size={13} /> },
            { label: 'Session fee (INR)', key: 'price', placeholder: '500', type: 'number', icon: <DollarSign size={13} /> },
            { label: 'Years of experience', key: 'experience', placeholder: '5', type: 'number', icon: <Clock size={13} /> },
          ].map(({ label, key, placeholder, type = 'text', icon }) => (
            <div key={key} className="ed-field">
              <label className="ed-field-label"><span className="ed-field-label-icon">{icon}</span>{label}</label>
              <input className="ed-field-input" type={type} placeholder={placeholder} value={form[key] || ''} onChange={e => set(key, e.target.value)} />
            </div>
          ))}
          <div className="ed-field">
            <label className="ed-field-label"><span className="ed-field-label-icon"><Edit3 size={13} /></span>Bio</label>
            <textarea className="ed-field-input ed-field-textarea" rows={4} placeholder="Write a short bio that helps clients understand your expertise..." value={form.bio || ''} onChange={e => set('bio', e.target.value)} />
          </div>
        </div>
        <div className="ed-modal-foot">
          <button className="ed-btn ed-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ed-btn ed-btn-primary" onClick={() => onSave({ ...form, avatarFile })} disabled={saving}>
            {saving ? <><RefreshCw size={14} className="ed-spin" /> Saving...</> : <><Check size={14} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Date Separator ───────────────────────────────
function DateSeparator({ date }) {
  return (
    <div className="ed-date-sep">
      <div className="ed-date-sep-line" />
      <span className="ed-date-sep-text">{date}</span>
      <div className="ed-date-sep-line" />
    </div>
  );
}

// ─── Message Bubble with reactions ───────────────────────
function MessageBubble({ msg, mine, onReact }) {
  const [showReact, setShowReact] = useState(false);
  const { attachmentType, attachmentUrl, attachmentName, attachmentMime } = getChatMessageAttachment(msg);

  return (
    <div
      className={`ed-msg-bubble-wrapper ${mine ? 'mine' : 'theirs'}`}
      onMouseEnter={() => setShowReact(true)}
      onMouseLeave={() => setShowReact(false)}
    >
      {!mine && (
        <div className="ed-msg-peer-avatar">
          {(msg.author || 'C')[0].toUpperCase()}
        </div>
      )}
      <div className="ed-msg-content-col">
        <div className={`ed-msg-bubble ${mine ? 'mine' : 'theirs'}`}>
          {attachmentType === 'image' && attachmentUrl ? (
            <>
              <img
                className="ed-msg-image"
                src={attachmentUrl}
                alt={attachmentName || 'Shared image'}
              />
              {msg.message && <p className="ed-msg-caption">{msg.message}</p>}
            </>
          ) : attachmentType === 'audio' && attachmentUrl ? (
            <>
              <div className="ed-msg-file-card">
                <div className="ed-msg-file-top">
                  <span className="ed-msg-file-badge">Audio</span>
                  <span className="ed-msg-file-name">{attachmentName || 'Audio attachment'}</span>
                </div>
                <audio className="ed-msg-audio" controls preload="metadata">
                  <source src={attachmentUrl} type={attachmentMime || undefined} />
                </audio>
              </div>
              {msg.message && <p className="ed-msg-caption">{msg.message}</p>}
            </>
          ) : attachmentType && attachmentUrl ? (
            <>
              <a
                className="ed-msg-file-card"
                href={attachmentUrl}
                download={attachmentName || undefined}
                target="_blank"
                rel="noreferrer"
              >
                <div className="ed-msg-file-top">
                  <span className="ed-msg-file-badge">{attachmentType === 'pdf' ? 'PDF' : 'File'}</span>
                  <span className="ed-msg-file-name">{attachmentName || 'Attachment'}</span>
                </div>
                <span className="ed-msg-file-link">Open or download</span>
              </a>
              {msg.message && <p className="ed-msg-caption">{msg.message}</p>}
            </>
          ) : (
            <p className="ed-msg-text">{msg.message}</p>
          )}
        </div>
        <div className={`ed-msg-meta ${mine ? 'mine' : ''}`}>
          <span className="ed-msg-time">{formatTime(msg.createdAt)}</span>
          {mine && (
            <span className={`ed-msg-tick ${msg.status === 'failed' ? 'failed' : ''}`} title={msg.status === 'failed' ? 'Message failed to send' : undefined}>
              {msg.status === 'sending' ? <Clock size={10} /> : msg.status === 'failed' ? <XCircle size={10} /> : msg.status === 'sent' ? <Check size={10} /> : <CheckCheck size={10} />}
            </span>
          )}
        </div>
        {msg.reaction && (
          <div className={`ed-msg-reaction ${mine ? 'mine' : ''}`}>{msg.reaction}</div>
        )}
      </div>
      {showReact && (
        <div className={`ed-react-bar ${mine ? 'mine' : ''}`}>
          {QUICK_EMOJIS.map(em => (
            <button key={em} className="ed-react-btn" onClick={() => onReact && onReact(msg._id, em)}>{em}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const ExpertDashboard = () => {
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const email = localStorage.getItem('email');
  const storedRole = localStorage.getItem('role');
  const normalizedRole = String(storedRole || '').toLowerCase();
  const storedName = localStorage.getItem('name') || localStorage.getItem('username') || 'Expert';
  const [profile, setProfile] = useState({
    name: storedName,
    email: email || '',
    field: 'Expert',
    headline: 'Building trust through structured consultations',
    location: '',
    price: 500,
    experience: 0,
    bio: '',
    avatar: '',
    rating: 0,
    ratingsCount: 0,
    responseRate: 96,
    repeatRate: 0,
    status: 'pending',
  });

  const [payments, setPayments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [activeTab, setActiveTab] = useState('overview');
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [activityIndex, setActivityIndex] = useState(0);
  const [sessionFilter, setSessionFilter] = useState('all');
  const [sessionQuery, setSessionQuery] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatError, setChatError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatImageDataUrl, setChatImageDataUrl] = useState('');
  const [chatImageName, setChatImageName] = useState('');
  const [chatAttachmentMime, setChatAttachmentMime] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [liveSocket, setLiveSocket] = useState(null);
  const [incomingCall, setIncomingCall] = useState(() => getStoredIncomingCall());
  const [chatImageViewer, setChatImageViewer] = useState({ open: false, src: '', alt: '' });
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [clientOnlineStatus, setClientOnlineStatus] = useState({});
  const [conversationSearch, setConversationSearch] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState('chat');
  const [msgReactions, setMsgReactions] = useState({});
  const [msgSearch, setMsgSearch] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [callOverlayOpen, setCallOverlayOpen] = useState(false);
  const [callFeedback, setCallFeedback] = useState('');

  const socketRef = useRef(null);
  const activeRoomRef = useRef('');
  const conversationsRef = useRef([]);
  const msgsEndRef = useRef(null);
  const chatImageInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const expertTypingRef = useRef(false);
  const chatInputRef = useRef(null);

  const [statsRef, statsInView] = useInView(0.25);

  useEffect(() => subscribeToIncomingCallChanges(setIncomingCall), []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
    clearStoredIncomingCall();
  }, []);

  const handleCallStateChange = useCallback(({ active, error }) => {
    setCallOverlayOpen(Boolean(active));
    if (error) setCallFeedback(error);
  }, []);

  useEffect(() => {
    if (!callFeedback) return undefined;
    const timer = window.setTimeout(() => setCallFeedback(''), 4000);
    return () => window.clearTimeout(timer);
  }, [callFeedback]);

  useEffect(() => {
    if (!callOverlayOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [callOverlayOpen]);

  useEffect(() => {
    if (!token || !email || normalizedRole !== 'expert') {
      navigate('/login', { replace: true });
    }
  }, [token, email, normalizedRole, navigate]);

  const loadDashboardData = useCallback(async () => {
    if (!token || !email) return;
    setLoading(true);
    setLoadError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [pRes, cRes, payRes] = await Promise.all([
        fetch(`${API}/api/profile?email=${encodeURIComponent(email)}`, { headers }),
        fetch(`${API}/api/conversations?email=${encodeURIComponent(email)}`, { headers }),
        fetch(`${API}/api/my-payments`, { headers }),
      ]);
      const [pData, cData, payData] = await Promise.all([
        pRes.json().catch(() => ({})),
        cRes.json().catch(() => ([])),
        payRes.json().catch(() => ([])),
      ]);
      if (!pRes.ok || !cRes.ok || !payRes.ok) {
        throw new Error('Dashboard request failed');
      }
      if (!pData?.error) {
        setProfile((prev) => ({
          ...prev, ...pData,
          name: pData.name || prev.name,
          email: pData.email || prev.email,
          field: pData.field || prev.field,
          headline: pData.headline || prev.headline,
          location: pData.location || prev.location || '',
          price: toNum(pData.price, prev.price),
          experience: toNum(pData.experience, prev.experience),
          bio: pData.summary || pData.bio || prev.bio,
          avatar: pData.avatar || prev.avatar,
          status: pData.status || prev.status,
          rating: toNum(pData.avgRating ?? pData.rating, prev.rating),
          ratingsCount: toNum(pData.ratingsCount, prev.ratingsCount),
        }));
      }
      setConversations(Array.isArray(cData) ? cData : []);
      setPayments(Array.isArray(payData) ? payData : []);
    } catch {
      setLoadError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [token, email]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const fn = () => setHeaderScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTipIndex((v) => (v + 1) % TIPS.length), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    const s = io(API, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 12_000,
    });
    socketRef.current = s;
    setLiveSocket(s);

    s.on('connect', () => s.emit('authenticate', { token }));
    s.on('auth_success', () => {
      conversationsRef.current.forEach((c) => {
        if (c?.room) s.emit('join-room', { room: c.room });
      });
      if (activeRoomRef.current) s.emit('join_private', activeRoomRef.current);
    });
    s.on('receive_message', (msg) => {
      if (!msg?.room || msg.room !== activeRoomRef.current) {
        if (msg?.room) {
          setUnreadCounts((prev) => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
        }
        return;
      }
      if (msg.author === email) {
        if (msg.clientMessageId) {
          setChatMessages((prev) => prev.map((item) => (
            item.clientMessageId === msg.clientMessageId ? { ...msg, status: 'sent' } : item
          )));
        }
        return;
      }
      setChatMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.author === msg.author && last.message === msg.message && (last.attachmentUrl || last.imageUrl) === (msg.attachmentUrl || msg.imageUrl) && Math.abs(new Date(last.createdAt || 0) - new Date(msg.createdAt || 0)) < 3000) {
          return prev;
        }
        return [...prev, msg];
      });
      setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    });
    s.on('typing', ({ room, user, isTyping }) => {
      if (room !== activeRoomRef.current) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (isTyping) next.add(user); else next.delete(user);
        return next;
      });
    });
    s.on('message_failed', ({ clientMessageId }) => {
      if (!clientMessageId) return;
      setChatMessages((prev) => prev.map((item) => (
        item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item
      )));
    });
    s.on('chat_access_denied', ({ clientMessageId, message }) => {
      if (clientMessageId) {
        setChatMessages((prev) => prev.map((item) => (
          item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item
        )));
      }
      if (message) setCallFeedback(message);
    });
    s.on('online_users', (users) => {
      const next = {};
      Object.entries(users || {}).forEach(([userEmail, info]) => {
        next[String(userEmail || '').toLowerCase()] = Boolean(info?.socketId);
      });
      setClientOnlineStatus(next);
    });
    s.on('user_online', ({ email: userEmail, online }) => {
      setClientOnlineStatus((prev) => ({ ...prev, [String(userEmail || '').toLowerCase()]: online }));
    });
    return () => {
      setLiveSocket(null);
      try { s.disconnect(); } catch (err) { console.error(err); }
    };
  }, [token, email]);

  useEffect(() => {
    conversationsRef.current = conversations;
    if (!liveSocket) return;
    conversations.forEach((c) => { if (c?.room) liveSocket.emit('join-room', { room: c.room }); });
  }, [conversations, liveSocket]);

  const paidPayments = useMemo(() => payments.filter((p) => String(p?.status || '').toLowerCase() === 'paid'), [payments]);
  const totalEarnings = useMemo(() => paidPayments.reduce((sum, p) => sum + toNum(p.amount), 0), [paidPayments]);

  const sessions = useMemo(() => {
    const paymentByClient = new Map();
    for (const p of payments) {
      const key = String(p.clientEmail || '').toLowerCase();
      if (!key) continue;
      if (!paymentByClient.has(key)) paymentByClient.set(key, []);
      paymentByClient.get(key).push(p);
    }
    for (const arr of paymentByClient.values()) {
      arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    const fromConversations = conversations.map((c) => {
      const clientEmail = String(c.otherEmail || '').toLowerCase();
      const clientName = (c.otherEmail || 'Client').split('@')[0];
      const pArr = paymentByClient.get(clientEmail) || [];
      const latest = pArr[0];
      const latestStatus = String(latest?.status || '').toLowerCase();
      const status = latestStatus === 'paid' ? 'completed' : latestStatus === 'failed' ? 'cancelled' : 'upcoming';
      return {
        id: c.room || `${clientEmail}-${c.lastMessageTime || ''}`,
        client: clientName, topic: c.lastMessage || 'Conversation started',
        date: formatRelative(c.lastMessageTime), status,
        amount: latest ? toNum(latest.amount, 0) : 0, rating: null,
        activityTs: c.lastMessageTime || latest?.createdAt,
      };
    });
    const known = new Set(fromConversations.map((s) => s.client.toLowerCase()));
    const fromPayments = [];
    for (const p of payments) {
      const name = p.clientName || (p.clientEmail ? p.clientEmail.split('@')[0] : 'Client');
      if (known.has(String(name).toLowerCase())) continue;
      const statusRaw = String(p.status || '').toLowerCase();
      const status = statusRaw === 'paid' ? 'completed' : statusRaw === 'failed' ? 'cancelled' : 'upcoming';
      fromPayments.push({
        id: p._id || `${p.clientEmail}-${p.createdAt}`, client: name,
        topic: p?.notes?.purpose || 'Consultation payment', date: formatRelative(p.createdAt),
        status, amount: toNum(p.amount, 0), rating: null, activityTs: p.createdAt,
      });
      known.add(String(name).toLowerCase());
    }
    return [...fromConversations, ...fromPayments].sort((a, b) => new Date(b.activityTs || 0) - new Date(a.activityTs || 0));
  }, [conversations, payments]);

  const filteredSessions = useMemo(() => {
    const byStatus = sessionFilter === 'all' ? sessions : sessions.filter((s) => s.status === sessionFilter);
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((s) => (
      String(s.client || '').toLowerCase().includes(q) || String(s.topic || '').toLowerCase().includes(q)
    ));
  }, [sessions, sessionFilter, sessionQuery]);

  const earningsData = useMemo(() => {
    const out = [];
    const now = new Date();
    const map = new Map();
    for (const p of paidPayments) {
      const d = new Date(p.createdAt || Date.now());
      const key = monthKey(d);
      map.set(key, (map.get(key) || 0) + toNum(p.amount));
    }
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      out.push({ month: d.toLocaleDateString('en-IN', { month: 'short' }), amount: map.get(key) || 0, key });
    }
    return out;
  }, [paidPayments]);

  const totalThisMonth = earningsData[earningsData.length - 1]?.amount || 0;
  const totalLastMonth = earningsData[earningsData.length - 2]?.amount || 0;
  const earningsGrowth = totalLastMonth > 0 ? Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100) : (totalThisMonth > 0 ? 100 : 0);

  const activity = useMemo(() => {
    const rows = [];
    for (const c of conversations.slice(0, 5)) {
      rows.push({ icon: <MessageCircle size={16} />, text: `New message from ${c.otherEmail || 'client'}`, time: formatRelative(c.lastMessageTime), color: '#22d3ee' });
    }
    for (const p of payments.slice(0, 5)) {
      const st = String(p.status || '').toLowerCase();
      rows.push({ icon: st === 'paid' ? <DollarSign size={16} /> : <Briefcase size={16} />, text: `${fmtInr(p.amount)} ${st} (${p.clientName || p.clientEmail || 'client'})`, time: formatRelative(p.createdAt), color: st === 'paid' ? '#34d399' : st === 'failed' ? '#fb7185' : '#a78bfa' });
    }
    if (!rows.length) rows.push({ icon: <CheckCircle size={16} />, text: 'Your dashboard is connected', time: 'now', color: '#34d399' });
    return rows.slice(0, 8);
  }, [conversations, payments]);

  useEffect(() => {
    const t = setInterval(() => setActivityIndex((v) => (v + 1) % activity.length), 3200);
    return () => clearInterval(t);
  }, [activity.length]);

  const uniqueClients = useMemo(() => {
    const set = new Set();
    payments.forEach((p) => p.clientEmail && set.add(String(p.clientEmail).toLowerCase()));
    conversations.forEach((c) => c.otherEmail && set.add(String(c.otherEmail).toLowerCase()));
    return set;
  }, [payments, conversations]);

  const repeatRate = useMemo(() => {
    const counts = new Map();
    paidPayments.forEach((p) => {
      const key = String(p.clientEmail || '').toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (!counts.size) return 0;
    const repeat = [...counts.values()].filter((v) => v > 1).length;
    return Math.round((repeat / counts.size) * 100);
  }, [paidPayments]);

  const computedProfile = useMemo(() => ({ ...profile, totalSessions: sessions.length, totalEarnings, repeatRate }), [profile, sessions.length, totalEarnings, repeatRate]);
  const statusRaw = String(computedProfile.status || 'pending').toLowerCase();
  const statusLabel = statusRaw === 'approved' ? 'Verified' : statusRaw === 'rejected' ? 'Rejected' : 'Pending';

  const domainColor = getDomainColor(computedProfile.field);
  const cSessions = useCounter(computedProfile.totalSessions, 1400, statsInView);
  const cEarnings = useCounter(computedProfile.totalEarnings, 1800, statsInView);
  const cRating = useCounter(Math.round((computedProfile.rating || 4.8) * 10), 1200, statsInView);
  const cRepeat = useCounter(computedProfile.repeatRate || 0, 1200, statsInView);
  const go = useCallback((path) => navigate(path), [navigate]);

  const openConversation = useCallback(async (c) => {
    if (!c?.room || !token) return;
    setActiveTab('chat');
    setActiveRoom(c.room);
    activeRoomRef.current = c.room;
    setChatImageDataUrl('');
    setChatImageName('');
    setChatAttachmentMime('');
    if (chatImageInputRef.current) chatImageInputRef.current.value = '';
    setUnreadCounts((prev) => ({ ...prev, [c.room]: 0 }));
    setMobileSidebarOpen(false);
    setMobilePane('chat');
    setLoadingChat(true);
    setChatError('');
    try {
      const r = await fetch(`${API}/api/messages?room=${encodeURIComponent(c.room)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => []);
      if (!r.ok) throw new Error('History unavailable');
      setChatMessages(Array.isArray(data) ? data : []);
      setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'auto' }), 40);
      socketRef.current?.emit('join_private', c.room);
    } catch {
      setChatMessages([]);
      setChatError('Message history could not be loaded. Reopen this conversation to retry.');
    } finally {
      setLoadingChat(false);
    }
  }, [token]);

  useEffect(() => {
    if (!incomingCall?.room || activeRoom === incomingCall.room) return;
    const existingConversation = conversations.find((item) => item.room === incomingCall.room);
    const incomingConversation = existingConversation || {
      room: incomingCall.room,
      otherEmail: incomingCall.otherEmail || incomingCall.from || 'client',
      otherName: incomingCall.fromName || String(incomingCall.from || 'Client').split('@')[0],
    };
    if (!existingConversation) {
      setConversations((prev) => [incomingConversation, ...prev]);
    }
    openConversation(incomingConversation);
  }, [incomingCall, conversations, activeRoom, openConversation]);

  const sendChatMessage = useCallback(() => {
    if (!socketRef.current?.connected) {
      setChatError('Reconnecting. Your draft is safe; send it when the connection returns.');
      return;
    }
    setChatError('');
    const room = activeRoomRef.current || activeRoom;
    const txt = chatInput.trim();
    const attachmentPayload = getChatAttachmentPayload({
      dataUrl: chatImageDataUrl,
      name: chatImageName,
      mime: chatAttachmentMime,
    });
    const hasAttachment = Boolean(attachmentPayload.attachmentUrl);
    if (!room || (!txt && !hasAttachment) || !email) return;
    const clientMessageId = `expert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const local = {
      _id: `local-${Date.now()}`,
      clientMessageId,
      room, author: email, authorRole: 'expert',
      message: txt,
      createdAt: new Date().toISOString(),
      status: 'sending',
      ...attachmentPayload,
    };
    setChatMessages((prev) => [...prev, local]);
    setChatInput('');
    setChatImageDataUrl('');
    setChatImageName('');
    setChatAttachmentMime('');
    if (chatImageInputRef.current) chatImageInputRef.current.value = '';
    expertTypingRef.current = false;
    socketRef.current?.emit('stop_typing', { room });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketRef.current?.emit('send_private_message', {
      room, author: email, authorRole: 'expert',
      clientMessageId,
      message: txt,
      ...attachmentPayload,
    });
    setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    chatInputRef.current?.focus();
  }, [activeRoom, chatAttachmentMime, chatImageDataUrl, chatImageName, chatInput, email]);

  const onPickChatAttachment = useCallback(async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const error = validateChatAttachmentFile(file);
    if (error) { alert(error); ev.target.value = ''; return; }
    try {
      const v = await readFileAsDataUrl(file);
      setChatImageDataUrl(v);
      setChatImageName(file.name || 'attachment');
      setChatAttachmentMime(file.type || '');
    } catch {
      alert('Could not read the selected file.');
      ev.target.value = '';
    }
  }, []);

  const handleChatInputChange = useCallback((value) => {
    setChatInput(value);
    const room = activeRoomRef.current || activeRoom;
    if (!room || !email) return;
    const hasText = Boolean(value.trim());
    if (hasText && !expertTypingRef.current) {
      expertTypingRef.current = true;
      socketRef.current?.emit('typing', { room, isTyping: true });
    } else if (!hasText && expertTypingRef.current) {
      expertTypingRef.current = false;
      socketRef.current?.emit('stop_typing', { room });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (hasText) {
      typingTimeoutRef.current = setTimeout(() => {
        expertTypingRef.current = false;
        socketRef.current?.emit('stop_typing', { room });
      }, 2000);
    }
  }, [activeRoom, email]);

  const handleReaction = useCallback((msgId, emoji) => {
    setMsgReactions(prev => ({ ...prev, [msgId]: emoji }));
  }, []);

  const filteredConversations = useMemo(() => {
    if (!conversationSearch.trim()) return conversations;
    const q = conversationSearch.toLowerCase();
    return conversations.filter((c) => {
      const em = String(c.otherEmail || '').toLowerCase();
      const message = String(c.lastMessage || '').toLowerCase();
      return em.includes(q) || message.includes(q);
    });
  }, [conversations, conversationSearch]);

  // Group messages by date then by author
  const groupedByDate = useMemo(() => {
    const filtered = msgSearch.trim()
      ? chatMessages.filter(m => String(m.message || '').toLowerCase().includes(msgSearch.toLowerCase()))
      : chatMessages;

    const dateGroups = [];
    let currentDate = null;
    let currentGroup = null;

    filtered.forEach((msg) => {
      const msgDate = formatDateHeader(msg.createdAt);
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        if (currentGroup) dateGroups[dateGroups.length - 1].groups.push(currentGroup);
        const newDateGroup = { date: msgDate, groups: [] };
        dateGroups.push(newDateGroup);
        currentGroup = null;
      }
      const isFromSameAuthor = currentGroup && currentGroup.author === msg.author;
      const isTimeClose = currentGroup && Math.abs(new Date(msg.createdAt || 0) - new Date(currentGroup.messages[currentGroup.messages.length - 1].createdAt || 0)) < 300000;
      if (isFromSameAuthor && isTimeClose) {
        currentGroup.messages.push(msg);
      } else {
        if (currentGroup) dateGroups[dateGroups.length - 1].groups.push(currentGroup);
        currentGroup = { author: msg.author, messages: [msg] };
      }
    });
    if (currentGroup && dateGroups.length > 0) {
      dateGroups[dateGroups.length - 1].groups.push(currentGroup);
    }
    return dateGroups;
  }, [chatMessages, msgSearch]);

  const handleLogout = () => {
    ['token', 'email', 'name', 'username', 'role', 'field', 'headline', 'price', 'experience'].forEach((k) => localStorage.removeItem(k));
    navigate('/login');
  };

  const handleSaveProfile = async (updatedProfile) => {
    if (!token) return;
    setSavingProfile(true);
    try {
      const payload = {
        name: updatedProfile.name, field: updatedProfile.field, headline: updatedProfile.headline,
        location: updatedProfile.location, price: toNum(updatedProfile.price, 0),
        experience: toNum(updatedProfile.experience, 0), bio: updatedProfile.bio || '',
      };
      const applySavedProfile = (next) => {
        setProfile((prev) => ({ ...prev, ...next }));
        localStorage.setItem('name', next.name || storedName);
        localStorage.setItem('field', next.field || '');
        localStorage.setItem('headline', next.headline || '');
        localStorage.setItem('price', String(next.price || 0));
        localStorage.setItem('experience', String(next.experience || 0));
        setEditModalOpen(false);
      };
      const r = await fetch(`${API}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) throw new Error('Profile API route not found on backend.');
      if (!r.ok || d?.error) throw new Error(d?.error || 'Failed to update profile');
      let nextAvatar = d?.expert?.avatar || profile.avatar;
      const avatarFile = updatedProfile.avatarFile;
      if (avatarFile) {
        const fd = new FormData();
        fd.append('photo', avatarFile);
        const pr = await fetch(`${API}/api/profile/photo`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        const pd = await pr.json().catch(() => ({}));
        if (!pr.ok || pd?.error) throw new Error(pd?.error || 'Failed to update profile photo');
        nextAvatar = pd?.expert?.avatar || nextAvatar;
      }
      applySavedProfile({ ...payload, bio: d?.expert?.summary || payload.bio, avatar: nextAvatar });
    } catch (err) {
      alert(err.message || 'Profile update failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const usernameInitial = (computedProfile.name?.charAt(0) || 'E').toUpperCase();
  const avatarSrc = toAssetUrl(computedProfile.avatar);
  const activeConversation = useMemo(() => conversations.find((item) => item.room === activeRoom) || null, [conversations, activeRoom]);
  const activeClientName = useMemo(
    () => activeConversation?.otherName || String(activeConversation?.otherEmail || 'Client').split('@')[0] || 'Client',
    [activeConversation]
  );
  const activeClientOnline = clientOnlineStatus[activeConversation?.otherEmail] || false;
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + Number(count || 0), 0);

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
    { id: 'sessions', label: 'Sessions', icon: <Calendar size={16} /> },
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={16} />, badge: totalUnread },
    { id: 'earnings', label: 'Earnings', icon: <DollarSign size={16} /> },
    { id: 'profile', label: 'Profile', icon: <Settings size={16} /> },
  ];

  if (loading) {
    return (
      <div className="ed-page ed-loading-page">
        <div className="ed-loading-content">
          <div className="ed-loading-logo">Solve<span>nut</span></div>
          <div className="ed-loading-ring">
            <div className="ed-loading-ring-inner" style={{ '--ring-color': '#22d3ee' }} />
          </div>
          <p>Loading your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ed-page">
      {callFeedback && <div className="ed-call-feedback" role="status">{callFeedback}</div>}
      {/* Canvas */}
      <div className="ed-canvas" aria-hidden>
        <div className="ed-grid" />
      </div>

      <aside className="ed-desktop-sidebar" aria-label="Expert workspace navigation">
        <button className="ed-side-brand" onClick={() => go('/')}>
          <span className="ed-side-brand-mark">S</span>
          <span className="ed-side-brand-copy"><strong>solve<span>nut</span></strong><small>Expert workspace</small></span>
        </button>

        <div className="ed-side-profile">
          <div className="ed-side-avatar" style={{ background: `linear-gradient(135deg, ${domainColor}, #34d399)` }}>
            {avatarSrc ? <img src={avatarSrc} alt={computedProfile.name} /> : usernameInitial}
          </div>
          <div className="ed-side-profile-copy">
            <strong>{computedProfile.name}</strong>
            <span>{computedProfile.field || 'Expert'}</span>
          </div>
          <div className={`ed-side-status ed-side-status--${statusRaw}`} title={statusLabel} />
        </div>

        <div className="ed-side-label">Workspace</div>
        <nav className="ed-side-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`ed-side-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={activeTab === tab.id ? { '--side-accent': domainColor } : {}}
            >
              <span>{tab.icon}</span>
              <strong>{tab.label}</strong>
              {tab.badge > 0 && <em>{tab.badge}</em>}
            </button>
          ))}
        </nav>

        <div className="ed-side-footer">
          <button onClick={() => go('/experts')}><Eye size={15} /><span>View public listing</span></button>
          <button className="danger" onClick={handleLogout}><LogOut size={15} /><span>Log out</span></button>
        </div>
      </aside>

      {/* Header */}
      <header className={`ed-header ${headerScrolled ? 'ed-header--scrolled' : ''}`}>
        <div className="ed-shell ed-header-inner">
          <button className="ed-logo" onClick={() => go('/')}>
            <div className="ed-logo-mark" style={{ '--lc': domainColor }}>S</div>
            <div className="ed-logo-info">
              <span className="ed-logo-name">Solve<span className="ed-logo-accent">nut</span></span>
              <span className="ed-logo-sub">Expert</span>
            </div>
          </button>

          <div className="ed-header-context">
            <span>Expert workspace</span>
            <strong>{TABS.find((tab) => tab.id === activeTab)?.label || 'Overview'}</strong>
          </div>

          <nav className="ed-tab-nav" aria-label="Dashboard sections">
            {TABS.map((tab) => (
              <button key={tab.id} className={`ed-tab-btn ${activeTab === tab.id ? 'ed-tab-btn--active' : ''}`} onClick={() => setActiveTab(tab.id)} style={activeTab === tab.id ? { '--tab-color': domainColor } : {}}>
                <span className="ed-tab-btn-icon">{tab.icon}</span>
                <span className="ed-tab-btn-label">{tab.label}</span>
                {tab.badge > 0 && <span className="ed-tab-badge">{tab.badge}</span>}
              </button>
            ))}
          </nav>

          <div className="ed-header-right">
            <div className="ed-notif-wrap">
              <button className="ed-icon-btn" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications">
                <Bell size={16} />
                {totalUnread > 0 && <span className="ed-notif-dot" />}
              </button>
              {notifOpen && (
                <div className="ed-notif-panel">
                  <div className="ed-notif-head">
                    <span>Notifications</span>
                    <span className="ed-notif-count">{totalUnread}</span>
                  </div>
                  {activity.slice(0, 4).map((item, i) => (
                    <div key={i} className="ed-notif-item">
                      <span className="ed-notif-icon-em">{item.icon}</span>
                      <div>
                        <div className="ed-notif-title">{item.text}</div>
                        <div className="ed-notif-sub">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="ed-icon-btn" onClick={() => setEditModalOpen(true)} aria-label="Edit profile"><Edit3 size={15} /></button>

            <div className="ed-user-chip">
              <div className="ed-user-avatar" style={{ background: `linear-gradient(135deg, ${domainColor}, #06b6d4)` }}>
                {avatarSrc ? <img src={avatarSrc} alt={computedProfile.name} /> : usernameInitial}
              </div>
              <div className="ed-user-info">
                <span className="ed-user-name">{computedProfile.name}</span>
                <span className="ed-user-role" style={{ color: statusRaw === 'approved' ? '#34d399' : '#fbbf24' }}>
                  {statusRaw === 'approved' ? 'Verified' : statusRaw === 'rejected' ? 'Rejected' : 'Pending review'}
                </span>
              </div>
            </div>

            <button className="ed-btn ed-btn-ghost ed-btn-sm ed-header-listing" onClick={() => go('/experts')}><Eye size={13} />Listing</button>
            <button className="ed-btn ed-btn-danger ed-btn-sm ed-header-logout" onClick={handleLogout}><LogOut size={13} />Logout</button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="ed-mobile-nav">
        <div className="ed-mobile-nav-inner">
          {TABS.map((tab) => (
            <button key={tab.id} className={`ed-mobile-tab ${activeTab === tab.id ? 'ed-mobile-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)} style={activeTab === tab.id ? { '--tc': domainColor } : {}}>
              <span className="ed-mobile-tab-icon">{tab.icon}</span>
              <span className="ed-mobile-tab-label">{tab.label}</span>
              {tab.badge > 0 && <span className="ed-mobile-badge">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </nav>

      <main className={`ed-main ${activeTab === 'chat' ? 'ed-main--chat' : ''}`}>
        <div className="ed-shell">

          {loadError && (
            <div className="ed-error-banner">
              <span>{loadError}</span>
              <button className="ed-btn ed-btn-sm ed-btn-ghost" onClick={loadDashboardData}><RefreshCw size={13} /> Retry</button>
            </div>
          )}

          {/* ─── OVERVIEW TAB ─────────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              <section className={`ed-hero ${heroVisible ? 'ed-hero--visible' : ''}`}>
                <div className="ed-hero-layout">
                  <div className="ed-hero-copy">
                    <div className="ed-hero-badge" style={{ color: domainColor, borderColor: `${domainColor}40`, background: `${domainColor}10` }}>
                      <span className="ed-badge-pulse" style={{ background: domainColor }} />
                      Expert Dashboard
                    </div>
                    <h1 className="ed-hero-title">
                      Welcome back,
                      <span className="ed-hero-gradient" style={{ '--gc': domainColor }}> {computedProfile.name}</span>
                    </h1>
                    <p className="ed-hero-sub">{computedProfile.headline || 'Your expert workspace is ready.'}</p>
                    <div className="ed-hero-domain-pill" style={{ color: domainColor, borderColor: `${domainColor}35`, background: `${domainColor}0D` }}>
                      <Briefcase size={12} />{computedProfile.field || 'Expert'}
                    </div>
                    <div className="ed-hero-actions">
                      <button className="ed-btn ed-btn-primary ed-btn-lg" onClick={() => setActiveTab('chat')}><MessageSquare size={16} />Open messages</button>
                      <button className="ed-btn ed-btn-outline ed-btn-lg" onClick={() => setEditModalOpen(true)}><Edit3 size={16} />Edit Profile</button>
                    </div>
                    <div className="ed-tip-strip">
                      <span className="ed-tip-icon"><Zap size={13} /></span>
                      <p className="ed-tip-text" key={tipIndex}>{TIPS[tipIndex]}</p>
                    </div>
                  </div>

                  <div className="ed-hero-card">
                    <div className="ed-profile-top">
                      <div className="ed-profile-avatar-wrap">
                        <div className="ed-profile-avatar" style={{ background: `linear-gradient(135deg, ${domainColor}, #06b6d4)` }}>
                          {avatarSrc ? <img src={avatarSrc} alt={computedProfile.name} /> : usernameInitial}
                        </div>
                        <div className={`ed-profile-status-ring ed-status-${statusRaw}`} title={statusLabel} />
                      </div>
                      <div className="ed-profile-identity">
                        <h2 className="ed-profile-name">{computedProfile.name}</h2>
                        <div className="ed-profile-field" style={{ color: domainColor }}>{computedProfile.field}</div>
                        <div className={`ed-verify-pill ed-verify-${statusRaw}`}>
                          {statusRaw === 'approved' ? <CheckCircle size={10} /> : statusRaw === 'rejected' ? <XCircle size={10} /> : <Clock size={10} />}
                          {statusLabel}
                        </div>
                        <div className="ed-profile-stars">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={12} fill={i < Math.floor(computedProfile.rating || 0) ? '#fbbf24' : 'none'} color={i < Math.floor(computedProfile.rating || 0) ? '#fbbf24' : '#374151'} />
                          ))}
                          <span className="ed-rating-text">{computedProfile.rating ? `${computedProfile.rating} (${computedProfile.ratingsCount})` : 'No ratings'}</span>
                        </div>
                      </div>
                      <button className="ed-profile-edit-btn" onClick={() => setEditModalOpen(true)}><Edit3 size={13} /></button>
                    </div>

                    <div className="ed-profile-stats" ref={statsRef}>
                      {[
                        { icon: <MessageCircle size={17} />, value: statsInView ? cSessions : 0, label: 'Sessions', color: domainColor },
                        { icon: <DollarSign size={17} />, value: statsInView ? fmtShortInr(cEarnings) : '₹0', label: 'Earnings', color: '#34d399' },
                        { icon: <Star size={17} />, value: statsInView ? (cRating / 10).toFixed(1) : '0', label: 'Rating', color: '#fbbf24' },
                        { icon: <RefreshCw size={17} />, value: statsInView ? `${cRepeat}%` : '0%', label: 'Repeat', color: '#a78bfa' },
                      ].map(({ icon, value, label, color }) => (
                        <div key={label} className="ed-stat-pill" style={{ '--sp-c': color }}>
                          <span className="ed-stat-pill-icon">{icon}</span>
                          <span className="ed-stat-pill-value">{value}</span>
                          <span className="ed-stat-pill-label">{label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="ed-profile-meta">
                      {[
                        { icon: <MapPin size={12} />, val: computedProfile.location || 'Location not set' },
                        { icon: <Clock size={12} />, val: `${toNum(computedProfile.experience)}+ yrs experience` },
                        { icon: <DollarSign size={12} />, val: `${fmtInr(computedProfile.price)} / session` },
                      ].map(({ icon, val }) => (
                        <div key={val} className="ed-meta-row">
                          <span style={{ color: domainColor }}>{icon}</span>
                          <span>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Stats Bar */}
              <div className="ed-stats-bar">
                {[
                  { icon: <TrendingUp size={18} />, value: fmtShortInr(totalThisMonth), label: 'This month', color: '#34d399', trend: earningsGrowth },
                  { icon: <MessageCircle size={18} />, value: sessions.filter((s) => s.status === 'completed').length, label: 'Completed', color: domainColor },
                  { icon: <Star size={18} />, value: computedProfile.rating || '—', label: 'Avg rating', color: '#fbbf24' },
                  { icon: <Users size={18} />, value: uniqueClients.size, label: 'Clients', color: '#a78bfa' },
                ].map(({ icon, value, label, color, trend }) => (
                  <div key={label} className="ed-stat-bar-item">
                    <div className="ed-stat-bar-icon" style={{ color }}>{icon}</div>
                    <div className="ed-stat-bar-value" style={{ color }}>
                      {value}
                      {trend !== undefined && (
                        <span className={`ed-trend ${trend >= 0 ? 'up' : 'down'}`}>
                          {trend >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}{Math.abs(trend)}%
                        </span>
                      )}
                    </div>
                    <div className="ed-stat-bar-label">{label}</div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <section className="ed-section">
                <div className="ed-section-head">
                  <div className="ed-kicker">Quick Actions</div>
                  <h2 className="ed-section-title">Manage your workspace</h2>
                </div>
                <div className="ed-quick-grid">
                  {[
                    { icon: <Eye size={19} />, color: domainColor, title: 'View Public Profile', sub: 'See how clients discover you.', onClick: () => go('/experts') },
                    { icon: <Edit3 size={19} />, color: '#fbbf24', title: 'Update Profile', sub: 'Keep headline, domain and price current.', onClick: () => setEditModalOpen(true) },
                    { icon: <MessageCircle size={19} />, color: '#34d399', title: 'Client Chat', sub: 'Reply to clients in real-time.', onClick: () => setActiveTab('chat'), badge: totalUnread },
                    { icon: <BarChart3 size={19} />, color: '#a78bfa', title: 'Earnings', sub: 'Track monthly income trends.', onClick: () => setActiveTab('earnings') },
                  ].map(({ icon, color, title, sub, onClick, badge }) => (
                    <button key={title} className="ed-quick-card" onClick={onClick} style={{ '--qc': color }}>
                      <div className="ed-quick-icon-wrap" style={{ background: `${color}18`, color }}>{icon}</div>
                      <div className="ed-quick-body">
                        <div className="ed-quick-title">{title}{badge > 0 && <span className="ed-quick-badge">{badge}</span>}</div>
                        <div className="ed-quick-sub">{sub}</div>
                      </div>
                      <ArrowRight size={14} style={{ color, opacity: 0.7, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </section>

              {/* Recent + Activity */}
              <section className="ed-section">
                <div className="ed-two-col">
                  <div className="ed-card">
                    <div className="ed-card-head">
                      <h3 className="ed-card-title">Recent Sessions</h3>
                      <button className="ed-card-link" onClick={() => setActiveTab('sessions')}>All <ArrowRight size={12} /></button>
                    </div>
                    {sessions.length === 0 ? (
                      <div className="ed-empty-mini">No sessions yet</div>
                    ) : sessions.slice(0, 4).map((s) => (
                      <div key={s.id} className="ed-session-mini-row" onClick={() => {
                        const c = conversations.find((x) => (x.otherEmail || '').toLowerCase().startsWith((s.client || '').toLowerCase()));
                        if (c) openConversation(c);
                      }}>
                        <div className="ed-session-mini-av">{(s.client || 'C')[0].toUpperCase()}</div>
                        <div className="ed-session-mini-info">
                          <div className="ed-session-mini-name">{s.client}</div>
                          <div className="ed-session-mini-topic">{s.topic}</div>
                        </div>
                        <div className={`ed-status-badge ed-status--${s.status}`}>{s.status}</div>
                      </div>
                    ))}
                  </div>

                  <div className="ed-card">
                    <div className="ed-card-head">
                      <h3 className="ed-card-title">Live Activity</h3>
                      <span className="ed-live-pill"><span className="ed-live-dot" />Live</span>
                    </div>
                    <div className="ed-activity-list">
                      {activity.map((item, i) => (
                        <div key={i} className={`ed-activity-item ${i === activityIndex ? 'active' : ''}`}>
                          <span className="ed-activity-em" style={{ color: item.color }}>{item.icon}</span>
                          <div className="ed-activity-body">
                            <div className="ed-activity-text">{item.text}</div>
                            <div className="ed-activity-time">{item.time}</div>
                          </div>
                          <div className="ed-activity-dot" style={{ background: item.color }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ─── SESSIONS TAB ─────────────────────────────────── */}
          {activeTab === 'sessions' && (
            <section className="ed-section">
              <div className="ed-workspace-hero">
                <div className="ed-workspace-copy">
                  <div className="ed-kicker">Sessions</div>
                  <h1 className="ed-workspace-title">Session Pipeline</h1>
                  <p className="ed-workspace-sub">Track upcoming bookings, completed consults, and client history.</p>
                </div>
                <div className="ed-workspace-chips">
                  {[
                    { label: 'All', value: sessions.length, color: domainColor },
                    { label: 'Completed', value: sessions.filter(s => s.status === 'completed').length, color: '#34d399' },
                    { label: 'Upcoming', value: sessions.filter(s => s.status === 'upcoming').length, color: '#22d3ee' },
                  ].map(chip => (
                    <div key={chip.label} className="ed-workspace-chip" style={{ '--cc': chip.color }}>
                      <span className="ed-wc-label">{chip.label}</span>
                      <strong className="ed-wc-value">{chip.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ed-card">
                <div className="ed-session-controls">
                  <div className="ed-filter-pills">
                    {['all', 'upcoming', 'completed', 'cancelled'].map((f) => (
                      <button key={f} className={`ed-filter-pill ${sessionFilter === f ? 'active' : ''}`} onClick={() => setSessionFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                        <span className="ed-pill-count">
                          {f === 'all' ? sessions.length : sessions.filter(s => s.status === f).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="ed-search-wrap">
                    <Search size={14} />
                    <input className="ed-filter-search" value={sessionQuery} onChange={(e) => setSessionQuery(e.target.value)} placeholder="Search client or topic..." />
                  </div>
                </div>
                <div className="ed-session-table-head">
                  <span>Client</span><span>Date</span><span>Rating</span><span>Earned</span><span>Status</span>
                </div>
                <div className="ed-session-list">
                  {filteredSessions.length === 0 ? (
                    <div className="ed-empty-state"><span className="ed-empty-icon"><Calendar size={28} /></span><p>No sessions found</p></div>
                  ) : filteredSessions.map((s) => <SessionRow key={s.id} session={s} />)}
                </div>
              </div>
            </section>
          )}

          {/* ─── CHAT TAB ─────────────────────────────────────── */}
          {activeTab === 'chat' && (
            <section className="ed-section ed-section--chat">
              <div className={`ed-chat-shell mobile-pane-${mobilePane}`}>

                {/* Sidebar */}
                <div className={`ed-chat-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
                  <div className="ed-sidebar-top">
                    <h3 className="ed-sidebar-title">Messages</h3>
                    <div className="ed-sidebar-badge">{filteredConversations.length}</div>
                    <button className="ed-sidebar-close-btn" onClick={() => setMobileSidebarOpen(false)}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className="ed-sidebar-search">
                    <Search size={14} />
                    <input
                      placeholder="Search conversations…"
                      value={conversationSearch}
                      onChange={(e) => setConversationSearch(e.target.value)}
                    />
                    {conversationSearch && <button onClick={() => setConversationSearch('')}><X size={12} /></button>}
                  </div>

                  <div className="ed-conv-list">
                    {filteredConversations.length === 0 ? (
                      <div className="ed-conv-empty">
                        <span><MessageCircle size={32} /></span>
                        <p>{conversationSearch ? 'No results' : 'No conversations yet'}</p>
                      </div>
                    ) : filteredConversations.map((c) => {
                      const who = c.otherName || c.otherEmail || 'client';
                      const isOnline = clientOnlineStatus[c.otherEmail] || false;
                      const unread = unreadCounts[c.room] || 0;
                      const isActive = activeRoom === c.room;
                      return (
                        <button key={c.room} className={`ed-conv-item ${isActive ? 'active' : ''}`} onClick={() => openConversation(c)}>
                          <div className="ed-conv-av-wrap">
                            <div className={`ed-conv-av ${isOnline ? 'online' : ''}`}>{who[0].toUpperCase()}</div>
                            <div className={`ed-conv-status ${isOnline ? 'online' : ''}`} />
                          </div>
                          <div className="ed-conv-body">
                            <div className="ed-conv-row1">
                              <span className="ed-conv-name">{who}</span>
                              <span className="ed-conv-time">{formatRelative(c.lastMessageTime)}</span>
                            </div>
                            <div className="ed-conv-row2">
                              <span className="ed-conv-preview">{c.lastMessage || 'Open chat'}</span>
                              {unread > 0 && <span className="ed-conv-unread">{unread}</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sidebar overlay for mobile */}
                {mobileSidebarOpen && <div className="ed-sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />}

                {/* Main chat */}
                <div className="ed-chat-main">
                  {!activeRoom ? (
                    <div className="ed-chat-empty">
                      <div className="ed-chat-empty-icon"><MessageSquare size={34} /></div>
                      <h2>Select a conversation</h2>
                      <p>Choose a client to start messaging</p>
                      <button className="ed-btn ed-btn-primary ed-btn-sm" onClick={() => setMobileSidebarOpen(true)}>
                        <MessageSquare size={13} /> View Conversations
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Chat Header */}
                      <div className="ed-chat-header">
                        <button className="ed-chat-back-btn" onClick={() => { setMobileSidebarOpen(true); setActiveRoom(''); activeRoomRef.current = ''; }}>
                          <ChevronLeft size={18} />
                        </button>
                        <div className={`ed-chat-peer-av ${activeClientOnline ? 'online' : ''}`}>
                          {activeClientName[0]?.toUpperCase() || 'C'}
                        </div>
                        <div className="ed-chat-peer-info">
                          <div className="ed-chat-peer-name">{activeClientName}</div>
                          <div className={`ed-chat-peer-status ${activeClientOnline ? 'online' : ''}`}>
                            <span className={`ed-presence-dot ${activeClientOnline ? 'online' : ''}`} />
                            {activeClientOnline ? 'Online now' : 'Offline'}
                            {typingUsers.size > 0 && <span className="ed-typing-label"> · typing…</span>}
                          </div>
                        </div>
                        <div className="ed-chat-header-actions">
                          <div className={`ed-chat-call-launcher ${callOverlayOpen ? 'is-open' : ''}`}>
                            <VideoCall
                              socket={liveSocket}
                              roomId={activeRoom}
                              currentUserEmail={email}
                              currentUserName={profile.name || storedName}
                              peerLabel={activeClientName}
                              enabled={Boolean(activeRoom)}
                              compact
                              externalIncomingCall={incomingCall}
                              onIncomingCallCleared={clearIncomingCall}
                              onCallStateChange={handleCallStateChange}
                            />
                          </div>
                          <button className="ed-chat-hbtn" onClick={() => setShowMsgSearch(v => !v)} title="Search messages">
                            <Search size={15} />
                          </button>
                          <button className="ed-chat-hbtn" onClick={() => setMobileSidebarOpen(true)} title="All chats">
                            <Menu size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="ed-mobile-pane-switcher" aria-label="Mobile sections">
                        <button
                          type="button"
                          className={`ed-mobile-pane-btn ${mobilePane === 'chat' ? 'active' : ''}`}
                          onClick={() => setMobilePane('chat')}
                        >
                          <MessageSquare size={15} />
                          <span>Chat</span>
                        </button>
                      </div>

                      {/* Message search bar */}
                      {showMsgSearch && (
                        <div className="ed-msg-search-bar">
                          <Search size={14} />
                          <input
                            autoFocus
                            placeholder="Search in this chat…"
                            value={msgSearch}
                            onChange={e => setMsgSearch(e.target.value)}
                          />
                          {msgSearch && <span className="ed-msg-search-count">{chatMessages.filter(m => m.message?.toLowerCase().includes(msgSearch.toLowerCase())).length} results</span>}
                          <button onClick={() => { setShowMsgSearch(false); setMsgSearch(''); }}><X size={13} /></button>
                        </div>
                      )}

                      {/* Messages */}
                      <div className="ed-messages-area" role="log" aria-label="Conversation">
                        {loadingChat ? (
                          <div className="ed-msgs-loading">
                            <div className="ed-msgs-spinner" />
                            <span>Loading messages…</span>
                          </div>
                        ) : groupedByDate.length === 0 ? (
                          <div className="ed-msgs-empty">
                            <span><MessageCircle size={30} /></span>
                            <p>Say hello to start the conversation!</p>
                          </div>
                        ) : groupedByDate.map((dateGroup, di) => (
                          <div key={di}>
                            <DateSeparator date={dateGroup.date} />
                            {dateGroup.groups.map((group, gi) => {
                              const mine = group.author === email;
                              return (
                                <div key={gi} className={`ed-msg-group ${mine ? 'mine' : 'theirs'}`}>
                                  {group.messages.map((m, mi) => (
                                    <MessageBubble
                                      key={m._id || mi}
                                      msg={{ ...m, reaction: msgReactions[m._id] }}
                                      mine={mine}
                                      onReact={(id, em) => handleReaction(id, em)}
                                    />
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {typingUsers.size > 0 && (
                          <div className="ed-typing-indicator">
                            <div className="ed-typing-dots">
                              <span /><span /><span />
                            </div>
                          </div>
                        )}
                        <div ref={msgsEndRef} />
                      </div>

                      {/* Compose */}
                      <div className="ed-compose">
                        {chatError && <p className="ed-chat-error" role="alert">{chatError}</p>}
                        <input ref={chatImageInputRef} type="file" accept={CHAT_ATTACHMENT_ACCEPT} className="ed-file-hidden" onChange={onPickChatAttachment} />

                        {chatImageDataUrl && (
                          <div className="ed-attach-preview">
                            {getChatAttachmentType({
                              mime: chatAttachmentMime,
                              name: chatImageName,
                              attachmentUrl: chatImageDataUrl,
                            }) === 'image' ? (
                              <img src={chatImageDataUrl} alt="Attachment" />
                            ) : (
                              <div className="ed-attach-thumb">
                                {getChatAttachmentType({
                                  mime: chatAttachmentMime,
                                  name: chatImageName,
                                  attachmentUrl: chatImageDataUrl,
                                }) === 'audio' ? 'AUDIO' : getChatAttachmentType({
                                  mime: chatAttachmentMime,
                                  name: chatImageName,
                                  attachmentUrl: chatImageDataUrl,
                                }) === 'pdf' ? 'PDF' : 'FILE'}
                              </div>
                            )}
                            <div className="ed-attach-meta">
                              <span className="ed-attach-name">{chatImageName}</span>
                              <button className="ed-attach-rm" onClick={() => { setChatImageDataUrl(''); setChatImageName(''); setChatAttachmentMime(''); if (chatImageInputRef.current) chatImageInputRef.current.value = ''; }}>
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="ed-compose-row">
                          <button className="ed-compose-btn" onClick={() => chatImageInputRef.current?.click()} title="Attach file">
                            <Paperclip size={16} />
                          </button>
                          <div className="ed-compose-input-wrap">
                            <textarea
                              ref={chatInputRef}
                              className="ed-compose-input"
                              rows={1}
                              value={chatInput}
                              onChange={(e) => {
                                handleChatInputChange(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                              }}
                              aria-label="Message to client"
                              placeholder="Type a message…"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendChatMessage(); }
                              }}
                            />
                          </div>
                          <button
                            className={`ed-send-btn ${(chatInput.trim() || chatImageDataUrl) ? 'active' : ''}`}
                            onClick={sendChatMessage}
                            disabled={!chatInput.trim() && !chatImageDataUrl}
                            title="Send"
                          >
                            <Send size={15} />
                            <span className="ed-send-btn-label">Send</span>
                          </button>
                        </div>
                        <div className="ed-compose-hint">Enter to send · Shift+Enter for new line</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ─── EARNINGS TAB ──────────────────────────────────── */}
          {activeTab === 'earnings' && (
            <section className="ed-section">
              <div className="ed-workspace-hero">
                <div className="ed-workspace-copy">
                  <div className="ed-kicker">Revenue</div>
                  <h1 className="ed-workspace-title">Earnings & Payouts</h1>
                  <p className="ed-workspace-sub">Track growth, average ticket, and payout history in one view.</p>
                </div>
                <div className="ed-workspace-chips">
                  {[
                    { label: 'This month', value: fmtInr(totalThisMonth), color: '#34d399' },
                    { label: 'Total earned', value: fmtInr(totalEarnings), color: domainColor },
                    { label: 'Growth', value: `${earningsGrowth >= 0 ? '+' : ''}${earningsGrowth}%`, color: earningsGrowth >= 0 ? '#34d399' : '#fb7185' },
                  ].map(chip => (
                    <div key={chip.label} className="ed-workspace-chip" style={{ '--cc': chip.color }}>
                      <span className="ed-wc-label">{chip.label}</span>
                      <strong className="ed-wc-value">{chip.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ed-earnings-grid">
                {[
                  { label: 'This month', value: fmtInr(totalThisMonth), sub: `${earningsGrowth >= 0 ? '+' : ''}${earningsGrowth}% vs last`, color: '#34d399', positive: earningsGrowth >= 0 },
                  { label: 'Total earnings', value: fmtInr(totalEarnings), sub: 'All-time paid', color: domainColor },
                  { label: 'Avg per session', value: sessions.length ? fmtInr(Math.round(totalEarnings / sessions.length)) : '₹0', sub: `${sessions.length} sessions`, color: '#fbbf24' },
                  { label: 'Pending', value: fmtInr(payments.filter(p => ['pending', 'created'].includes(String(p.status || '').toLowerCase())).reduce((a, b) => a + toNum(b.amount), 0)), sub: 'Awaiting settlement', color: '#a78bfa' },
                ].map(({ label, value, sub, color, positive }) => (
                  <div key={label} className="ed-earning-card" style={{ '--ec': color }}>
                    <div className="ed-ec-label">{label}</div>
                    <div className="ed-ec-value" style={{ color }}>{value}</div>
                    <div className={`ed-ec-sub ${positive === false ? 'neg' : ''}`}>{sub}</div>
                  </div>
                ))}
              </div>

              <div className="ed-card ed-card--chart">
                <div className="ed-card-head">
                  <h3 className="ed-card-title">Monthly Earnings (6 months)</h3>
                  <span className="ed-badge-green">+{Math.max(earningsGrowth, 0)}% this month</span>
                </div>
                <EarningsChart data={earningsData} />
              </div>

              <div className="ed-card">
                <div className="ed-card-head">
                  <h3 className="ed-card-title">Recent Payouts</h3>
                </div>
                {paidPayments.length === 0 ? (
                  <div className="ed-empty-state"><span className="ed-empty-icon"><DollarSign size={28} /></span><p>No paid transactions yet.</p></div>
                ) : paidPayments.slice(0, 10).map((p) => (
                  <div key={p._id || `${p.clientEmail}-${p.createdAt}`} className="ed-payout-row">
                    <div className="ed-payout-av">{(p.clientName || p.clientEmail || 'C')[0].toUpperCase()}</div>
                    <div className="ed-payout-info">
                      <div className="ed-payout-name">{p.clientName || p.clientEmail}</div>
                      <div className="ed-payout-date">{formatRelative(p.createdAt)}</div>
                    </div>
                    <div className="ed-payout-amount">+{fmtInr(p.amount)}</div>
                    <span className="ed-payout-badge"><Check size={12} /> Credited</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── PROFILE TAB ───────────────────────────────────── */}
          {activeTab === 'profile' && (
            <section className="ed-section">
              <div className="ed-workspace-hero">
                <div className="ed-workspace-copy">
                  <div className="ed-kicker">Profile</div>
                  <h1 className="ed-workspace-title">Your Expert Presence</h1>
                  <p className="ed-workspace-sub">Review what clients see, update trust signals, and boost conversions.</p>
                </div>
                <div className="ed-workspace-chips">
                  {[
                    { label: 'Field', value: computedProfile.field || 'Expert', color: domainColor },
                    { label: 'Rate', value: fmtInr(computedProfile.price), color: '#fbbf24' },
                    { label: 'Rating', value: computedProfile.rating ? `${computedProfile.rating}/5` : 'None', color: '#34d399' },
                  ].map(chip => (
                    <div key={chip.label} className="ed-workspace-chip" style={{ '--cc': chip.color }}>
                      <span className="ed-wc-label">{chip.label}</span>
                      <strong className="ed-wc-value">{chip.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ed-profile-grid">
                {/* Preview card */}
                <div className="ed-card ed-profile-preview" style={{ '--pc': domainColor }}>
                  <span className="ed-preview-badge">Live Preview</span>
                  <div className="ed-preview-av" style={{ background: `linear-gradient(135deg, ${domainColor}, #06b6d4)` }}>
                    {avatarSrc ? <img src={avatarSrc} alt="" /> : usernameInitial}
                  </div>
                  <h3 className="ed-preview-name">{computedProfile.name}</h3>
                  <div className="ed-preview-field" style={{ color: domainColor }}>{computedProfile.field}</div>
                  <div className="ed-preview-stars">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={13} fill={i < Math.floor(computedProfile.rating || 0) ? '#fbbf24' : 'none'} color={i < Math.floor(computedProfile.rating || 0) ? '#fbbf24' : '#374151'} />
                    ))}
                    <span>{computedProfile.rating || 'No ratings'}</span>
                  </div>
                  <p className="ed-preview-headline">{computedProfile.headline || 'No headline yet.'}</p>
                  <p className="ed-preview-bio">{computedProfile.bio || 'No bio yet.'}</p>
                  <div className="ed-preview-price-row">
                    <span style={{ color: domainColor, fontFamily: 'DM Serif Display,serif', fontSize: '1.8rem' }}>{fmtInr(computedProfile.price)}</span>
                    <span style={{ color: 'var(--ed-muted)', fontSize: '12.5px' }}> / session</span>
                  </div>
                  <button type="button" disabled aria-label="Preview of client booking button" className="ed-preview-cta" style={{ background: `linear-gradient(135deg, ${domainColor}, #06b6d4)` }}>Pay & Talk</button>
                </div>

                <div className="ed-profile-side">
                  <div className="ed-card">
                    <div className="ed-card-head">
                      <h3 className="ed-card-title">Expert Details</h3>
                      <button className="ed-card-edit-btn" onClick={() => setEditModalOpen(true)}><Edit3 size={12} /> Edit</button>
                    </div>
                    {[
                      { icon: <Mail size={13} />, label: 'Email', value: computedProfile.email || '—' },
                      { icon: <MapPin size={13} />, label: 'Location', value: computedProfile.location || 'Not set' },
                      { icon: <Briefcase size={13} />, label: 'Field', value: computedProfile.field || '—' },
                      { icon: <Clock size={13} />, label: 'Experience', value: `${toNum(computedProfile.experience)} years` },
                      { icon: <DollarSign size={13} />, label: 'Session fee', value: fmtInr(computedProfile.price) },
                      { icon: <Star size={13} />, label: 'Rating', value: computedProfile.rating ? `${computedProfile.rating}/5 (${computedProfile.ratingsCount})` : 'No ratings' },
                    ].map(({ icon, label, value }) => (
                      <div key={label} className="ed-detail-row">
                        <span style={{ color: domainColor }}>{icon}</span>
                        <div>
                          <div className="ed-detail-label">{label}</div>
                          <div className="ed-detail-value">{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ed-card">
                    <div className="ed-card-head"><h3 className="ed-card-title">Profile Health</h3></div>
                    <div className="ed-health-list">
                      {[
                        { label: 'Headline set', done: Boolean(computedProfile.headline) },
                        { label: 'Bio written', done: Boolean(computedProfile.bio) },
                        { label: 'Session fee configured', done: Boolean(toNum(computedProfile.price)) },
                        { label: 'Experience listed', done: Boolean(toNum(computedProfile.experience)) },
                        { label: 'Domain listed', done: Boolean(computedProfile.field) },
                        { label: 'Location added', done: Boolean(computedProfile.location) },
                      ].map(({ label, done }) => (
                        <div key={label} className={`ed-health-row ${done ? 'done' : ''}`}>
                          {done ? <CheckCircle size={14} color="#34d399" /> : <XCircle size={14} color="#374151" />}
                          <span>{label}</span>
                          {done && <span className="ed-health-check">✓</span>}
                        </div>
                      ))}
                    </div>
                    <button className="ed-btn ed-btn-primary ed-btn-full" onClick={() => setEditModalOpen(true)}>
                      <Edit3 size={13} /> Complete Profile
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {editModalOpen && <EditProfileModal profile={computedProfile} onSave={handleSaveProfile} onClose={() => setEditModalOpen(false)} saving={savingProfile} />}

      {/* Image viewer */}
      {chatImageViewer.open && (
        <div className="ed-modal-overlay" onClick={() => setChatImageViewer({ open: false, src: '', alt: '' })}>
          <div className="ed-img-viewer" onClick={e => e.stopPropagation()}>
            <button className="ed-img-viewer-close" onClick={() => setChatImageViewer({ open: false, src: '', alt: '' })}>
              <X size={18} />
            </button>
            <img src={chatImageViewer.src} alt={chatImageViewer.alt} />
            <a href={chatImageViewer.src} download className="ed-img-download-btn">Download</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpertDashboard;
