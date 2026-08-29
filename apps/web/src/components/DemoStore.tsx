import React, { useState } from "react";
import {
  Zap,
  ShieldCheck,
  Server,
  Users,
  ArrowRight,
  CreditCard,
  Repeat,
  Smartphone,
  Activity,
  FileText,
  Filter,
  Sparkles,
} from "lucide-react";
import { CheckoutModal } from "./CheckoutModal";
import { PillBadge } from "./PillBadge";

export interface Product {
  id: string;
  name: string;
  tagline: string;
  priceInPaise: number;
  tier: string;
  category: "SOFT" | "NETWORK" | "INTENT_DROP" | "MANDATE" | "HARD";
  categoryLabel: string;
  features: string[];
  errorCode: string; // The error to simulate on "failure"
  errorDescription: string;
  expectedOutcome: string;
  accentColor: string;
  accentBg: string;
}

const DEMO_PRODUCTS: Product[] = [
  {
    id: "prod_enterprise",
    name: "Enterprise Core License",
    tagline: "Full AI Revenue Recovery Suite with webhook listeners and ML strategy rules",
    priceInPaise: 499900,
    tier: "Enterprise",
    category: "NETWORK",
    categoryLabel: "Network & Gateway",
    features: ["Unlimited recovery workflows", "Custom dunning rules", "SLA 99.99%", "Dedicated support"],
    errorCode: "GATEWAY_TIMEOUT",
    errorDescription: "Bank server timeout during authorization — peak load detected",
    expectedOutcome: "Exponential backoff with randomized jitter (5-30m). Bank downtime window avoided.",
    accentColor: "#0891b2",
    accentBg: "#ecfeff",
  },
  {
    id: "prod_business",
    name: "Business Growth Plan",
    tagline: "Automated Razorpay failure diagnosis, WhatsApp communications & promise tracking",
    priceInPaise: 249900,
    tier: "Business",
    category: "SOFT",
    categoryLabel: "Soft Decline",
    features: ["500 workflows/month", "WhatsApp recovery bot", "Promise-to-Pay tracker", "Analytics dashboard"],
    errorCode: "INSUFFICIENT_FUNDS",
    errorDescription: "Customer account balance low at end of billing cycle",
    expectedOutcome: "Salary cycle smart retry scheduled for 1st-5th of next month at 09:30 AM IST.",
    accentColor: "#d97706",
    accentBg: "#fffbeb",
  },
  {
    id: "prod_pro",
    name: "Pro Developer Tier",
    tagline: "PostgreSQL queue processor, REST APIs, and instant retry triggers",
    priceInPaise: 129900,
    tier: "Pro",
    category: "INTENT_DROP",
    categoryLabel: "Intent Drop-off",
    features: ["200 workflows/month", "API access", "BullMQ queue", "Webhook integration"],
    errorCode: "OTP_TIMEOUT",
    errorDescription: "Customer dropped off after OTP screen — intent detected but not completed",
    expectedOutcome: "Pre-authenticated 1-click WhatsApp/SMS recovery link dispatched instantly.",
    accentColor: "#7c3aed",
    accentBg: "#f5f3ff",
  },
  {
    id: "prod_starter",
    name: "Starter Merchant Tier",
    tagline: "Standard failure retry queue and basic email reminders for soft declines",
    priceInPaise: 49900,
    tier: "Starter",
    category: "HARD",
    categoryLabel: "Hard Decline",
    features: ["50 workflows/month", "Email reminders", "Basic RCA", "Standard support"],
    errorCode: "CARD_EXPIRED",
    errorDescription: "Card expiry date passed — customer has not updated billing profile",
    expectedOutcome: "Immediate dunning halt to prevent wasted fees. Escalation link sent for card update.",
    accentColor: "#dc2626",
    accentBg: "#fef2f2",
  },
  {
    id: "prod_mandate_enach",
    name: "e-NACH Recurring Mandate",
    tagline: "Automated recurring B2B AutoPay mandate collection on corporate bank accounts",
    priceInPaise: 899900,
    tier: "AutoPay Mandate",
    category: "MANDATE",
    categoryLabel: "Mandate Failure",
    features: ["NPCI e-NACH synchronization", "Recurring auto-debits", "Mandate health alerts", "Bank node failover"],
    errorCode: "MANDATE_EXECUTION_FAILED",
    errorDescription: "Corporate bank node rejected recurring mandate debit execution",
    expectedOutcome: "Mandatory 48-hour compliance gap enforced before re-authentication debit flow.",
    accentColor: "#059669",
    accentBg: "#ecfdf5",
  },
  {
    id: "prod_upi_instant",
    name: "Instant UPI Team Pass",
    tagline: "High-frequency micro-payments via UPI AutoPay & Dynamic QR rails",
    priceInPaise: 29900,
    tier: "Micro Pass",
    category: "NETWORK",
    categoryLabel: "UPI Outage",
    features: ["Instant QR generation", "UPI intent deep-links", "Sub-second verification", "Multi-PSP failover"],
    errorCode: "UPI_SWITCH_DOWN",
    errorDescription: "NPCI UPI Switch experiencing temporary processing timeout and PSP degradation",
    expectedOutcome: "Rapid 5-15 minute jitter retry loop with switch health monitoring.",
    accentColor: "#0284c7",
    accentBg: "#f0f9ff",
  },
  {
    id: "prod_api_highvolume",
    name: "High-Velocity API Cluster",
    tagline: "Dedicated rate-limit headroom and high-throughput webhooks for fintech platforms",
    priceInPaise: 649900,
    tier: "Infrastructure",
    category: "SOFT",
    categoryLabel: "Velocity Limit",
    features: ["100k API calls/day", "Dedicated Redis cluster", "Sub-50ms latency", "Custom webhooks"],
    errorCode: "DAILY_LIMIT_EXCEEDED",
    errorDescription: "Card issuer transaction velocity or single-day online spending cap reached",
    expectedOutcome: "Delayed queue shifts retry to next business morning at 09:30 AM IST.",
    accentColor: "#ea580c",
    accentBg: "#fff7ed",
  },
  {
    id: "prod_b2b_custom_sla",
    name: "B2B Custom Enterprise SLA",
    tagline: "Tailored private cloud deployment, dedicated cluster, and Net-30 invoice settlement",
    priceInPaise: 1850000,
    tier: "Enterprise B2B",
    category: "INTENT_DROP",
    categoryLabel: "B2B Receivables",
    features: ["Custom SLA 99.999%", "SOC2 Type II compliance", "Multi-region failover", "Net-30 invoice management"],
    errorCode: "INVOICE_PAYMENT_PENDING",
    errorDescription: "B2B invoice payment overdue — awaiting accounts payable authorization",
    expectedOutcome: "Automated multi-channel chaser with conditional 5% prompt payment discount.",
    accentColor: "#4f46e5",
    accentBg: "#eef2ff",
  },
];

