// src/components/HelpBot.jsx
import React, { useEffect, useRef, useState } from "react";
import { HelpCircle, RotateCcw, Send, X } from "lucide-react";
import { API } from "../utils/api";

const welcomeMessage = {
  role: "assistant",
  content: `Welcome to Solvenut Help.

Type a number to see help:
1. Booking experts
2. Chat and messaging
3. Video calls
4. Account setup and signup
5. Dashboard features
6. Troubleshooting
7. Payments

You can also type your own question.`,
};

const quickPrompts = [
  "1 Booking",
  "2 Chat",
  "3 Video calls",
  "6 Troubleshooting",
];

const quickPromptValues = {
  "1 Booking": "1",
  "2 Chat": "2",
  "3 Video calls": "3",
  "6 Troubleshooting": "6",
};

const HelpBot = ({ open, onClose }) => {
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const addMessage = (msg) => setMessages((prev) => [...prev, msg]);

  const handleSend = async (nextPrompt = input) => {
    if (!nextPrompt.trim() || isLoading) return;

    const text = nextPrompt.trim();
    addMessage({ role: "user", content: text });
    setInput("");
    setIsLoading(true);

    const url = `${API}/api/help`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ question: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let body = "";
        try {
          const json = await res.json();
          body = json?.error || json?.message || JSON.stringify(json);
        } catch {
          body = await res.text().catch(() => "");
        }

        addMessage({
          role: "assistant",
          content: `I could not load help right now (${res.status}). ${body || "Please try again."}\n\nIf it keeps happening, contact support@solvenut.com.`,
        });
        return;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        const txt = await res.text().catch(() => "");
        data = { answer: txt };
      }

      const answer =
        data?.answer ||
        data?.reply ||
        data?.result ||
        (typeof data === "string" ? data : null) ||
        "Help is unavailable right now. Please try again shortly.";

      addMessage({ role: "assistant", content: answer });
    } catch (err) {
      const userMessage =
        err.name === "AbortError"
          ? "Request timed out. Please try again."
          : err.message
          ? `Network error: ${err.message}`
          : "Unknown network error.";

      addMessage({
        role: "assistant",
        content: `${userMessage}\n\nIf this persists, contact support@solvenut.com.`,
      });
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const resetConversation = () => {
    setMessages([welcomeMessage]);
    setInput("");
  };

  if (!open) return null;

  return (
    <div className="helpbot-overlay" onClick={onClose}>
      <div className="helpbot-modal" onClick={(event) => event.stopPropagation()}>
        <div className="helpbot-header">
          <div className="helpbot-heading">
            <HelpCircle size={22} />
            <div>
              <div className="helpbot-title">Solvenut Help</div>
              <div className="helpbot-subtitle">Learn how to use the app</div>
            </div>
          </div>

          <div className="helpbot-header-actions">
            <button
              className="helpbot-icon-btn"
              type="button"
              onClick={resetConversation}
              disabled={isLoading || messages.length === 1}
              aria-label="Reset conversation"
              title="Reset conversation"
            >
              <RotateCcw size={18} />
            </button>
            <button
              className="helpbot-close-btn"
              type="button"
              onClick={() => {
                if (!isLoading) onClose();
              }}
              aria-label="Close help"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="helpbot-messages" ref={messagesRef} aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`helpbot-message ${message.role === "user" ? "user" : "assistant"}`}
            >
              <div className="helpbot-message-content">{message.content}</div>
            </div>
          ))}

          {isLoading && (
            <div className="helpbot-message assistant">
              <div className="helpbot-message-content">
                <div className="helpbot-typing-dots" aria-label="Loading help response">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="helpbot-quick-prompts" aria-label="Quick help topics">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="helpbot-chip"
              onClick={() => handleSend(quickPromptValues[prompt])}
              disabled={isLoading}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="helpbot-input-container">
          <textarea
            className="helpbot-input"
            placeholder="Type a number or ask a question..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="helpbot-send-btn"
            type="button"
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpBot;
