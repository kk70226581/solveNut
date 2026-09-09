import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Phone, PhoneOff } from 'lucide-react';
import '../styles/GlobalCallNotifier.css';
import {
  getStoredIncomingCall,
  setStoredIncomingCall,
  subscribeToIncomingCallChanges,
} from '../utils/incomingCallStorage';

import { API } from '../utils/api';

export default function GlobalCallNotifier() {
  const navigate = useNavigate();
  const location = useLocation();
  const [incomingCall, setIncomingCall] = useState(() => getStoredIncomingCall());
  const conversationsRef = useRef([]);
  const socketRef = useRef(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const email = typeof window !== 'undefined' ? localStorage.getItem('email') : '';
  const role = typeof window !== 'undefined' ? String(localStorage.getItem('role') || '').toLowerCase() : '';
  const handledByCurrentPage = location.pathname === '/chat' || location.pathname === '/expert-dashboard';

  const setCall = useCallback((call) => {
    setIncomingCall(call);
    setStoredIncomingCall(call);
  }, []);

  useEffect(() => subscribeToIncomingCallChanges(setIncomingCall), []);

  useEffect(() => {
    if (!token || !email || !['client', 'expert'].includes(role)) return undefined;

    let cancelled = false;
    const joinKnownRooms = () => {
      if (!socketRef.current) return;
      conversationsRef.current.forEach((conversation) => {
        if (conversation?.room) {
          socketRef.current.emit('join-room', { room: conversation.room });
        }
      });
    };

    const loadConversations = async () => {
      try {
        const res = await fetch(`${API}/api/conversations?email=${encodeURIComponent(email)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (!cancelled) {
          conversationsRef.current = Array.isArray(data) ? data : [];
          joinKnownRooms();
        }
      } catch {
        if (!cancelled) conversationsRef.current = [];
      }
    };

    loadConversations();
    const refreshTimer = window.setInterval(loadConversations, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [token, email, role, location.pathname]);

  useEffect(() => {
    if (!token || !email || !['client', 'expert'].includes(role)) return undefined;

    const socket = io(API, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 12_000,
    });
    socketRef.current = socket;

    const joinKnownRooms = () => {
      conversationsRef.current.forEach((conversation) => {
        if (conversation?.room) {
          socket.emit('join-room', { room: conversation.room });
        }
      });
    };

    socket.on('connect', () => socket.emit('authenticate', { token }));
    socket.on('auth_success', joinKnownRooms);
    socket.on('offer', ({ room, offer, from, fromName, callType }) => {
      if (!room || !offer || String(from || '').toLowerCase() === String(email || '').toLowerCase()) return;
      const match = conversationsRef.current.find((conversation) => conversation.room === room);
      const normalizedCallType = String(callType || '').toLowerCase() === 'audio' ? 'audio' : 'video';
      const callerName = String(fromName || match?.otherName || from || 'Caller').trim();
      setCall({
        room,
        offer,
        from: from || 'Caller',
        fromName: callerName,
        callType: normalizedCallType,
        otherEmail: match?.otherEmail || from || '',
        at: Date.now(),
      });
      navigator.vibrate?.([180, 100, 180]);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification(`Incoming ${normalizedCallType} call`, {
          body: `${callerName} is calling you on Solvenut.`,
        });
      }
    });
    socket.on('call-ended', ({ room }) => {
      setIncomingCall((prev) => {
        const next = prev?.room === room ? null : prev;
        setStoredIncomingCall(next);
        return next;
      });
    });
    socket.on('call-declined', ({ room }) => {
      setIncomingCall((prev) => {
        const next = prev?.room === room ? null : prev;
        setStoredIncomingCall(next);
        return next;
      });
    });

    return () => {
      socketRef.current = null;
      try {
        socket.disconnect();
      } catch {
        // ignore disconnect failures
      }
    };
  }, [token, email, role, setCall]);

  const dismissCall = useCallback(() => {
    if (incomingCall?.room) {
      socketRef.current?.emit('call-declined', { room: incomingCall.room });
    }
    navigator.vibrate?.(0);
    setCall(null);
  }, [incomingCall, setCall]);

  const openCall = useCallback(() => {
    if (!incomingCall) return;
    if (role === 'expert') {
      navigate('/expert-dashboard', { state: { openIncomingCall: true } });
      return;
    }

    const targetEmail = incomingCall.otherEmail || incomingCall.from || '';
    navigate(`/chat?email=${encodeURIComponent(targetEmail)}`, {
      state: { expertEmail: targetEmail, openIncomingCall: true },
    });
  }, [incomingCall, navigate, role]);

  useEffect(() => {
    if (!incomingCall?.at) return undefined;
    const remaining = Math.max(0, 60_000 - (Date.now() - Number(incomingCall.at)));
    const timer = window.setTimeout(() => setCall(null), remaining);
    return () => window.clearTimeout(timer);
  }, [incomingCall, setCall]);

  useEffect(() => {
    if (!incomingCall || handledByCurrentPage) return undefined;
    const previousTitle = document.title;
    const callerName = incomingCall.fromName || incomingCall.from || 'Participant';
    let highlighted = true;
    document.title = `Incoming call from ${callerName}`;
    const titleTimer = window.setInterval(() => {
      highlighted = !highlighted;
      document.title = highlighted ? `Incoming call from ${callerName}` : previousTitle;
    }, 1000);
    return () => {
      window.clearInterval(titleTimer);
      document.title = previousTitle;
      navigator.vibrate?.(0);
    };
  }, [handledByCurrentPage, incomingCall]);

  if (handledByCurrentPage || !incomingCall || !token || !email || !['client', 'expert'].includes(role)) return null;

  const callerName = incomingCall.fromName || incomingCall.from || 'Participant';
  const callerDetail = incomingCall.otherEmail && incomingCall.otherEmail !== callerName
    ? incomingCall.otherEmail
    : 'Private consultation';

  return (
    <div className="gcn-popup" role="dialog" aria-live="assertive" aria-label="Incoming call">
      <div className="gcn-call-row">
        <div className="gcn-call-icon"><Phone size={21} /></div>
        <div className="gcn-call-copy">
          <div className="gcn-kicker">Incoming {incomingCall.callType === 'audio' ? 'Audio' : 'Video'} Call</div>
          <div className="gcn-title">{callerName}</div>
          <div className="gcn-subtitle">{callerDetail}</div>
        </div>
      </div>
      <div className="gcn-actions">
        <button type="button" className="gcn-btn gcn-btn-primary" onClick={openCall}>
          <Phone size={15} />
          Open
        </button>
        <button type="button" className="gcn-btn gcn-btn-ghost" onClick={dismissCall}>
          <PhoneOff size={15} />
          Dismiss
        </button>
      </div>
    </div>
  );
}
