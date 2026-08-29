import React, { useState, useEffect, useRef } from "react";
import { sendChatMessage } from "../api/client";
import { X, Send, Bot } from "lucide-react";

interface HinglishBotSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomerId: string;
  initialWorkflowId?: string;
  onRefresh?: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  intent?: string;
  actionTaken?: string;
}

const PRESET_PROMPTS = [
  "Mera payment fail kyun hua?",
  "Main abhi pay kar sakta hoon",
  "Kal tak payment kar dunga",
  "Mujhe kuch din aur chahiye",
  "Partial payment possible hai?",
  "Why was my payment declined?",
];

export function HinglishBotSimulator({
  isOpen,
  onClose,
  initialCustomerId,
  initialWorkflowId,
  onRefresh,
}: HinglishBotSimulatorProps): React.JSX.Element | null {
  // ⚠️ All hooks must run unconditionally — Rules of Hooks
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      text: "Namaste! Main RevRec ka AI assistant hoon. Aapke payment ke baare mein kaise help kar sakta hoon? (Hello! I am RevRec's AI assistant. How can I help you with your payment?)",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const customerId = initialCustomerId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialCustomerId) {
      setMessages([
        {
          id: `welcome-${initialCustomerId}`,
          role: "bot",
          text: `Namaste! Main RevRec ka AI assistant hoon. Aapke payment recovery ke baare mein kaise help kar sakta hoon? (Hello! How can I assist you with this transaction?)`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [initialCustomerId, initialWorkflowId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // M27 fix: close modal on Escape key for keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      const response = await sendChatMessage(customerId, text.trim(), initialWorkflowId);
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: response.replyText,
        timestamp: new Date(),
        intent: response.intent,
        actionTaken: response.actionTaken,
      };
      setMessages((prev) => [...prev, botMsg]);

      // If financial lifecycle action was taken (PTP created, Halted, Disputed), refresh parent dashboard
      if (response.actionTaken && response.actionTaken !== "REPLY_SENT") {
        onRefresh?.();
      }
    } catch {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "bot",
        text: "Sorry, technical issue hua. Please try again. (Technical error occurred.)",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputText);
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Overlay */}
      <div className="ds-overlay" onClick={onClose} />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          className="ds-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Hinglish Recovery Chat Bot"
          style={{
            width: "100%",
            maxWidth: 480,
            height: 600,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
        >
          {/* ── Modal header ─────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "var(--brand-tint)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Bot size={18} style={{ color: "var(--brand)" }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)", lineHeight: 1.2, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>RevRec Bot</span>
                  {initialWorkflowId && (
                    <span style={{ fontSize: 10, padding: "2px 6px", background: "var(--brand-tint)", color: "var(--brand)", borderRadius: 4, fontFamily: "monospace" }}>
                      Linked: {initialWorkflowId.slice(0, 12)}…
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-soft)" }}>
                  {initialCustomerId ? `Customer: ${initialCustomerId}` : "Hinglish Recovery Assistant"}
                </div>
              </div>
            </div>
            <button className="ds-btn ds-btn-ghost ds-btn-icon" onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          {/* ── Messages area ─────────────────────────────── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--bg-inset)",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                {/* Bubble */}
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius:
                      msg.role === "user"
                        ? "12px 12px 4px 12px"
                        : "12px 12px 12px 4px",
                    background: msg.role === "user" ? "var(--brand)" : "var(--bg-surface)",
                    border: msg.role === "user" ? "none" : "1px solid var(--border)",
                    color: msg.role === "user" ? "#ffffff" : "var(--text-body)",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>

                {/* Intent / action tags (bot only) */}
                {msg.role === "bot" && (msg.intent || msg.actionTaken) && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 2 }}>
                    {msg.intent && msg.intent !== "unknown" && (
                      <span className="ds-badge ds-badge-blue" style={{ fontSize: 11 }}>
                        <span className="ds-badge-dot" />
                        {msg.intent}
                      </span>
                    )}
                    {msg.actionTaken && msg.actionTaken !== "none" && (
                      <span className="ds-badge ds-badge-teal" style={{ fontSize: 11 }}>
                        <span className="ds-badge-dot" />
                        {msg.actionTaken}
                      </span>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    paddingLeft: msg.role === "user" ? 0 : 2,
                    paddingRight: msg.role === "user" ? 2 : 0,
                  }}
                >
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "12px 12px 12px 4px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--text-faint)",
                        animation: `ds-pulse ${0.6 + i * 0.15}s ease-in-out infinite`,
                        display: "inline-block",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Preset prompts ────────────────────────────── */}
          <div
            style={{
              padding: "8px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              flexShrink: 0,
              background: "var(--bg-surface)",
            }}
          >
            {PRESET_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className="ds-btn ds-btn-ghost"
                onClick={() => handleSendMessage(prompt)}
                disabled={isTyping}
                style={{
                  height: 30,
                  padding: "0 10px",
                  fontSize: 12,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* ── Input area ────────────────────────────────── */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 8,
              flexShrink: 0,
              background: "var(--bg-surface)",
            }}
          >
            <input
              className="ds-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type in Hindi or English…"
              disabled={isTyping}
              style={{ flex: 1 }}
            />
            <button
              className="ds-btn ds-btn-primary"
              onClick={() => handleSendMessage(inputText)}
              disabled={isTyping || !inputText.trim()}
              style={{ width: 40, height: 40, padding: 0, flexShrink: 0 }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
