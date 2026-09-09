import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, BriefcaseBusiness, Check, CheckCircle2, Copy, GraduationCap, HeartPulse, LineChart, Loader2, MessageSquarePlus, RotateCcw, Send, Sparkles, TerminalSquare, TrendingUp, UserRoundCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const STARTER_PROMPTS = {
  career: ['Compare two job offers', 'Prepare for a difficult manager conversation', 'Plan my next 90 days'],
  business: ['Pressure-test a new business idea', 'Choose what to validate first', 'Make a focused growth plan'],
  finance: ['Map the trade-offs in a money decision', 'Build a simple scenario plan', 'Clarify my financial priorities'],
  programming: ['Review a system design decision', 'Plan a technical migration', 'Debug a recurring production issue'],
  devops: ['Prepare for a production incident', 'Reduce deployment friction', 'Choose an observability baseline'],
  academics: ['Build a realistic study plan', 'Frame a research question', 'Prepare a graduate application'],
  'medical guidance': ['Prepare questions for a clinician', 'Organize symptoms and timeline', 'Understand care-navigation options'],
  'personal growth': ['Set a meaningful next milestone', 'Prepare for a hard conversation', 'Turn a goal into weekly actions'],
};

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

function renderInlineMarkdown(text) {
  const tokens = String(text || '').split(/(\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_|`.*?`)/g);
  return tokens.map((token, index) => {
    if (!token) return null;
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      return <em key={`${token}-${index}`}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>;
    }
    return <React.Fragment key={`${token}-${index}`}>{token}</React.Fragment>;
  });
}

