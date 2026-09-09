// src/components/FloatingAssistant.jsx
import React, { useState } from "react";
import { MessageCircle, X, MessageSquare, HelpCircle } from "lucide-react";
import HelpBot from "./HelpBot";
import PsychologyAssistant from "./PsychologyAssistant";
import "../styles/FloatingAssistant.css";

const FloatingAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showHelpBot, setShowHelpBot] = useState(false);
  const [showPsychology, setShowPsychology] = useState(false);

  const handleAssistantSelect = (type) => {
    if (type === "help") {
      setShowHelpBot(true);
    } else if (type === "psychology") {
      setShowPsychology(true);
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="floating-assistant-container">
        {isOpen && (
          <div className="floating-assistant-menu">
            <button
              className="floating-assistant-option psychology"
              onClick={() => handleAssistantSelect("psychology")}
              title="Chat with AI Psychology Assistant"
            >
              <MessageSquare size={20} />
              <span>Talk to Dr. Empathy</span>
            </button>
            <button
              className="floating-assistant-option help"
              onClick={() => handleAssistantSelect("help")}
              title="Get help about Solvenut"
            >
              <HelpCircle size={20} />
              <span>Need Help?</span>
            </button>
          </div>
        )}

        <button
          className={`floating-assistant-button ${isOpen ? "active" : ""}`}
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Close menu" : "Open assistant menu"}
          aria-expanded={isOpen}
          aria-label="Open assistant menu"
        >
          <MessageCircle size={24} className="icon-default" />
          <X size={24} className="icon-active" />
        </button>
      </div>

      {/* Modals */}
      {showPsychology && (
        <PsychologyAssistant
          open={showPsychology}
          onClose={() => {
            setShowPsychology(false);
            setIsOpen(false);
          }}
        />
      )}

      {showHelpBot && (
        <HelpBot
          open={showHelpBot}
          onClose={() => {
            setShowHelpBot(false);
            setIsOpen(false);
          }}
        />
      )}
    </>
  );
};

export default FloatingAssistant;
