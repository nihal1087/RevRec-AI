# ⚡ RevRec: Autonomous AI Revenue Recovery Engine

> **Razorpay AI Internship — AI Revenue Recovery Track**  
> *Finding revenue that's slipping away and winning it back with bounded agency, compliant escalation, and measured audit trails.*

---

## 🎯 The Core Problem

In high-throughput fintech platforms (Stripe / Razorpay caliber), revenue leakage is rarely a single catastrophic failure. It occurs across distributed payment paths:

1. **Involuntary Churn** — Mandate / subscription payment failures, bank downtime, card degradation, and temporary insufficient balance.
2. **Intent Drop-offs** — Checkout abandonment, OTP friction, and UPI timeouts.
3. **B2B Receivables** — Overdue invoices, uncoordinated dunning, and uncollected milestone payments.
4. **Sub-optimal Retry Storms** — Naive retries during bank maintenance windows triggering rate limits or compounding customer friction.

**RevRec** provides a deterministic state machine + bounded agentic AI engine that classifies root causes, selects compliant intervention channels, and executes recovery workflows with mathematical auditability.

---

## 🏗️ Architectural Topology

```
                                  PAYMENT EVENT INGESTION
                                 (Razorpay / Stripe Webhook)
                                             │
                                             ▼
                             ┌───────────────────────────────┐
                             │  express.raw() + HMAC-SHA256  │ ◄── Timing-safe constant time
                             └───────────────┬───────────────┘
                                             │
                                             ▼
                             ┌───────────────────────────────┐
                             │    Redis SET NX Idempotency   │ ◄── 24-hr TTL fast deduplication
                             └───────────────┬───────────────┘
                                             │
                                             ▼
                             ┌───────────────────────────────┐
                             │  BullMQ Queue: payment-events │ ◄── Durable async buffer (<50ms ack)
                             └───────────────┬───────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
          [Payment Event Worker]                      [PostgreSQL State Ledger]
          • Atomic $transaction                       • Versioned Optimistic Locking
          • Customer & Payment Upsert                 • Append-only AuditLog
          • RecoveryWorkflow Creation                 • Immutable Decision Records
```

---

## 🧩 Monorepo Architecture

```
revrec/
├── apps/
│   ├── api/                 # Express.js REST API + Webhooks + BullMQ Workers
│   │   ├── src/
│   │   │   ├── config/      # Redis singleton, Winston structured logger
│   │   │   ├── middleware/  # HMAC signature verification (timing-safe)
│   │   │   ├── queues/      # BullMQ queue definitions
│   │   │   ├── routes/      # Webhook ingestion & health endpoints
│   │   │   ├── services/    # Idempotency & state services
│   │   │   └── workers/     # Distributed event processing workers
│   └── web/                 # React 18 + Vite + Tailwind CSS + Recharts
│       └── src/             # Merchant Command Center UI
├── packages/
│   ├── db/                  # Prisma ORM, PostgreSQL schema & client singleton
│   │   └── prisma/          # 8 relational models, 10 enums, composite indexes
│   └── types/               # Shared TypeScript contracts & state machine definitions
└── docker-compose.yml       # PostgreSQL 16 + Redis 7 + Redis Commander
```

---

## 🔒 Key Architectural & Security Decisions

### 1. Integer Arithmetic for Financial Integrity
All monetary values (`amountInPaise`, `ltvInPaise`, `amountRecoveredInPaise`) are strictly typed and stored as **integer paise** (`Int`), never floating point rupees. Floating point inaccuracies (`0.1 + 0.2 = 0.30000000000000004`) are catastrophic in billing systems.

### 2. Constant-Time HMAC Signature Verification
Webhook verification computes `HMAC-SHA256(rawBytes, WEBHOOK_SECRET)` and verifies signatures using `crypto.timingSafeEqual()`. Standard string comparison (`===`) short-circuits on the first mismatched character, exposing the system to side-channel timing attacks.

### 3. Two-Layer Idempotency Defense
1. **Layer 1 (Redis `SET NX`)**: Fast O(1) in-memory deduplication in the HTTP ingress path, ensuring fast (<10ms) responses.
2. **Layer 2 (PostgreSQL `UNIQUE(paymentId)`)**: Atomic constraint in `RecoveryWorkflow` preventing concurrent worker race conditions.

### 4. Bounded Agency AI Pattern
The AI agent operates under strict supervisory boundaries:
- The LLM can only suggest actions via a **discriminated union tool contract** (`AgentToolInput`).
- Every suggested action must pass through the **DunningRuleEngine** (verifying RBI contact caps, quiet hours, cooldowns) before execution.
- LLMs **never** have direct write access to payment gateways or customer ledgers.

---

## 🚦 State Machine Lifecycle

```
PENDING ──► ANALYZING ──► RETRYING ──► OUTREACH_SENT ──► PROMISE_RECEIVED ──► RECOVERED
   │           │             │               │                   │
   ▼           ▼             ▼               ▼                   ▼
HALTED      HALTED        HALTED          ESCALATED          ABANDONED
```

---

## 🚀 Quickstart & Development

### Prerequisites
- Node.js >= 20.0.0
- Docker Desktop (for PostgreSQL & Redis)

### 1. Start Infrastructure
```powershell
docker compose up -d
```

### 2. Install & Generate
```powershell
npm install
npm run db:generate --workspace=@revrec/db
```

### 3. Run Database Migrations
```powershell
npm run db:migrate --workspace=@revrec/db
```

### 4. Run API Server & Worker
```powershell
npm run dev:api
```

### 5. Run Web Merchant Dashboard
```powershell
npm run dev:web
```

### 6. Run Test Suites
```powershell
npm run test --workspaces
```

---

## 📊 Verification & Health Check

```bash
# Verify API, Database, and Redis health
curl http://localhost:3001/health
```

Expected Response:
```json
{
  "status": "ok",
  "service": "revrec-api",
  "checks": {
    "server": "ok",
    "database": "ok",
    "redis": "ok"
  }
}
```

---

## 🛣️ Implementation Roadmap

- [x] **Phase 0**: Monorepo Scaffolding, Strict Type Contracts, Docker Infrastructure
- [x] **Phase 1**: PostgreSQL Ledger, State Machines & Event Ingestion Pipeline
- [ ] **Phase 2**: Root Cause Engine (RCA) & Smart Retry Sequencer
- [ ] **Phase 3**: Bounded AI Recovery Agent & Multi-Turn Hinglish Recovery Bot
- [ ] **Phase 4**: Merchant Command Center (React + Vite + Tailwind + Recharts)
- [ ] **Phase 5**: Batch Simulation Engine, Polish & Razorpay Interview Readiness
