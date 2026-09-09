import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import VideoCall from '../components/VideoCall';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Expand,
  LoaderCircle,
  Mail,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Star,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import '../styles/ClientChat.css';
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

const ClientChat = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const expertEmailFromQuery = searchParams.get('email');
  const locationState = location.state || {};
  const expertEmail = locationState.expertEmail || expertEmailFromQuery;

  const clientEmail =
    typeof window !== 'undefined' ? localStorage.getItem('email') : null;
  const clientName =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('name') ||
        localStorage.getItem('username') ||
        (clientEmail ? clientEmail.split('@')[0] : 'User'))) ||
    'User';
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [expert, setExpert] = useState({
    name: 'Expert',
    field: 'General expert',
    experience: 0,
    email: '---',
    avatar: '',
    avgRating: 0,
    ratingsCount: 0,
  });

  const [roomId, setRoomId] = useState(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const [incomingCall, setIncomingCall] = useState(() => getStoredIncomingCall());
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState('');
  const [selectedImageName, setSelectedImageName] = useState('');
  const [selectedAttachmentMime, setSelectedAttachmentMime] = useState('');
  const [typingVisible, setTypingVisible] = useState(false);
  const [expertOnline, setExpertOnline] = useState(false);
  const [toast, setToast] = useState({ visible: false, text: '', error: false });
  const [imageViewer, setImageViewer] = useState({ open: false, src: '', alt: '' });
  const [myRating, setMyRating] = useState(0);
  const [myReview, setMyReview] = useState('');
  const [savingRating, setSavingRating] = useState(false);
  const [mobilePane, setMobilePane] = useState('chat');
  const [isExpertPanelCollapsed, setIsExpertPanelCollapsed] = useState(false);
  const [callOverlayOpen, setCallOverlayOpen] = useState(false);
  const [chatAccess, setChatAccess] = useState({
    checking: true,
    allowed: false,
    reason: '',
    accessUntil: '',
    hoursLeft: 0,
  });

  const displayedMessageIdsRef = useRef(new Set());
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const chatMessagesRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const chatComposerRef = useRef(null);
  const swipeStartRef = useRef({ x: 0, y: 0, pane: 'chat' });

  useEffect(() => {
    if (!token || !clientEmail) {
      window.alert('Please login to chat with an expert');
      navigate('/login', { replace: true });
    }
  }, [token, clientEmail, navigate]);

  useEffect(() => subscribeToIncomingCallChanges(setIncomingCall), []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
    clearStoredIncomingCall();
  }, []);

  const handleCallStateChange = useCallback(({ active, error }) => {
    setCallOverlayOpen(Boolean(active));
    if (error) {
      setToast({
        visible: true,
        text: error,
        error: !['Call ended', 'Call declined', 'No answer'].includes(error),
      });
      window.setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }));
      }, 3200);
    }
  }, []);

  useEffect(() => {
    if (!callOverlayOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [callOverlayOpen]);

  useEffect(() => {
    const syncMobileExpertPanel = () => {
      if (window.innerWidth <= 860) {
        setIsExpertPanelCollapsed(false);
      }
    };

    syncMobileExpertPanel();
    window.addEventListener('resize', syncMobileExpertPanel);
    return () => {
      window.removeEventListener('resize', syncMobileExpertPanel);
    };
  }, []);

  useEffect(() => {
    // Swipe gesture handlers for mobile pane switching
    const onTouchStart = event => {
      if (window.innerWidth > 860) return; // No swipe on desktop
      const touch = event.touches?.[0];
      if (!touch) return;
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY, pane: mobilePane };
    };

    const onTouchEnd = event => {
      if (window.innerWidth > 860) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;

      const deltaX = touch.clientX - swipeStartRef.current.x;
      const deltaY = touch.clientY - swipeStartRef.current.y;
      
      // Only detect horizontal swipes (ignore vertical scrolling)
      if (Math.abs(deltaY) > Math.abs(deltaX)) return;
      
      // Require minimum swipe distance
      const minSwipeDist = 50;
      if (Math.abs(deltaX) < minSwipeDist) return;

      const panes = ['chat', 'expert'];
      const currentIdx = panes.indexOf(swipeStartRef.current.pane);
      
      if (deltaX > 0 && currentIdx > 0) {
        // Swipe right - go to previous pane
        setMobilePane(panes[currentIdx - 1]);
      } else if (deltaX < 0 && currentIdx < panes.length - 1) {
        // Swipe left - go to next pane
        setMobilePane(panes[currentIdx + 1]);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [mobilePane]);

  const escapeHtml = text => {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  };

  const formatTime = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessageContent = msg => {
    const { attachmentType, attachmentUrl, attachmentName, attachmentMime } = getChatMessageAttachment(msg);
    const messageBody = msg.message ? (
      <div
        className="message-body"
        dangerouslySetInnerHTML={{
          __html: escapeHtml(msg.message || ''),
        }}
      />
    ) : null;

    if (attachmentType === 'image' && attachmentUrl) {
      return (
        <div className="chat-image-wrap">
          <img
            src={attachmentUrl}
            alt={attachmentName || 'Chat image'}
            className="chat-message-image"
            onClick={() =>
              setImageViewer({
                open: true,
                src: attachmentUrl,
                alt: attachmentName || 'Chat image',
              })
            }
          />
          {messageBody}
        </div>
      );
    }

    if (attachmentType === 'audio' && attachmentUrl) {
      return (
        <div className="chat-attachment-wrap">
          <div className="chat-attachment-card">
            <div className="chat-attachment-head">
              <span className="chat-attachment-badge">Audio</span>
              <span className="chat-attachment-name">{attachmentName || 'Audio attachment'}</span>
            </div>
            <audio className="chat-message-audio" controls preload="metadata">
              <source src={attachmentUrl} type={attachmentMime || undefined} />
            </audio>
          </div>
          {messageBody}
        </div>
      );
    }

    if (attachmentType && attachmentUrl) {
      return (
        <div className="chat-attachment-wrap">
          <a
            className="chat-attachment-card"
            href={attachmentUrl}
            download={attachmentName || undefined}
            target="_blank"
            rel="noreferrer"
          >
            <div className="chat-attachment-head">
              <span className="chat-attachment-badge">{attachmentType === 'pdf' ? 'PDF' : 'File'}</span>
              <span className="chat-attachment-name">{attachmentName || 'Attachment'}</span>
            </div>
            <span className="chat-attachment-link">Open or download</span>
          </a>
          {messageBody}
        </div>
      );
    }

    return (
      <div
        className="message-body"
        dangerouslySetInnerHTML={{
          __html: escapeHtml(msg.message || ''),
        }}
      />
    );
  };

  const formatAccessTime = ts => {
    if (!ts) return 'Flexible access';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Flexible access';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const scrollToBottom = () => {
    const container = chatMessagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  const showToast = (msg, isError = false) => {
    setToast({ visible: true, text: msg, error: isError });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2600);
  };

  const buildAvatarUrl = avatarPath => {
    if (!avatarPath) return null;
    if (avatarPath.startsWith('data:') || avatarPath.startsWith('blob:')) {
      return avatarPath;
    }
    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
      return avatarPath;
    }
    return `${API}/${avatarPath.replace(/^\/+/, '')}`;
  };

  const loadExpert = useCallback(async () => {
    if (!expertEmail) {
      window.alert('No expert selected');
      navigate('/experts', { replace: true });
      return;
    }
    try {
      const res = await fetch(
        `${API}/api/profile?email=${encodeURIComponent(expertEmail)}`,
      );
      if (!res.ok) throw new Error('profile_fetch_failed');
      const data = await res.json();

      setExpert({
        name: data.name || 'Expert',
        field: data.field || 'General expert',
        experience: data.experience || 0,
        email: data.email || '---',
        avatar: data.avatar || '',
        avgRating: Number(data.avgRating || 0),
        ratingsCount: Number(data.ratingsCount || 0),
      });
    } catch (err) {
      console.error('Error loading expert', err);
      window.alert('Failed to load expert details');
      navigate('/experts', { replace: true });
    }
  }, [expertEmail, navigate]);

  const loadMyRating = useCallback(async () => {
    if (!token || !expertEmail) return;
    try {
      const res = await fetch(
        `${API}/api/ratings/my?expertEmail=${encodeURIComponent(expertEmail)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      const r = data?.rating;
      if (r) {
        setMyRating(Number(r.score || 0));
        setMyReview(String(r.review || ''));
      }
    } catch {
      // ignore
    }
  }, [expertEmail, token]);

  const loadChatAccess = useCallback(async () => {
    if (!token || !expertEmail) return;
    setChatAccess(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch(
        `${API}/api/check-payment?expertEmail=${encodeURIComponent(expertEmail)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to verify access');
      setChatAccess({
        checking: false,
        allowed: Boolean(data?.hasAccess),
        reason: String(data?.reason || ''),
        accessUntil: String(data?.accessUntil || ''),
        hoursLeft: Number(data?.hoursLeft || 0),
      });
    } catch {
      setChatAccess({
        checking: false,
        allowed: false,
        reason: 'verification_failed',
        accessUntil: '',
        hoursLeft: 0,
      });
    }
  }, [expertEmail, token]);

  const loadChatHistory = useCallback(async rid => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API}/api/messages?room=${encodeURIComponent(rid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('history_fetch_failed');
      const msgs = await res.json();
      const setIds = new Set();
      (msgs || []).forEach(m => {
        const id =
          (m._id || '') + '|' + (m.createdAt || '') + '|' + (m.message || '') + '|' + (m.attachmentUrl || m.imageUrl || '');
        if (id) setIds.add(id);
      });
      displayedMessageIdsRef.current = setIds;
      setMessages(msgs || []);
    } catch (err) {
      console.error('Error loading history', err);
      setMessages([
        {
          author: 'system',
          message:
            'Could not load previous messages. You can still start a new chat below.',
          createdAt: new Date().toISOString(),
          _id: 'system-load-failed',
          isError: true,
        },
      ]);
    } finally {
      setLoadingMessages(false);
      setTimeout(scrollToBottom, 50);
    }
  }, [token]);

  useEffect(() => {
    if (!expertEmail || !clientEmail) return;
    if (!API) return;

    const rid = [clientEmail, expertEmail]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('_');
    setRoomId(rid);

    const s = io(API, {
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 12_000,
    });

    s.on('connect', () => {
      if (token) {
        s.emit('authenticate', { token });
      }
    });

    s.on('auth_success', () => {
      s.emit('join_private', rid);
    });

    s.on('receive_message', data => {
      if (data.author === clientEmail) {
        if (data.clientMessageId) {
          setMessages((prev) => prev.map((item) => (
            item.clientMessageId === data.clientMessageId ? { ...data, status: 'sent' } : item
          )));
        }
        return;
      }

      const id =
        (data._id || '') +
        '|' +
        (data.createdAt || '') +
        '|' +
        (data.message || '') +
        '|' +
        (data.attachmentUrl || data.imageUrl || '');
      if (id && displayedMessageIdsRef.current.has(id)) return;
      if (id) displayedMessageIdsRef.current.add(id);

      setMessages(prev => [...prev, data]);
      setTimeout(scrollToBottom, 20);
    });

    s.on('typing', data => {
      if (data.room !== rid || data.user === String(clientEmail || '').toLowerCase()) return;
      setTypingVisible(Boolean(data.isTyping));
    });

    s.on('message_failed', ({ clientMessageId, message }) => {
      if (clientMessageId) {
        setMessages((prev) => prev.map((item) => (
          item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item
        )));
      }
      showToast(message || 'Message failed to send', true);
    });

    s.on('online_users', users => {
      const normalizedExpertEmail = String(expertEmail || '').toLowerCase();
      if (!normalizedExpertEmail) return;
      setExpertOnline(Boolean(users?.[normalizedExpertEmail]?.socketId));
    });

    s.on('user_online', ({ email: userEmail, online }) => {
      const normalizedExpertEmail = String(expertEmail || '').toLowerCase();
      if (String(userEmail || '').toLowerCase() !== normalizedExpertEmail) return;
      setExpertOnline(Boolean(online));
    });

    s.on('connect_error', err => {
      console.error('Socket error', err);
      showToast('Socket connection issue', true);
    });

    s.on('disconnect', () => {
      console.log('Socket disconnected');
      setExpertOnline(false);
    });

    setSocketInstance(s);
    loadChatHistory(rid);

    return () => {
      setSocketInstance(null);
      s.disconnect();
    };
  }, [expertEmail, clientEmail, clientName, loadChatHistory, token]);

  const handleSend = () => {
    if (!socketInstance || !roomId) return;
    if (!socketInstance.connected) {
      showToast('Reconnecting. Your draft is safe; send it when the connection returns.', true);
      return;
    }
    if (!chatAccess.allowed) {
      showToast(
        chatAccess.reason === 'window_expired'
          ? '24-hour chat window expired. Please pay again.'
          : 'Chat is locked. Payment required.',
        true,
      );
      return;
    }
    const trimmed = inputValue.trim();
    const attachmentPayload = getChatAttachmentPayload({
      dataUrl: selectedImageDataUrl,
      name: selectedImageName,
      mime: selectedAttachmentMime,
    });
    const hasAttachment = Boolean(attachmentPayload.attachmentUrl);
    if (!trimmed && !hasAttachment) return;

    const localMsg = {
      _id: `local-${Date.now()}`,
      clientMessageId: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: clientEmail,
      message: trimmed,
      createdAt: new Date().toISOString(),
      status: 'sending',
      ...attachmentPayload,
    };

    setMessages(prev => [...prev, localMsg]);
    setTimeout(scrollToBottom, 20);

    socketInstance.emit('send_private_message', {
      room: roomId,
      author: clientEmail,
      authorRole: 'client',
      clientMessageId: localMsg.clientMessageId,
      message: trimmed,
      ...attachmentPayload,
    });
    socketInstance.emit('stop_typing', { room: roomId });

    setInputValue('');
    setSelectedImageDataUrl('');
    setSelectedImageName('');
    setSelectedAttachmentMime('');
    if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    if (chatComposerRef.current) {
      chatComposerRef.current.style.height = 'auto';
    }
  };

  const handlePickAttachment = async ev => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const error = validateChatAttachmentFile(file);
    if (error) {
      showToast(error, true);
      ev.target.value = '';
      return;
    }
    try {
      const out = await readFileAsDataUrl(file);
      setSelectedImageDataUrl(out);
      setSelectedImageName(file.name || 'attachment');
      setSelectedAttachmentMime(file.type || '');
    } catch {
      showToast('Could not read the selected file.', true);
      ev.target.value = '';
    }
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = () => {
    if (!socketInstance || !roomId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketInstance.emit('typing', {
        room: roomId,
        isTyping: true,
      });
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketInstance.emit('stop_typing', { room: roomId });
    }, 900);
  };

  useEffect(() => {
    loadExpert();
  }, [loadExpert]);

  useEffect(() => {
    loadMyRating();
  }, [loadMyRating]);

  useEffect(() => {
    loadChatAccess();
  }, [loadChatAccess]);

  useEffect(() => {
    if (!socketInstance) return;
    const onDenied = data => {
      if (data?.clientMessageId) {
        setMessages((prev) => prev.map((item) => (
          item.clientMessageId === data.clientMessageId ? { ...item, status: 'failed' } : item
        )));
      }
      setChatAccess(prev => ({
        ...prev,
        allowed: false,
        reason: String(data?.reason || 'access_denied'),
      }));
      showToast(String(data?.message || 'Chat access denied'), true);
    };
    socketInstance.on('chat_access_denied', onDenied);
    return () => {
      socketInstance.off('chat_access_denied', onDenied);
    };
  }, [socketInstance]);

  const submitRating = async () => {
    if (!token || !expertEmail) return;
    if (!myRating || myRating < 1 || myRating > 5) {
      showToast('Please select a rating from 1 to 5 stars', true);
      return;
    }
    setSavingRating(true);
    try {
      const res = await fetch(`${API}/api/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expertEmail,
          score: myRating,
          review: myReview.trim(),
          room: roomId || '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || 'Failed to save rating');
      showToast('Rating submitted successfully');
      await loadExpert();
    } catch (err) {
      showToast(err.message || 'Could not submit rating', true);
    } finally {
      setSavingRating(false);
    }
  };

  const avatarInitial = (expert.name || 'E').trim()[0]?.toUpperCase() || 'E';
  const expertAvatarSrc = buildAvatarUrl(expert.avatar);
  const accessStatus = chatAccess.allowed
    ? 'Private room active'
    : chatAccess.reason === 'window_expired'
      ? 'Chat window expired'
      : 'Payment required to chat';
  const conversationStatus = `${expertOnline ? 'Online now' : 'Offline'} · ${accessStatus}`;

  return (
    <div className="client-chat-page">
      {toast.visible && (
        <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>
          {toast.text}
        </div>
      )}

      <header className="chat-topbar">
        <div className="shell header-inner">
          <div className="brand-row" onClick={() => navigate('/experts')}>
            <div>
              <div className="brand-text">
                Solve<span>nut</span>
              </div>
              <div className="brand-subtext">
                Private guidance room with a verified expert
              </div>
            </div>
          </div>

          <div className="header-meta">
            <div className="pill secure-pill">
              <span className="dot" />
              <span>Encrypted session</span>
            </div>
            <div className="pill subtle-pill">
              <Clock3 size={14} aria-hidden="true" />
              <span>{chatAccess.allowed && chatAccess.hoursLeft ? `${chatAccess.hoursLeft}h left` : 'Live support'}</span>
            </div>
          </div>

          <div className="header-actions">
            <div className="user-tag">
              <div className="user-avatar-small">
                {clientName[0]?.toUpperCase() || 'U'}
              </div>
              <div className="user-tag-copy">
                <span className="user-tag-label">Client</span>
                <span className="user-tag-name">{clientName}</span>
              </div>
            </div>
            <button className="back-btn" onClick={() => navigate('/experts')}>
              <ArrowLeft size={16} aria-hidden="true" />
              Experts
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="shell">
          <div className="mobile-pane-switcher" aria-label="Mobile sections">
            <button
              type="button"
              className={`mobile-pane-btn ${mobilePane === 'chat' ? 'active' : ''}`}
              onClick={() => setMobilePane('chat')}
            >
              <MessageCircle size={16} aria-hidden="true" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              className={`mobile-pane-btn ${mobilePane === 'expert' ? 'active' : ''}`}
              onClick={() => setMobilePane('expert')}
            >
              <UserRound size={16} aria-hidden="true" />
              <span>Expert</span>
            </button>
          </div>
          <div className={`chat-layout mobile-pane-${mobilePane}`}>
            <aside className={`expert-card ${isExpertPanelCollapsed ? 'expert-card-collapsed' : ''}`}>
              <div className="expert-card-head">
                <div className="expert-card-kicker">About Expert</div>
                <div className="expert-card-head-actions">
                  <div className="expert-card-window">
                    {chatAccess.allowed ? formatAccessTime(chatAccess.accessUntil) : 'Locked'}
                  </div>
                  <button
                    type="button"
                    className="expert-card-collapse-btn"
                    onClick={() => setIsExpertPanelCollapsed(!isExpertPanelCollapsed)}
                    aria-label={isExpertPanelCollapsed ? 'Expand expert panel' : 'Collapse expert panel'}
                    title={isExpertPanelCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {isExpertPanelCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  </button>
                </div>
              </div>
              <div className="expert-card-top">
                <button
                  type="button"
                  className="expert-avatar-wrap"
                  onClick={() => {
                    if (!expertAvatarSrc) return;
                    setImageViewer({
                      open: true,
                      src: expertAvatarSrc,
                      alt: expert.name || 'Expert',
                    });
                  }}
                  aria-label={expertAvatarSrc ? 'View expert photo' : 'Expert avatar'}
                >
                  {expertAvatarSrc ? (
                    <img
                      src={expertAvatarSrc}
                      alt={expert.name || 'Expert'}
                      className="expert-avatar"
                      onError={e => {
                        e.target.style.display = 'none';
                        const sibling = e.target.nextElementSibling;
                        if (sibling) sibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="avatar-fallback"
                    style={{ display: expertAvatarSrc ? 'none' : 'flex' }}
                  >
                    {avatarInitial}
                  </div>
                  {expertAvatarSrc ? (
                    <span className="expert-avatar-hint">
                      <Expand size={13} aria-hidden="true" />
                      View photo
                    </span>
                  ) : null}
                </button>

                <div className="expert-badge-row">
                  <span className="expert-badge primary">Verified expert</span>
                  <span className={`expert-badge ${expertOnline ? 'online' : 'offline'}`}>
                    {expertOnline ? 'Online now' : 'Offline'}
                  </span>
                  <span className="expert-badge neutral">{expert.experience || 0}+ yrs</span>
                </div>
                <div className="expert-name">{expert.name}</div>
                <div className="expert-field">{expert.field || 'Expert'}</div>
                <div className="expert-rating-line">
                  <Star size={15} fill="currentColor" aria-hidden="true" />
                  <span>{expert.avgRating ? expert.avgRating.toFixed(1) : 'New'} ({expert.ratingsCount || 0})</span>
                </div>
              </div>

              <div className="rate-box">
                <div className="rate-box-head">
                  <strong>Rate this expert</strong>
                  <span>Help improve future matching</span>
                </div>
                <div className="rate-stars">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`rate-star-btn ${v <= myRating ? 'active' : ''}`}
                      onClick={() => setMyRating(v)}
                      aria-label={`Rate ${v} star`}
                    >
                      <Star size={17} fill="currentColor" aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <textarea
                  className="rate-review"
                  rows={3}
                  maxLength={500}
                  placeholder="Share a quick review if you want..."
                  value={myReview}
                  onChange={e => setMyReview(e.target.value)}
                />
                <button className="rate-submit" type="button" onClick={submitRating} disabled={savingRating}>
                  {savingRating ? 'Saving...' : 'Submit rating'}
                </button>
              </div>

              <div className="expert-info">
                <div className="info-row">
                  <BriefcaseBusiness size={16} aria-hidden="true" />
                  <span>{expert.experience}+ years experience</span>
                </div>
                <div className="info-row">
                  <Mail size={16} aria-hidden="true" />
                  <span className="expert-email">{expert.email}</span>
                </div>
                <div className="info-row">
                  <BadgeCheck size={16} aria-hidden="true" />
                  <span>Matched for private structured guidance</span>
                </div>
              </div>
            </aside>

            <section className="chat-section">
              <div className="chat-box">
                <div className="chat-top-stack">
                  <div className="chat-thread-head">
                    <div className="chat-thread-person">
                      <div className="chat-thread-avatar">{avatarInitial}</div>
                      <div className="chat-thread-copy">
                        <strong>{typingVisible ? 'Expert is typing...' : expert.name || 'Expert'}</strong>
                        <span>{conversationStatus}</span>
                      </div>
                    </div>
                    <div className="chat-thread-actions">
                      <div className={`chat-call-launcher ${callOverlayOpen ? 'is-open' : ''}`}>
                        <VideoCall
                          socket={socketInstance}
                          roomId={roomId}
                          currentUserEmail={clientEmail}
                          currentUserName={clientName}
                          peerLabel={expert.name || 'Expert'}
                          enabled={chatAccess.allowed}
                          compact
                          externalIncomingCall={incomingCall}
                          onIncomingCallCleared={clearIncomingCall}
                          onCallStateChange={handleCallStateChange}
                        />
                      </div>
                      <span className={`chat-thread-badge ${chatAccess.allowed ? 'open' : 'locked'}`}>
                        {chatAccess.allowed ? 'Open room' : 'Locked'}
                      </span>
                      <button type="button" className="chat-jump-btn" onClick={scrollToBottom}>
                        Latest
                      </button>
                    </div>
                  </div>
                </div>
                <div className="chat-messages" role="log" aria-label="Conversation" ref={chatMessagesRef}>
                  {loadingMessages ? (
                    <div className="loading-messages">
                      <LoaderCircle className="cc-spin" size={18} aria-hidden="true" />
                      Loading previous messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="empty-state">
                      <MessageCircle size={26} aria-hidden="true" />
                      <h4>Start the conversation</h4>
                      <p>Send your first message to this expert.</p>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => {
                        if (msg.author === 'system') {
                          return (
                            <div key={msg._id || idx} className="empty-state">
                              <TriangleAlert size={26} aria-hidden="true" />
                              <h4>Could not load messages</h4>
                              <p>You can still start a new chat below.</p>
                            </div>
                          );
                        }

                        const isMe = msg.author === clientEmail;
                        const senderName = isMe ? 'You' : expert.name || 'Expert';

                        return (
                          <div
                            key={msg._id || idx}
                            className={`message-row ${isMe ? 'me' : 'other'}`}
                          >
                            <div className="message-avatar">
                              {isMe ? (clientName[0]?.toUpperCase() || 'Y') : avatarInitial}
                            </div>
                            <div className={`message ${isMe ? 'me' : 'other'} ${msg.status === 'failed' ? 'failed' : ''}`}>
                              <div className="message-meta">
                                <div className="message-sender">{senderName}</div>
                                <div className="message-time">{formatTime(msg.createdAt)}</div>
                              </div>
                              {renderMessageContent(msg)}
                              {isMe && msg.status && (
                                <div className={`message-delivery ${msg.status}`}>
                                  {msg.status === 'sending' ? 'Sending…' : msg.status === 'failed' ? 'Not sent' : 'Sent'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {typingVisible && (
                        <div className="typing-indicator">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <span>Expert is typing...</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="chat-input-area">
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    accept={CHAT_ATTACHMENT_ACCEPT}
                    className="chat-file-input"
                    onChange={handlePickAttachment}
                  />

                  {selectedImageDataUrl ? (
                    <div className="chat-image-preview">
                      {getChatAttachmentType({
                        mime: selectedAttachmentMime,
                        name: selectedImageName,
                        attachmentUrl: selectedImageDataUrl,
                      }) === 'image' ? (
                        <img src={selectedImageDataUrl} alt={selectedImageName || 'Attachment'} />
                      ) : (
                        <div className="chat-attachment-thumb">
                          {getChatAttachmentType({
                            mime: selectedAttachmentMime,
                            name: selectedImageName,
                            attachmentUrl: selectedImageDataUrl,
                          }) === 'audio' ? 'AUDIO' : getChatAttachmentType({
                            mime: selectedAttachmentMime,
                            name: selectedImageName,
                            attachmentUrl: selectedImageDataUrl,
                          }) === 'pdf' ? 'PDF' : 'FILE'}
                        </div>
                      )}
                      <span>{selectedImageName || 'attachment'}</span>
                      <button
                        className="chat-image-remove"
                        type="button"
                        onClick={() => {
                          setSelectedImageDataUrl('');
                          setSelectedImageName('');
                          setSelectedAttachmentMime('');
                          if (chatFileInputRef.current) chatFileInputRef.current.value = '';
                        }}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}

                  <div className="composer-row">
                    <button
                      className="attach-btn"
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                    >
                      <Paperclip size={17} aria-hidden="true" />
                      <span>Attach</span>
                    </button>
                    <textarea
                      ref={chatComposerRef}
                      rows={1}
                      aria-label="Message to expert"
                      placeholder="Type your message..."
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onInput={e => {
                        handleTyping();
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                      }}
                    />
                    <button
                      className="send-btn"
                      onClick={handleSend}
                      disabled={(!inputValue.trim() && !selectedImageDataUrl) || !chatAccess.allowed}
                    >
                      <Send size={17} aria-hidden="true" />
                      <span>Send</span>
                    </button>
                  </div>
                  <div className="composer-note">
                    Press `Enter` to send. Use one message for one question or update.
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="chat-footer">
        <div className="footer-row">
          <span>(c) 2026 Solvenut. Guided conversations for real-world decisions.</span>
          <span>
            <ShieldCheck size={15} style={{ marginRight: 6, color: 'var(--success)' }} aria-hidden="true" />
            Private room between you and your expert.
          </span>
        </div>
      </footer>

      {imageViewer.open ? (
        <div
          className="image-viewer-overlay"
          onClick={() => setImageViewer({ open: false, src: '', alt: '' })}
        >
          <div className="image-viewer-dialog" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="image-viewer-close"
              onClick={() => setImageViewer({ open: false, src: '', alt: '' })}
              aria-label="Close image viewer"
            >
              <X size={17} aria-hidden="true" />
            </button>
            <img
              src={imageViewer.src}
              alt={imageViewer.alt}
              className="image-viewer-image"
            />
            <div className="image-viewer-caption">
              <strong>{expert.name || 'Expert'}</strong>
              <span>{expert.field || 'Verified expert'}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ClientChat;