const CATEGORY_FILTERS = [
  { id: "ALL", label: "All Scenarios" },
  { id: "SOFT", label: "Soft Declines" },
  { id: "NETWORK", label: "Network & Outages" },
  { id: "INTENT_DROP", label: "Intent & Drop-offs" },
  { id: "MANDATE", label: "Mandate Failures" },
  { id: "HARD", label: "Hard Declines" },
];

interface DemoStoreProps {
  onRecoveryTriggered: () => void; // Callback to refresh the main dashboard
}

export function DemoStore({ onRecoveryTriggered }: DemoStoreProps): React.JSX.Element {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const filteredProducts = DEMO_PRODUCTS.filter(
    (p) => selectedCategory === "ALL" || p.category === selectedCategory
  );

  return (
    <div style={{ padding: "24px 28px 48px", maxWidth: 1320, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
            }}
          >
            INTERACTIVE TESTING
          </span>
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--text-strong)",
            margin: "2px 0 6px",
          }}
        >
          RevRec Live Demo Store
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--text-soft)", lineHeight: 1.55, margin: 0, maxWidth: 980 }}>
          Purchase any item below to inject realistic Indian payment failure scenarios into the recovery pipeline.
          <br className="hidden md:inline" />
          The autonomous engine will classify the root cause (RCA), apply dunning guards, schedule smart retries, and update the ledger in real time.
        </p>

        {/* How it works strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 14,
            padding: "10px 14px",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-soft)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 5 }}>
            <Sparkles size={13} color="var(--brand)" />
            Live Demo Flow:
          </span>
          {[
            "Select Failure Scenario",
            "Razorpay Modal Opens",
            "Close Modal (Simulate Decline)",
            "Autonomous AI Intervenes",
            "Ledger Updates Live",
          ].map((step, i, arr) => (
            <React.Fragment key={step}>
              <span>{step}</span>
              {i < arr.length - 1 && <ArrowRight size={11} style={{ color: "var(--text-faint)", flexShrink: 0 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Category Filter Pills ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 20,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-faint)", fontSize: 12, marginRight: 4 }}>
          <Filter size={13} />
          <span>Filter:</span>
        </div>
        {CATEGORY_FILTERS.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count =
            cat.id === "ALL"
              ? DEMO_PRODUCTS.length
              : DEMO_PRODUCTS.filter((p) => p.category === cat.id).length;

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: isSelected
                  ? "1px solid rgba(15, 23, 42, 0.32)"
                  : "1px solid var(--border)",
                backgroundColor: isSelected ? "var(--bg-subtle)" : "var(--bg-surface)",
                color: isSelected ? "var(--text-strong)" : "var(--text-body)",
                boxShadow: isSelected
                  ? "0 1px 3px -1px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.08)"
                  : "none",
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "rgba(15, 23, 42, 0.22)";
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                }
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                <span>{cat.label}</span>
                {/* Invisible bold duplicate pre-reserves exact width preventing horizontal layout shift */}
                <span
                  style={{
                    fontWeight: 600,
                    height: 0,
                    overflow: "hidden",
                    visibility: "hidden",
                    userSelect: "none",
                  }}
                  aria-hidden="true"
                >
                  {cat.label}
                </span>
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 10,
                  backgroundColor: isSelected ? "rgba(15, 23, 42, 0.10)" : "var(--bg-subtle)",
                  border: isSelected ? "1px solid rgba(15, 23, 42, 0.12)" : "1px solid var(--border)",
                  color: isSelected ? "var(--text-strong)" : "var(--text-soft)",
                  transition: "all 0.15s ease",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Product Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
          gap: 16,
        }}
      >
        {filteredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onBuyClick={() => setSelectedProduct(product)}
          />
        ))}
      </div>

      {/* ── Test Card Helper ── */}
      <div
        style={{
          marginTop: 28,
          padding: "14px 16px",
          backgroundColor: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <CreditCard size={16} style={{ color: "var(--text-soft)", flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-strong)", marginBottom: 4 }}>
            Razorpay Test Credentials & Sandbox Mode
          </div>
          <div style={{ fontSize: 12, color: "var(--text-soft)", lineHeight: 1.6 }}>
            Card: <code style={{ fontFamily: "monospace", color: "var(--text-body)" }}>4111 1111 1111 1111</code>
            &nbsp;·&nbsp; Expiry: <code style={{ fontFamily: "monospace", color: "var(--text-body)" }}>12/26</code>
            &nbsp;·&nbsp; CVV: <code style={{ fontFamily: "monospace", color: "var(--text-body)" }}>123</code>
            &nbsp;·&nbsp; OTP: <code style={{ fontFamily: "monospace", color: "var(--text-body)" }}>1234</code>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 4 }}>
            Use the test card above to simulate successful checkout, or close the modal / enter invalid info to trigger the corresponding autonomous recovery workflow.
          </div>
        </div>
      </div>

      {/* ── Checkout Modal ── */}
      {selectedProduct && (
        <CheckoutModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onRecoveryTriggered={() => {
            setSelectedProduct(null);
            onRecoveryTriggered();
          }}
        />
      )}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  onBuyClick: () => void;
}

