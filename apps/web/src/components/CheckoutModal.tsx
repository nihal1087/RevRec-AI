import React, { useState, useEffect, useCallback } from "react";
import { X, CreditCard, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { RecoveryActivatedBanner } from "./RecoveryActivatedBanner";

// ── Razorpay window type ──────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: { razorpay_payment_id: string }) => void;
  modal: { ondismiss: () => void };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  priceInPaise: number;
  errorCode: string;
  errorDescription: string;
}

interface RcaHint {
  category: string;
  label: string;
  isRetryable: boolean;
  suggestedAction: string;
}

type ModalPhase =
  | "confirm"       // Initial: show product summary + Pay Now button
  | "loading"       // Creating Razorpay order
  | "success"       // Payment succeeded (test mode)
  | "failed"        // Modal closed without paying → failure simulated
  | "recovering";   // Show recovery banner

interface CheckoutModalProps {
  product: Product;
  onClose: () => void;
  onRecoveryTriggered: () => void;
}

// ── Helper: Load Razorpay SDK ─────────────────────────────────────────────────
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckoutModal({
  product,
  onClose,
  onRecoveryTriggered,
}: CheckoutModalProps): React.JSX.Element {
  const [phase, setPhase] = useState<ModalPhase>("confirm");
  const [statusMessage, setStatusMessage] = useState("");
  const [rcaHint, setRcaHint] = useState<RcaHint | null>(null);
  const [simulatedPaymentId, setSimulatedPaymentId] = useState("");

  const priceInRupees = Math.round(product.priceInPaise / 100).toLocaleString("en-IN");

  // ── Core payment handler ──────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    setPhase("loading");

    try {
      // Step 1: Create Razorpay order via our backend
      const orderRes = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountInPaise: product.priceInPaise,
          productName: product.name,
          customerName: "Nihal",
          customerEmail: "nihal@revrec.ai",
          customerPhone: "+918789600276",
        }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success) throw new Error(orderData.error || "Order creation failed");

      // Step 2: Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Razorpay SDK failed to load");

      const generatedPayId = `pay_demo_${Date.now()}`;
      setSimulatedPaymentId(generatedPayId);

      // Step 3: Open Razorpay modal
      if (orderData.mock || !window.Razorpay) {
        // Mock mode: no real Razorpay SDK — jump straight to "simulate close"
        await simulateFailure(generatedPayId);
        return;
      }

      const rzp = new window.Razorpay({
        key: orderData.key_id as string,
        amount: product.priceInPaise,
        currency: "INR",
        name: "RevRec AI",
        description: `Payment for ${product.name}`,
        order_id: orderData.order_id as string,
        prefill: {
          name: "Nihal",
          email: "nihal@revrec.ai",
          contact: "+918789600276",
        },
        theme: { color: "#0f172a" },
        handler: (_response) => {
          // Payment succeeded (test mode with valid test card)
          setPhase("success");
          setStatusMessage("Payment successful! Your subscription is now active.");
        },
        modal: {
          ondismiss: async () => {
            // User closed the modal without paying → simulate failure
            await simulateFailure(generatedPayId);
          },
        },
      });

      rzp.open();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Checkout error occurred";
      setStatusMessage(msg);
      setPhase("failed");
    }
  }, [product]);

  // ── Simulate failure injection ────────────────────────────────────────────
  const simulateFailure = useCallback(
    async (paymentId: string) => {
      setPhase("recovering");

      try {
        const res = await fetch("/api/checkout/simulate-failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId,
            amountInPaise: product.priceInPaise,
            errorCode: product.errorCode,
            errorDescription: product.errorDescription,
            customerName: "Nihal",
            customerEmail: "nihal@revrec.ai",
            customerPhone: "+918789600276",
          }),
        });

        const data = await res.json();
        if (data.rca_hint) setRcaHint(data.rca_hint as RcaHint);
      } catch {
        // Still show the recovery banner even if backend call fails
        setRcaHint({
          category: "SOFT",
          label: "Soft Decline",
          isRetryable: true,
          suggestedAction: "Smart retry scheduled.",
        });
      }
    },
    [product]
  );

  // Auto-trigger recovery banner refresh after 3s
  useEffect(() => {
    if (phase === "recovering") {
      const timeout = setTimeout(() => {
        onRecoveryTriggered();
      }, 3500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [phase, onRecoveryTriggered]);

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={phase === "confirm" || phase === "success" || phase === "failed" ? onClose : undefined}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: 14,
            border: "1px solid var(--border)",
            width: "100%",
            maxWidth: 420,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <CreditCard size={16} style={{ color: "var(--text-soft)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>
                {phase === "recovering" ? "Recovery Engine Activated" : "Checkout"}
              </span>
            </div>
            {(phase === "confirm" || phase === "success" || phase === "failed") && (
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-faint)",
                  display: "flex",
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: "20px" }}>
            {/* ── CONFIRM phase ── */}
            {phase === "confirm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    padding: "14px 16px",
                    backgroundColor: "var(--bg-subtle)",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", marginBottom: 6 }}>
                    {product.name}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-soft)" }}>Annual Subscription</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-strong)", letterSpacing: "-0.03em" }}>
                      ₹{priceInRupees}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-faint)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 7,
                    padding: "10px 12px",
                    backgroundColor: "#fefce8",
                    border: "1px solid #fde68a",
                    borderRadius: 8,
                    lineHeight: 1.5,
                  }}
                >
                  <AlertCircle size={13} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong style={{ color: "#92400e" }}>Demo tip:</strong> Click "Pay with Razorpay",
                    then <strong style={{ color: "#92400e" }}>close the modal</strong> to simulate a
                    payment failure and watch the recovery engine activate.
                  </span>
                </div>

                <button
                  onClick={handlePay}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <CreditCard size={15} />
                  Pay ₹{priceInRupees} with Razorpay
                </button>

                <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
                  Secured by Razorpay Test Gateway · No real charges
                </div>
              </div>
            )}

            {/* ── LOADING phase ── */}
            {phase === "loading" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "24px 0" }}>
                <Loader2 size={28} style={{ color: "var(--text-soft)", animation: "header-spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 13, color: "var(--text-soft)" }}>Initializing Razorpay...</span>
              </div>
            )}

            {/* ── SUCCESS phase ── */}
            {phase === "success" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
                <CheckCircle2 size={36} style={{ color: "#059669" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", marginBottom: 6 }}>
                    Payment Successful
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-soft)" }}>{statusMessage}</div>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    marginTop: 8,
                    padding: "8px 20px",
                    backgroundColor: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            )}

            {/* ── FAILED phase ── */}
            {phase === "failed" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                  <AlertCircle size={16} style={{ color: "#dc2626", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>{statusMessage}</span>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    padding: "8px 20px",
                    backgroundColor: "var(--brand)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            )}

            {/* ── RECOVERING phase ── */}
            {phase === "recovering" && (
              <RecoveryActivatedBanner
                paymentId={simulatedPaymentId}
                productName={product.name}
                amountInPaise={product.priceInPaise}
                errorCode={product.errorCode}
                rcaHint={rcaHint}
                onDismiss={() => {
                  onRecoveryTriggered();
                  onClose();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default CheckoutModal;
