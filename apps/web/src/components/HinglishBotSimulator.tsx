import React, { useState, useEffect, useRef } from "react";
import { sendChatMessage } from "../api/client";
import { X, Send, Bot, Minus, MessageSquare, GripVertical, RotateCcw } from "lucide-react";
import { PillBadge } from "./PillBadge";

interface HinglishBotSimulatorProps {
  isOpen: boolean;
  isMinimized?: boolean;
  onMinimizeChange?: (minimized: boolean) => void;
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

const WIDGET_WIDTH = 390;
const WIDGET_HEIGHT = 560;
const PADDING = 12;

export function HinglishBotSimulator({
  isOpen,
  isMinimized: propMinimized,
  onMinimizeChange,
  onClose,
  initialCustomerId,
  initialWorkflowId,
  onRefresh,
}: HinglishBotSimulatorProps): React.JSX.Element | null {
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
  const [localMinimized, setLocalMinimized] = useState(false);
  const isMinimized = propMinimized !== undefined ? propMinimized : localMinimized;

  // Floating Position & Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  const setMinimized = (val: boolean) => {
    setLocalMinimized(val);
    onMinimizeChange?.(val);
  };

  const customerId = initialCustomerId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep clamped to viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      if (position) {
        const clampedX = Math.max(PADDING, Math.min(window.innerWidth - WIDGET_WIDTH - PADDING, position.x));
        const clampedY = Math.max(PADDING, Math.min(window.innerHeight - WIDGET_HEIGHT - PADDING, position.y));
        setPosition({ x: clampedX, y: clampedY });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position]);

  // Drag handlers for mouse
  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }

    const currentX = position ? position.x : Math.max(PADDING, window.innerWidth - WIDGET_WIDTH - 24);
    const currentY = position ? position.y : Math.max(PADDING, window.innerHeight - WIDGET_HEIGHT - 24);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentX,
      initY: currentY,
    };
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const newX = Math.max(PADDING, Math.min(window.innerWidth - WIDGET_WIDTH - PADDING, dragRef.current.initX + dx));
      const newY = Math.max(PADDING, Math.min(window.innerHeight - WIDGET_HEIGHT - PADDING, dragRef.current.initY + dy));
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Drag handlers for touch devices
  const handleHeaderTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input")) {
      return;
    }
    const touch = e.touches[0];
    const currentX = position ? position.x : Math.max(PADDING, window.innerWidth - WIDGET_WIDTH - 24);
    const currentY = position ? position.y : Math.max(PADDING, window.innerHeight - WIDGET_HEIGHT - 24);

    const touchStartX = touch.clientX;
    const touchStartY = touch.clientY;
    setIsDragging(true);

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      const moveTouch = moveEvent.touches[0];
      const dx = moveTouch.clientX - touchStartX;
      const dy = moveTouch.clientY - touchStartY;
      const newX = Math.max(PADDING, Math.min(window.innerWidth - WIDGET_WIDTH - PADDING, currentX + dx));
      const newY = Math.max(PADDING, Math.min(window.innerHeight - WIDGET_HEIGHT - PADDING, currentY + dy));
      setPosition({ x: newX, y: newY });
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
  };

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
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isMinimized]);

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

  // ── Minimized Floating Pill ──────────────────────────────────────────────
  if (isMinimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        role="button"
        tabIndex={0}
        aria-label="Expand RevRec Bot"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 16px",
          borderRadius: 24,
          backgroundColor: "var(--brand)",
          color: "#ffffff",
          boxShadow: "0 10px 30px -4px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.08)",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 600,
          border: "1px solid rgba(255,255,255,0.15)",
          animation: "ds-chat-slide 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          userSelect: "none",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Bot size={15} style={{ color: "#38bdf8" }} />
        </div>
        <span>RevRec Bot</span>
        {initialCustomerId && (
          <span style={{ opacity: 0.75, fontSize: 11, fontWeight: 500, fontFamily: "monospace" }}>
            · {initialCustomerId.slice(0, 10)}
          </span>
        )}
        <PillBadge variant="green" size="sm" dot={true} style={{ fontSize: 9.5, padding: "1px 6px" }}>
          ACTIVE
        </PillBadge>
        <MessageSquare size={13} style={{ opacity: 0.8, marginLeft: 2 }} />
      </div>
    );
  }

  // ── Production Docked & Draggable Chatbot Widget ───────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="RevRec Hinglish Recovery Chat Bot"
      style={{
        position: "fixed",
        ...(position
          ? { left: position.x, top: position.y }
          : { bottom: 24, right: 24 }),
        zIndex: 9999,
        width: WIDGET_WIDTH,
        maxWidth: "calc(100vw - 24px)",
        height: WIDGET_HEIGHT,
        maxHeight: "calc(100vh - 24px)",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: isDragging
          ? "0 24px 60px -8px rgba(0, 0, 0, 0.26), 0 8px 24px rgba(0, 0, 0, 0.12)"
          : "0 16px 48px -8px rgba(0, 0, 0, 0.16), 0 4px 16px -2px rgba(0, 0, 0, 0.06)",
        overflow: "hidden",
        userSelect: isDragging ? "none" : "auto",
        transition: isDragging ? "none" : "box-shadow 0.2s ease",
        animation: position ? "none" : "ds-chat-slide 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* ── Widget Header (Draggable) ──────────────────────────────────────── */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onTouchStart={handleHeaderTouchStart}
        onDoubleClick={() => setPosition(null)}
        title="Click & drag header to reposition · Double-click to dock to corner"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 14px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--bg-surface)",
          flexShrink: 0,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-faint)",
              opacity: 0.7,
            }}
          >
            <GripVertical size={14} />
          </div>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: "var(--brand-tint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <Bot size={15} style={{ color: "var(--brand)" }} />
            <span
              style={{
                position: "absolute",
                bottom: -1,
                right: -1,
                width: 6.5,
                height: 6.5,
                borderRadius: "50%",
                backgroundColor: "#16a34a",
                border: "1.5px solid var(--bg-surface)",
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.2 }}>
                RevRec Bot
              </span>
              <PillBadge variant="green" size="sm" dot={true} style={{ fontSize: 9.5, padding: "1px 6px" }}>
                LIVE
              </PillBadge>
            </div>

            <div
              style={{
                fontSize: 10.5,
                color: "var(--text-soft)",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 180,
              }}
            >
              {initialCustomerId ? (
                <>
                  <span style={{ fontWeight: 500 }}>Customer:</span>{" "}
                  <code style={{ fontFamily: "monospace", fontSize: 10 }}>{initialCustomerId}</code>
                </>
              ) : (
                "Hinglish Recovery Assistant"
              )}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {position !== null && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPosition(null);
              }}
              title="Dock to bottom-right corner"
              aria-label="Dock to corner"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                backgroundColor: "transparent",
                color: "var(--text-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "background-color 0.12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-subtle)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <RotateCcw size={12} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMinimized(true);
            }}
            aria-label="Minimize Chatbot"
            title="Minimize"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background-color 0.12s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-subtle)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close Chatbot"
            title="Close"
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background-color 0.12s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-subtle)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Linked Workflow Sub-header Strip ─────────────────────── */}
      {initialWorkflowId && (
        <div
          style={{
            padding: "5px 16px",
            backgroundColor: "var(--bg-subtle)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 10.5,
            color: "var(--text-faint)",
            flexShrink: 0,
          }}
        >
          <span>Linked Workflow:</span>
          <code style={{ fontFamily: "monospace", color: "var(--text-body)", fontWeight: 600 }}>
            {initialWorkflowId.slice(0, 18)}…
          </code>
        </div>
      )}

      {/* ── Messages Stream ──────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          backgroundColor: "var(--bg-inset)",
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
            {/* Chat Bubble */}
            <div
              style={{
                maxWidth: "84%",
                padding: "9px 13px",
                borderRadius:
                  msg.role === "user"
                    ? "12px 12px 3px 12px"
                    : "12px 12px 12px 3px",
                backgroundColor: msg.role === "user" ? "var(--brand)" : "var(--bg-surface)",
                border: msg.role === "user" ? "none" : "1px solid var(--border)",
                color: msg.role === "user" ? "#ffffff" : "var(--text-strong)",
                fontSize: 12.5,
                lineHeight: 1.5,
                boxShadow: msg.role === "user" ? "0 1px 3px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.03)",
                wordBreak: "break-word",
              }}
            >
              {msg.text}
            </div>

            {/* Bot Intent & Action Tags */}
            {msg.role === "bot" && (msg.intent || msg.actionTaken) && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 2, marginTop: 2 }}>
                {msg.intent && msg.intent !== "unknown" && msg.intent !== "NEEDS_CLARIFICATION" && (
                  <PillBadge variant="blue" size="sm" dot={true} style={{ fontSize: 10, padding: "2px 7px" }}>
                    {msg.intent}
                  </PillBadge>
                )}
                {msg.actionTaken && msg.actionTaken !== "none" && msg.actionTaken !== "REPLY_SENT" && (
                  <PillBadge variant="teal" size="sm" dot={true} style={{ fontSize: 10, padding: "2px 7px" }}>
                    {msg.actionTaken}
                  </PillBadge>
                )}
              </div>
            )}

            {/* Timestamp */}
            <span
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                paddingLeft: msg.role === "user" ? 0 : 3,
                paddingRight: msg.role === "user" ? 3 : 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "12px 12px 12px 3px",
                backgroundColor: "var(--bg-surface)",
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
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "var(--text-faint)",
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

      {/* ── Preset Prompt Chips Carousel ─────────────────────────── */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          gap: 6,
          overflowX: "auto",
          flexShrink: 0,
          scrollbarWidth: "none",
        }}
      >
        {PRESET_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSendMessage(prompt)}
            disabled={isTyping}
            className="ds-btn ds-btn-secondary"
            style={{
              height: 28,
              padding: "0 12px",
              fontSize: 11.5,
              fontWeight: 500,
              borderRadius: 9999,
              flexShrink: 0,
              whiteSpace: "nowrap",
              boxShadow: "none",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Chat Input Pill ──────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type in Hindi or English…"
          disabled={isTyping}
          style={{
            flex: 1,
            height: 36,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-inset)",
            fontSize: 12.5,
            color: "var(--text-strong)",
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <button
          onClick={() => handleSendMessage(inputText)}
          disabled={isTyping || !inputText.trim()}
          aria-label="Send message"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "none",
            backgroundColor: inputText.trim() && !isTyping ? "var(--brand)" : "var(--bg-subtle)",
            color: inputText.trim() && !isTyping ? "#ffffff" : "var(--text-faint)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: inputText.trim() && !isTyping ? "pointer" : "default",
            transition: "all 0.12s ease",
            flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export default HinglishBotSimulator;
