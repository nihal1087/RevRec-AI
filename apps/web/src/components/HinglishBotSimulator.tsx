import React, { useState } from "react";
import { sendChatMessage } from "../api/client";
import { X, Send, Bot, Sparkles, CheckCheck } from "lucide-react";

interface HinglishBotSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomerId?: string | undefined;
  initialWorkflowId?: string | undefined;
}

interface ChatMessage {
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  intent?: string | undefined;
  actionTaken?: string | undefined;
  paymentUrl?: string | undefined;
}

const PRESET_PROMPTS = [
  "Bhai salary 5th ko aayegi tab pakka pay kar dunga",
  "UPI timeout ho gaya tha link dubara bhejo",
  "Maine ye product cancel kar diya tha fraud charge hai",
  "Thoda discount mil sakta hai kya abhi pay karne par?",
  "Bar bar message mat karo please DND lagao",
];

export function HinglishBotSimulator({
  isOpen,
  onClose,
  initialCustomerId = "cust_demo_101",
  initialWorkflowId,
}: HinglishBotSimulatorProps): React.JSX.Element | null {
  if (!isOpen) return null;

  const customerId = initialCustomerId;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "bot",
      text: "Namaste! RevRec payment assistance yahan hai. Aapke pending transaction ke baare mein hum aapki kya madad kar sakte hain?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);

    try {
      const response = await sendChatMessage(customerId, textToSend, initialWorkflowId);

      const botMsg: ChatMessage = {
        sender: "bot",
        text: response.replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        intent: response.intent,
        actionTaken: response.actionTaken,
        paymentUrl: response.paymentUrl,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `Error processing message: ${(err as Error).message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[620px]">
        {/* ── WhatsApp Style Header ────────────────────────────────────────── */}
        <div className="bg-emerald-900/80 border-b border-emerald-800/80 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-md">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                RevRec WhatsApp Recovery Assistant
              </h3>
              <p className="text-xs text-emerald-300 font-mono">
                Customer: {customerId} • Online
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-950 text-emerald-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Quick Preset Chips ───────────────────────────────────────────── */}
        <div className="bg-gray-950 px-3 py-2 border-b border-gray-800 flex items-center space-x-2 overflow-x-auto scrollbar-thin">
          <span className="text-[10px] text-gray-500 font-semibold uppercase flex-shrink-0">
            Quick Prompts:
          </span>
          {PRESET_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-[11px] bg-gray-900 hover:bg-emerald-950 text-gray-300 hover:text-emerald-300 border border-gray-800 rounded-lg px-2.5 py-1 whitespace-nowrap transition"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* ── Chat Message Stream ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-950/90 scrollbar-thin">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-md leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-emerald-700 text-white rounded-br-none"
                    : "bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none"
                }`}
              >
                <p>{msg.text}</p>
                <div
                  className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${
                    msg.sender === "user" ? "text-emerald-200" : "text-gray-400"
                  }`}
                >
                  <span>{msg.timestamp}</span>
                  {msg.sender === "user" && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                </div>
              </div>

              {/* Bot Action Meta Badge */}
              {msg.intent && (
                <div className="mt-1 flex items-center space-x-1.5 text-[10px] font-mono text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Intent: {msg.intent}</span>
                  {msg.actionTaken && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 font-semibold">{msg.actionTaken}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center space-x-2 text-xs text-gray-400 italic">
              <span className="animate-pulse">Assistant is typing...</span>
            </div>
          )}
        </div>

        {/* ── Input Bar ────────────────────────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputText);
          }}
          className="p-3 bg-gray-900 border-t border-gray-800 flex items-center space-x-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a Hinglish/English message (e.g. Salary kal aayegi...)"
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isTyping}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-md shadow-emerald-950"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
