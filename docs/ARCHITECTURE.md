# 🏗️ RevRec Architecture & Technical Specification

## 1. System Topology & Bounded Agency Architecture

RevRec is designed specifically for high-throughput Indian payment systems (Razorpay, UPI, e-NACH, Netbanking, Cards). It implements **Bounded Autonomous Agency**, where AI models are constrained by deterministic financial and regulatory firewalls.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INGESTION & IDEMPOTENCY LAYER                      │
│                                                                             │
│  [Razorpay / Gateway Webhook]                                              │
│               │                                                             │
│               ▼                                                             │
│  [HMAC-SHA256 Timing-Safe Validator] ──► (Reject 401 if forged)             │
│               │                                                             │
│               ▼                                                             │
│  [Redis SET NX 24h Idempotency Guard] ──► (Return 200 Cached if duplicate)  │
│               │                                                             │
│               ▼                                                             │
│  [BullMQ Queue: payment-events] ──► Redis Cluster (AOF Persistent)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DETERMINISTIC RCA & TIMING ENGINE                     │
│                                                                             │
│  [Worker: paymentEvent.worker] ──► (Prisma $transaction)                    │
│               │                                                             │
│               ├─► [RCA Engine (rca.service.ts)]                             │
│               │    Categorizes into SOFT, HARD, NETWORK, INTENT, MANDATE   │
│               │                                                             │
│               ├─► [Bank Health Guard (bankHealth.service.ts)]               │
│               │    Evades Indian Maintenance Blackout (00:00–03:30 IST)     │
│               │                                                             │
│               └─► [Smart Retry Sequencer (retrySequencer.service.ts)]       │
│                    Aligns 24th–29th Soft Declines to 1st of Next Month      │
│                    Applies Decorrelated Jitter ±20% to prevent storms       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BOUNDED AI AGENT & REGULATORY FIREWALL                    │
│                                                                             │
│  [Agent Orchestrator: agent.service.ts]                                     │
│               │                                                             │
│               ▼                                                             │
│  [Google Gemini 1.5 Flash (llmClient.ts)]                                   │
│  Prompts with multi-dimensional context (LTV, Risk Score, History)          │
│               │                                                             │
│               ▼                                                             │
│  [Zod Validation: AgentDecisionSchema]                                       │
│  Enforces typed Discriminated Union across 6 Predefined Tools               │
│               │                                                             │
│               ▼                                                             │
│  [Deterministic DunningRuleEngine (dunningRules.ts)]                         │
│  • TRAI Quiet Hours Guard: 20:00–08:00 IST                                  │
│  • RBI 7-Day Contact Cap: Max 3 contacts per 7-day rolling window           │
│  • Concession Cap: Max 10% or ₹500 autonomous waiver                        │
│  • Active PTP Guard: Suppresses retries/outreach during active commitment   │
│               │                                                             │
│               ├─► [Policy Check Passed] ──► Execute Tool Atomically         │
│               └─► [Policy Check Rejected] ──► Log Audit & Run Alternative   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CONVERSATIONAL HINGLISH RECOVERY BOT                    │
│                                                                             │
│  [WhatsApp / SMS Inbound Reply (hinglishBot.service.ts)]                    │
│               │                                                             │
│               ├─► "Salary 5th ko aayegi" ──► Creates Active PromiseToPay    │
│               ├─► "UPI timeout hua tha"  ──► Dispatches Instant 1-Click Link│
│               ├─► "Bar bar mat bhejo"    ──► Respects Opt-Out / Enables DND │
│               └─► "Maine cancel kiya tha"──► Halts Dunning & Escalates      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mathematical Timing & Resilience Models

### A. Salary-Cycle Alignment
Consumer bank accounts in India experience sharp liquidity cycles tied to salary disbursements:
$$\text{Scheduled Retry Date} = \begin{cases} 
\text{1st of Month at 09:30 AM IST} + \text{Jitter}(\pm 30\text{min}) & \text{if failure day } \in [24, 29] \\
\text{Current Time} + 48\text{ hours} + \text{Jitter}(\pm 2\text{h}) & \text{if failure day } \in [6, 23] \\
\text{Current Time} + 12\text{ hours} + \text{Jitter}(\pm 1\text{h}) & \text{if failure day } \in [1, 5]
\end{cases}$$

### B. Decorrelated Jitter Backoff
To prevent thundering herd retry waves on Indian banking core switches:
$$T_{\text{next}} = \min(T_{\text{max}}, \; \text{Random}(\text{Base}, \; 3 \times T_{\text{prev}}))$$

---

## 3. Financial Integrity & State Concurrency

1. **Integer Money Representation**: All amounts are represented strictly in integer **paise** (`amountInPaise: Int`), eliminating IEEE-754 floating-point inaccuracies.
2. **Optimistic Locking**: State updates on `RecoveryWorkflow` enforce version increment verification:
   $$\text{UPDATE recovery\_workflows SET stage} = S_{\text{new}}, \text{version} = v + 1 \text{ WHERE id} = \text{id} \text{ AND version} = v$$
3. **Immutable Audit Ledger**: Every stage transition, agent tool evaluation, policy rejection, and customer reply is recorded in the append-only `AuditLog` table.