function ProductCard({ product, onBuyClick }: ProductCardProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const priceInRupees = Math.round(product.priceInPaise / 100);

  const getTierIcon = (id: string) => {
    switch (id) {
      case "prod_enterprise":
        return Server;
      case "prod_business":
        return Users;
      case "prod_pro":
        return Zap;
      case "prod_starter":
        return ShieldCheck;
      case "prod_mandate_enach":
        return Repeat;
      case "prod_upi_instant":
        return Smartphone;
      case "prod_api_highvolume":
        return Activity;
      case "prod_b2b_custom_sla":
        return FileText;
      default:
        return Zap;
    }
  };

  const TierIcon = getTierIcon(product.id);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid ${hovered ? `${product.accentColor}45` : "var(--border)"}`,
        borderRadius: 12,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: hovered ? "0 4px 14px rgba(0,0,0,0.04)" : "none",
        cursor: "default",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: product.accentBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <TierIcon size={16} style={{ color: product.accentColor }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <PillBadge
            variant={
              product.category === "SOFT"
                ? "amber"
                : product.category === "NETWORK"
                ? "blue"
                : product.category === "INTENT_DROP"
                ? "purple"
                : product.category === "HARD"
                ? "red"
                : "teal"
            }
          >
            {product.categoryLabel}
          </PillBadge>
        </div>
      </div>

      {/* Name & tagline */}
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)", marginBottom: 3 }}>
          {product.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-soft)", lineHeight: 1.45, minHeight: 35 }}>
          {product.tagline}
        </div>
      </div>

      {/* Features */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {product.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-body)" }}>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: product.accentColor,
                flexShrink: 0,
              }}
            />
            {f}
          </li>
        ))}
      </ul>

      {/* Simulation Scenario Hint Box */}
      <div
        style={{
          fontSize: 10.5,
          backgroundColor: "var(--bg-subtle)",
          padding: "7px 9px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          lineHeight: 1.35,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>Failure Injection:</span>
          <code style={{ fontFamily: "monospace", color: product.accentColor, fontWeight: 600 }}>{product.errorCode}</code>
        </div>
        <span style={{ color: "var(--text-faint)" }}>{product.expectedOutcome}</span>
      </div>

      {/* Price & CTA */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-strong)", letterSpacing: "-0.03em" }}>
            ₹{priceInRupees.toLocaleString("en-IN")}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-faint)", marginLeft: 3 }}>/term</span>
        </div>

        <button
          onClick={onBuyClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 13px",
            borderRadius: 7,
            border: "none",
            backgroundColor: hovered ? product.accentColor : "var(--brand)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background-color 0.15s ease",
            flexShrink: 0,
          }}
        >
          <CreditCard size={12} />
          Test Checkout
        </button>
      </div>
    </div>
  );
}

export default DemoStore;
