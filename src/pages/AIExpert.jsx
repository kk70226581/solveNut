import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, BriefcaseBusiness, CheckCircle2, GraduationCap, HeartPulse, LineChart, Loader2, Send, Sparkles, TerminalSquare, TrendingUp, UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../styles/AIExpert.css';

import { API } from '../utils/api';

const DOMAINS = [
  { id: 'career', label: 'Career', icon: BriefcaseBusiness },
  { id: 'business', label: 'Business', icon: TrendingUp },
  { id: 'finance', label: 'Finance', icon: LineChart },
  { id: 'programming', label: 'Programming', icon: TerminalSquare },
  { id: 'devops', label: 'DevOps', icon: Sparkles },
  { id: 'academics', label: 'Academics', icon: GraduationCap },
  { id: 'medical guidance', label: 'Medical Guidance', icon: HeartPulse },
  { id: 'personal growth', label: 'Personal Growth', icon: CheckCircle2 },
];

const FEEDBACK = [
  { id: 'helped', label: 'Yes, this helped' },
  { id: 'partial', label: 'Partially helped' },
  { id: 'not_helped', label: 'No, I need more help' },
];

const ESCALATION_COPY = {
  low_confidence: 'This needs deeper judgment than the AI can provide confidently.',
  ai_recommendation: 'The AI recommends a verified expert for a more complete answer.',
  human_requested: 'You asked to speak with a person. We can match you with a verified expert.',
  high_stakes: 'This topic benefits from careful review by a qualified human expert.',
  service_unavailable: 'The AI is temporarily unavailable, so a verified expert can take over.',
  feedback: 'A verified expert can review the context and guide your next steps in detail.',
};