function formatAssistantText(text) {
  return String(text || '')
    .split('\n')
    .map((line, index) => {
      if (line.startsWith('###')) {
        return <h4 className="ai-markdown-heading" key={`${line}-${index}`}>{renderInlineMarkdown(line.replace(/^#+\s/, ''))}</h4>;
      }
      if (line.startsWith('##')) {
        return <h3 className="ai-markdown-heading" key={`${line}-${index}`}>{renderInlineMarkdown(line.replace(/^#+\s/, ''))}</h3>;
      }
      if (line.startsWith('#')) {
        return <h2 className="ai-markdown-heading" key={`${line}-${index}`}>{renderInlineMarkdown(line.replace(/^#+\s/, ''))}</h2>;
      }

      if (line.trim().match(/^(\d+\.|[-*])\s/)) {
        return (
          <div className="ai-markdown-list-item" key={`${line}-${index}`}>
            <span>{renderInlineMarkdown(line.replace(/^(\d+\.|[-*])\s/, ''))}</span>
          </div>
        );
      }
      if (line.trim()) {
        return <div className="ai-markdown-line" key={`${line}-${index}`}>{renderInlineMarkdown(line)}</div>;
      }
      return <div className="ai-markdown-spacer" key={`${line}-${index}`} />;
    });
}

const AIExpert = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const requestedConversationId = searchParams.get('conversationId');

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

  useEffect(() => {
    if (!requestedConversationId || conversationId || messages.length) return undefined;
    if (!requireLogin()) return undefined;
    let mounted = true;
    setIsLoadingConversation(true);
    fetch(`${API}/api/ai/conversation/${encodeURIComponent(requestedConversationId)}`, {
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to load this consultation.');
        return data;
      })
      .then((data) => {
        if (!mounted) return;
        const loadedMessages = Array.isArray(data.messages) ? data.messages.map((message) => ({
          id: String(message._id || `${message.role}-${message.createdAt || Date.now()}`),
          role: message.role,
          content: message.content || '',
          isStreaming: false,
          confidenceScore: message.confidenceScore,
          recommendEscalation: Boolean(message.recommendEscalation),
          escalationReason: message.escalationReason || '',
          feedbackGiven: false,
        })) : [];
        setConversationId(String(data.conversation?._id || requestedConversationId));
        setSelectedDomain(data.conversation?.domain || 'career');
        setMessages(loadedMessages);
        if (data.conversation?.escalationStatus === 'suggested') {
          setEscalation({ reason: data.conversation.escalationReason || 'low_confidence', confidenceScore: data.conversation.confidenceScore });
        }
        scrollToBottom();
      })
      .catch((loadError) => { if (mounted) setError(loadError.message || 'Unable to load this consultation.'); })
      .finally(() => { if (mounted) setIsLoadingConversation(false); });
    return () => { mounted = false; };
  }, [conversationId, messages.length, requireLogin, requestedConversationId, scrollToBottom]);

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
        failedText: cleanText,
        isError: true,
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

  const startNewConversation = () => {
    if (isStreaming || isStarting) return;
    setConversationId('');
    setMessages([]);
    setProblem('');
    setDraft('');
    setEscalation(null);
    setError('');
    setCopiedMessageId('');
    navigate('/ai-expert', { replace: true });
  };

  const copyMessage = async (message) => {
    if (!message.content || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? '' : current), 1600);
    } catch {
      setError('Copy failed. Select the response text and copy it manually.');
    }
  };

  const retryMessage = (message) => {
    if (!message.failedText || isStreaming) return;
    setMessages((current) => current.filter((item) => item.id !== message.id));
    setError('');
    sendMessage(message.failedText);
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
        <div className="ai-topbar-actions">
          <button className="ai-new-btn" onClick={startNewConversation} disabled={isStreaming || isStarting}>
            <MessageSquarePlus size={16} />
            New consultation
          </button>
          <button className="ai-human-btn" onClick={bookExpert} aria-label="Book a verified human expert">
            <UserRoundCheck size={17} />
            Book Expert
          </button>
        </div>
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
          <div className="ai-sidebar-flow">
            <p className="ai-sidebar-flow-title">A useful consultation</p>
            <ol>
              <li><span>01</span><div><strong>Frame the question</strong><small>Share the context and constraints.</small></div></li>
              <li><span>02</span><div><strong>Explore the options</strong><small>Ask follow-ups and test assumptions.</small></div></li>
              <li><span>03</span><div><strong>Choose your next step</strong><small>Escalate to a human expert when needed.</small></div></li>
            </ol>
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
                maxLength={6000}
              />
              <div className="ai-start-helper">
                <span>{problem.length}/6000</span>
                <span>Press Enter in the button below when you are ready.</span>
              </div>
              <div className="ai-prompt-row" aria-label="Suggested starting points">
                {(STARTER_PROMPTS[selectedDomain] || STARTER_PROMPTS.career).map((prompt) => (
                  <button type="button" key={prompt} onClick={() => setProblem(prompt)}>{prompt}</button>
                ))}
              </div>
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
                  <span className="ai-live-status"><span /> Private session · context stays in your account</span>
                </div>
                <div className="ai-chat-header-actions">
                  {messages.length > 0 && <span className="ai-memory-pill">{messages.length} messages</span>}
                  <button className="ai-header-new-btn" onClick={startNewConversation} disabled={isStreaming} aria-label="Start a new consultation"><RotateCcw size={15} /> New</button>
                </div>
              </div>

              <div className="ai-messages" role="log" aria-live="polite" aria-label="AI Expert messages">
                {isLoadingConversation && <div className="ai-loading-history"><Loader2 className="ai-spin" size={17} /> Loading saved consultation…</div>}
                {messages.map((message) => (
                  <article key={message.id} className={`ai-message ai-message--${message.role}`}>
                    <div className="ai-avatar" aria-label={message.role === 'assistant' ? 'AI Expert' : 'You'}>{message.role === 'assistant' ? <Bot size={18} /> : 'You'}</div>
                    <div className="ai-bubble">
                      <div className="ai-message-label">{message.role === 'assistant' ? 'AI Expert' : 'You'}</div>
                      <div className="ai-message-text">
                        {message.content ? formatAssistantText(message.content) : (
                          <span className="ai-typing"><Loader2 className="ai-spin" size={16} /> Thinking like a consultant...</span>
                        )}
                      </div>
                      {message.role === 'assistant' && !message.isStreaming && (
                        <div className="ai-response-meta">
                          <div className="ai-response-tools">
                            {Number.isFinite(Number(message.confidenceScore)) && <span className="ai-confidence">Confidence <strong>{message.confidenceScore}%</strong></span>}
                            <button className="ai-copy-btn" onClick={() => copyMessage(message)} aria-label={`Copy ${message.role === 'assistant' ? 'AI response' : 'message'}`}>
                              {copiedMessageId === message.id ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                            </button>
                            {message.isError && <button className="ai-retry-btn" onClick={() => retryMessage(message)}><RotateCcw size={14} /> Retry</button>}
                          </div>
                          <div className="ai-feedback-row" aria-label="Response feedback">
                            {FEEDBACK.map((item) => (
                              <button key={item.id} className={message.selectedFeedback === item.id ? 'ai-feedback--active' : ''} onClick={() => submitFeedback(message.id, item.id)} disabled={message.feedbackGiven}>{item.label}</button>
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
                <div className="ai-composer-field">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask a follow-up, add missing context, or request an action plan..."
                    rows={2}
                    maxLength={6000}
                    aria-label="Ask a follow-up question"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSend(event);
                      }
                    }}
                  />
                  <span className="ai-composer-count">{draft.length}/6000 · Enter to send · Shift+Enter for a new line</span>
                </div>
                <button type="submit" disabled={isStreaming || !draft.trim()} aria-label="Send message" title="Send message">
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