function getEscalationCopy(reason) {
  return ESCALATION_COPY[reason] || ESCALATION_COPY.low_confidence;
}

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatAssistantText(text) {
  return String(text || '')
    .split('\n')
    .map((line, index) => {
      // Bold text
      let processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      processedLine = processedLine.replace(/__(.*?)__/g, '<strong>$1</strong>');

      // Italic text
      processedLine = processedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');
      processedLine = processedLine.replace(/_(.*?)_/g, '<em>$1</em>');

      // List items - add indentation and styling
      if (line.trim().match(/^[\d]+\.|^[-*]/)) {
        return (
          <div key={`${line}-${index}`} style={{ marginLeft: '1.5rem', marginBottom: '0.25rem' }}>
            <span dangerouslySetInnerHTML={{ __html: processedLine }} />
          </div>
        );
      }

      // Headers
      if (line.startsWith('###')) {
        return (
          <h4 key={`${line}-${index}`} style={{ fontWeight: '600', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
            {line.replace(/^#+\s/, '')}
          </h4>
        );
      }
      if (line.startsWith('##')) {
        return (
          <h3 key={`${line}-${index}`} style={{ fontWeight: '600', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            {line.replace(/^#+\s/, '')}
          </h3>
        );
      }
      if (line.startsWith('#')) {
        return (
          <h2 key={`${line}-${index}`} style={{ fontWeight: '700', marginTop: '1rem', marginBottom: '0.75rem' }}>
            {line.replace(/^#+\s/, '')}
          </h2>
        );
      }

      // Regular line with formatting
      if (line.trim()) {
        return (
          <div key={`${line}-${index}`} style={{ marginBottom: '0.25rem' }}>
            <span dangerouslySetInnerHTML={{ __html: processedLine }} />
          </div>
        );
      }

      // Empty line - add spacing
      return <div key={`${line}-${index}`} style={{ marginBottom: '0.5rem' }} />;
    });
}

const AIExpert = () => {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const [selectedDomain, setSelectedDomain] = useState('career');
  const [problem, setProblem] = useState('');
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [escalation, setEscalation] = useState(null);
  const [error, setError] = useState('');

  const selectedDomainInfo = useMemo(
    () => DOMAINS.find((domain) => domain.id === selectedDomain) || DOMAINS[0],
    [selectedDomain]
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 40);
  }, []);

  const requireLogin = useCallback(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return false;
    }
    return true;
  }, [navigate]);

  const appendMessage = useCallback((message) => {
    setMessages((current) => [...current, message]);
    scrollToBottom();
  }, [scrollToBottom]);

  const updateStreamingMessage = useCallback((id, updater) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, ...updater(message) } : message))
    );
    scrollToBottom();
  }, [scrollToBottom]);

  const startConversation = useCallback(async () => {
    if (!requireLogin()) return null;
    const res = await fetch(`${API}/api/ai/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ domain: selectedDomain }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Unable to start AI Expert consultation.');
    }
    setConversationId(data.conversation._id);
    return data.conversation._id;
  }, [requireLogin, selectedDomain]);

  const sendMessage = useCallback(async (text, existingConversationId = conversationId) => {
    const cleanText = String(text || '').trim();
    if (!cleanText || isStreaming) return;
    if (!requireLogin()) return;

    setError('');
    setEscalation(null);
    const activeConversationId = existingConversationId || await startConversation();
    if (!activeConversationId) return;

    const assistantId = `assistant-${Date.now()}`;
    appendMessage({ id: `user-${Date.now()}`, role: 'user', content: cleanText });
    appendMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      confidenceScore: null,
      recommendEscalation: false,
    });
    setIsStreaming(true);

    try {
      const res = await fetch(`${API}/api/ai/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: cleanText,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AI Expert did not respond.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvent of events) {
          const eventLine = rawEvent.split('\n').find((line) => line.startsWith('event:'));
          const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
          const event = eventLine?.replace('event:', '').trim();
          const payload = dataLine ? JSON.parse(dataLine.replace('data:', '').trim()) : {};

          if (event === 'token' && payload.token) {
            updateStreamingMessage(assistantId, (message) => ({ content: `${message.content}${payload.token}` }));
          }

          if (event === 'done') {
            updateStreamingMessage(assistantId, () => ({
              id: payload.messageId || assistantId,
              content: payload.text || '',
              isStreaming: false,
              confidenceScore: payload.confidenceScore,
              recommendEscalation: Boolean(payload.recommendEscalation),
              escalationReason: payload.escalationReason || '',
              feedbackGiven: false,
            }));
            if (payload.recommendEscalation || Number(payload.confidenceScore || 0) < 70) {
              setEscalation({
                reason: payload.escalationReason || 'low_confidence',
                confidenceScore: payload.confidenceScore,
              });
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to reach AI Expert.');
      updateStreamingMessage(assistantId, () => ({
        content: 'AI Expert is unavailable right now. You can try again or connect with a verified human expert.',
        isStreaming: false,
        confidenceScore: 35,
        recommendEscalation: true,
      }));
      setEscalation({ reason: 'service_unavailable', confidenceScore: 35 });
    } finally {
      setIsStreaming(false);
    }
  }, [appendMessage, conversationId, isStreaming, requireLogin, startConversation, updateStreamingMessage]);

  const handleInitialSubmit = async (event) => {
    event.preventDefault();
    const cleanProblem = problem.trim();
    if (!cleanProblem) return;
    setIsStarting(true);
    try {
      const id = await startConversation();
      setProblem('');
      await sendMessage(cleanProblem, id);
    } catch (err) {
      setError(err.message || 'Unable to start AI Expert.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage(text);
  };

  const submitFeedback = async (messageId, feedback) => {
    if (!conversationId) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, feedbackGiven: true, selectedFeedback: feedback } : message
      )
    );

    try {
      const res = await fetch(`${API}/api/ai/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ conversationId, messageId, feedback }),
      });
      const data = await res.json().catch(() => ({}));
      if (feedback === 'not_helped' || data.recommendEscalation) {
        setEscalation({ reason: data.escalationReason || 'feedback' });
      }
    } catch {
      if (feedback === 'not_helped') {
        setEscalation({ reason: 'feedback' });
      }
    }
  };

  const bookExpert = async () => {
    if (!conversationId) {
      navigate(`/experts?domain=${encodeURIComponent(selectedDomain)}`);
      return;
    }

    try {
      const res = await fetch(`${API}/api/ai/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json().catch(() => ({}));
      navigate(data.redirectUrl || `/experts?domain=${encodeURIComponent(selectedDomain)}`);
    } catch {
      navigate(`/experts?domain=${encodeURIComponent(selectedDomain)}`);
    }
  };

  return (
    <div className="ai-page">
      <header className="ai-topbar">
        <button className="ai-back-btn" onClick={() => navigate('/')} aria-label="Go back home">
          <ArrowLeft size={18} />
          Home
        </button>
        <div className="ai-brand">
          <span className="ai-brand-icon"><Bot size={18} /></span>
          <span>Solvenut AI Expert</span>
        </div>
        <button className="ai-human-btn" onClick={bookExpert} aria-label="Book a verified human expert">
          <UserRoundCheck size={17} />
          Book Expert
        </button>
      </header>

      <main className="ai-layout">
        <aside className="ai-sidebar">
          <div className="ai-sidebar-head">
            <p>Consultation Domain</p>
            <h1>Ask AI Expert</h1>
          </div>
          <div className="ai-domain-grid">
            {DOMAINS.map((domain) => {
              const Icon = domain.icon;
              return (
                <button
                  key={domain.id}
                  className={`ai-domain-card ${selectedDomain === domain.id ? 'ai-domain-card--active' : ''}`}
                  onClick={() => setSelectedDomain(domain.id)}
                  disabled={Boolean(conversationId)}
                  title={conversationId ? 'Domain is locked after a consultation starts' : domain.label}
                >
                  <Icon size={18} />
                  <span>{domain.label}</span>
                </button>
              );
            })}
          </div>
          <div className="ai-sidebar-note">
            <Sparkles size={18} />
            <p>AI Expert is the first consultation layer. It can clarify your problem, build a plan, and recommend a verified human expert when the situation needs deeper judgment.</p>
          </div>
        </aside>

        <section className="ai-chat-panel">
          {!conversationId && messages.length === 0 ? (
            <form className="ai-start-panel" onSubmit={handleInitialSubmit}>
              <div className="ai-start-icon">
                {React.createElement(selectedDomainInfo.icon, { size: 26 })}
              </div>
              <p className="ai-kicker">{selectedDomainInfo.label} consultation</p>
              <h2>Describe the decision or problem you want help with.</h2>
              <textarea
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
                placeholder="Example: I have two job offers and I am unsure which one fits my long-term goals..."
                rows={8}
                aria-label="Describe your decision or problem"
              />
              {error && <div className="ai-error">{error}</div>}
              <button className="ai-primary-btn" type="submit" disabled={isStarting || !problem.trim()}>
                {isStarting ? <Loader2 className="ai-spin" size={18} /> : <Send size={18} />}
                Start AI Consultation
              </button>
            </form>
          ) : (
            <>
              <div className="ai-chat-header">
                <div>
                  <p>{selectedDomainInfo.label}</p>
                  <h2>AI Expert Consultation</h2>
                </div>
                {messages.length > 0 && (
                  <span className="ai-memory-pill">{messages.length} messages in memory</span>
                )}
              </div>

              <div className="ai-messages">
                {messages.map((message) => (
                  <article key={message.id} className={`ai-message ai-message--${message.role}`}>
                    <div className="ai-avatar">{message.role === 'assistant' ? <Bot size={18} /> : 'You'}</div>
                    <div className="ai-bubble">
                      <div className="ai-message-text">
                        {message.content ? formatAssistantText(message.content) : (
                          <span className="ai-typing"><Loader2 className="ai-spin" size={16} /> Thinking like a consultant...</span>
                        )}
                      </div>
                      {message.role === 'assistant' && !message.isStreaming && (
                        <div className="ai-response-meta">
                          {Number.isFinite(Number(message.confidenceScore)) && (
                            <span>Confidence {message.confidenceScore}%</span>
                          )}
                          <div className="ai-feedback-row">
                            {FEEDBACK.map((item) => (
                              <button
                                key={item.id}
                                className={message.selectedFeedback === item.id ? 'ai-feedback--active' : ''}
                                onClick={() => submitFeedback(message.id, item.id)}
                                disabled={message.feedbackGiven}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {escalation && (
                <div className="ai-escalation">
                  <div>
                    <h3>Would you like to connect with a verified human expert?</h3>
                    <p>{getEscalationCopy(escalation.reason)}</p>
                  </div>
                  <div className="ai-escalation-actions">
                    <button className="ai-primary-btn" onClick={bookExpert}>
                      <UserRoundCheck size={18} />
                      Book Expert
                    </button>
                    <button className="ai-secondary-btn" onClick={() => setEscalation(null)}>
                      Continue with AI
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="ai-error">{error}</div>}

              <form className="ai-composer" onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask a follow-up, add missing context, or request an action plan..."
                  rows={2}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend(event);
                    }
                  }}
                />
                <button type="submit" disabled={isStreaming || !draft.trim()} aria-label="Send message">
                  {isStreaming ? <Loader2 className="ai-spin" size={20} /> : <Send size={20} />}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default AIExpert;
