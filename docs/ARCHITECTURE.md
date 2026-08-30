# RevRec: System Architecture & Technical Specification

## 1. System Overview & Core Design Principles

RevRec is a high-throughput, event-driven revenue recovery engine engineered for Indian payment gateways (Razorpay, UPI, e-NACH, Netbanking, and Cards). It intercepts failed payment webhooks, categorizes the root failure cause, and recovers revenue autonomously through bank-aware retry scheduling, bounded AI decision-making, and conversational WhatsApp engagement.

### Core Design Tenets
1. **Separation of Reasoning and Financial Execution**: Large Language Models (LLMs) evaluate multi-dimensional context to recommend recovery actions, but cannot directly execute database mutations or arbitrary payments. All decisions are validated against strict Zod contracts and evaluated by a deterministic compliance firewall before execution.
2. **Deterministic Banking Resilience**: Payment retry schedules are aligned with Indian banking characteristics, specifically avoiding nightly Core Banking System (CBS) batch windows (00:00–03:30 IST) and aligning with salary credit cycles (24th–29th).
3. **Defense-in-Depth Idempotency**: Cryptographic verification, Redis atomic locks, and database unique constraints prevent duplicate processing across distributed webhook deliveries.
4. **Integer Financial Accounting**: All monetary values are represented strictly in integer paise (`BigInt`) across all application layers, preventing floating-point rounding errors.
5. **Optimistic State Concurrency**: Workflows use monotonic version checking (`UPDATE ... WHERE id = $1 AND version = $2`) to guarantee consistency under concurrent updates.

---

## 2. End-to-End System Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Ingestion & Idempotency Layer                                 │
│                                                                        │
│   Payment Gateway Webhook (POST /api/webhooks)                         │
│                  │                                                     │
│                  ▼                                                     │
│   [Timing-Safe HMAC-SHA256 Validator] ──► (Reject 401 if forged)       │
│                  │                                                     │
│                  ▼                                                     │
│   [Redis Atomic SET NX 24h Guard]     ──► (Return 200 if duplicate)    │
│                  │                                                     │
│                  ▼                                                     │
│   [BullMQ Queue: payment-events]      ──► Redis 7 (AOF Persistence)    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 2: Deterministic RCA & Retry Sequencer                           │
│                                                                        │
│   [BullMQ Worker: paymentEvent.worker]                                 │
│                  │                                                     │
│                  ├─► [RCA Engine]                                      │
│                  │    Maps 40+ codes: SOFT, HARD, NETWORK, INTENT,     │
│                  │    MANDATE_FAILURE                                  │
│                  │                                                     │
│                  ├─► [Bank Health Guard]                               │
│                  │    Detects & evades CBS downtime (00:00–03:30 IST)   │
│                  │                                                     │
│                  └─► [Smart Retry Sequencer]                           │
│                       • Aligns 24th–29th declines to 1st of month      │
│                       • Applies ±20% decorrelated jitter               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Bounded AI Recovery Agent & Regulatory Firewall               │
│                                                                        │
│   [Agent Orchestrator: agent.service.ts]                               │
│                  │                                                     │
│                  ▼                                                     │
│   [Groq Llama 3.3 70B / Gemini 1.5 Flash (Structured JSON)]            │
│                  │                                                     │
│                  ▼                                                     │
│   [Runtime Zod Validation: AgentDecisionSchema]                        │
│   Enforces 6 bounded tool contracts                                    │
│                  │                                                     │
│                  ▼                                                     │
│   [DunningRuleEngine — UNBYPASSABLE REGULATORY FIREWALL]               │
│   • TRAI Quiet Hours Guard (20:00–08:00 IST blackout)                  │
│   • RBI 7-Day Contact Cap (Max 3 contacts in rolling 7 days)           │
│   • Concession Cap (Max 10% or ₹500 concession)                        │
│   • Active Commitment Protection (Suppresses dunning during PTP)       │
│                  │                                                     │
│                  ├─► [Policy Approved] ──► Execute Tool Atomically     │
│                  └─► [Policy Rejected] ──► Execute Compliant Fallback  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Multi-Channel Outreach & Conversational Recovery              │
│                                                                        │
│   [WhatsApp / SMS / Voice / Email Outreach]                            │
│                  │                                                     │
│                  ├─► "Salary 5th ko aayegi"  ──► Create PromiseToPay   │
│                  ├─► "UPI timeout hua tha"   ──► Send 1-Click Link     │
│                  ├─► "Bar bar mat bhejo"     ──► Enable DND & Halt     │
│                  └─► "Maine cancel kiya tha" ──► Escalate Dispute      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 5: Merchant Command Center & Audit Ledger                        │
│                                                                        │
│   [React 18 + Vite + Tailwind + Recharts]                              │
│   • Real-Time Bento KPIs, Funnel Waterfall & 14-Day Trajectory Charts │
│   • Omnichannel Communications Log & WhatsApp Chat Simulator           │
│   • Append-Only Immutable AuditLog & OCC State Transitions             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ingestion & Ingress Security

### 3.1 Constant-Time HMAC-SHA256 Verification
Webhook payloads from Razorpay are verified before any JSON deserialization occurs. The raw body buffer is preserved using `express.raw({ type: "application/json" })` on `/api/webhooks`.

Signature validation uses `crypto.timingSafeEqual` with a dummy comparison on buffer length mismatch to eliminate timing side-channel attacks:

$$\text{Signature} = \text{HMAC-SHA256}(\text{RawBodyBuffer}, \; K_{\text{secret}})$$

```typescript
export function validateWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");

  if (sigBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}
```

### 3.2 24-Hour Distributed Idempotency Key Guard
To prevent duplicate processing caused by gateway webhook retries:
1. When an event arrives, an atomic `SET revrec:webhook:idempotency:{eventId} 1 EX 86400 NX` is executed in Redis.
2. If Redis returns `null`, the event has already been received. The endpoint immediately returns `HTTP 200 {"status":"already_processed"}` without re-enqueuing.
3. If Redis returns `"OK"`, the payload is enqueued into BullMQ queue `payment-events`.

---

## 4. Root Cause Analysis & Banking Resilience

### 4.1 Decline Classification Taxonomy (`rca.service.ts`)
Payment failures are deterministically mapped into five categories based on standard gateway and ISO 8583 response codes:

```
                          ┌──────────────────────────┐
                          │ Gateway Failure Payload  │
                          └────────────┬─────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
        [SOFT DECLINE]          [HARD DECLINE]        [NETWORK / SWITCH]
       • INSUFFICIENT_FUNDS    • CARD_EXPIRED        • GATEWAY_TIMEOUT
       • LIMIT_EXCEEDED        • STOLEN_CARD         • NPCI_UNAVAILABLE
       • BALANCE_LOW           • ACCOUNT_CLOSED      • BANK_SERVER_DOWN
                │                      │                      │
                ▼                      ▼                      ▼
        (Salary Alignment)     (Immediate Halt)       (Jittered Retry)
```

| Category | Typical Error Codes | Retry Strategy | Recovery Action |
| :--- | :--- | :--- | :--- |
| `SOFT` | `INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED` | Aligned to salary cycle (1st/2nd) | Auto-retry or WhatsApp outreach with 1-click link |
| `HARD` | `CARD_EXPIRED`, `STOLEN_CARD`, `INVALID_ACCOUNT` | Non-retryable (0 retries) | Immediate workflow halt to prevent issuer penalties |
| `NETWORK` | `GATEWAY_TIMEOUT`, `NPCI_UNAVAILABLE`, `SWITCH_DOWN` | Exponential backoff with jitter | Short interval retries (10m, 30m, 2h) |
| `INTENT_DROP` | `OTP_EXPIRED`, `UPI_APP_CLOSED`, `USER_DROPPED` | Non-retryable via direct debit | Conversational WhatsApp outreach with 1-click link |
| `MANDATE_FAILURE` | `MANDATE_CANCELLED`, `AUTH_FAILED` | 48h pre-debit notice compliant | Mandate re-authorization request via WhatsApp/SMS |

### 4.2 Indian Banking Maintenance Window Evasion
Indian core banking systems (HDFC, SBI, ICICI, Axis, Kotak) run nightly batch reconciliations between **00:00 and 03:30 IST** (18:30–22:00 UTC). Executing automated retries during this window results in $>90\%$ spurious declines.

`bankHealth.service.ts` inspects candidate retry timestamps in IST:

$$T_{\text{target}} \rightarrow \begin{cases}
\text{Shift forward to 08:30 AM IST} + \text{Jitter}(\pm 15\text{m}) & \text{if } \text{Hour}_{\text{IST}}(T) \in [00:00, 03:30) \\
T & \text{otherwise}
\end{cases}$$

### 4.3 Salary-Cycle Mathematical Alignment Formula
In India, consumer liquidity is closely tied to the monthly salary cycle (disbursed between the 30th and 5th). For soft declines occurring between the 24th and 29th:

$$\text{NextRetryDate} = \begin{cases}
\text{1st of Upcoming Month at 09:30 AM IST} + \text{Jitter}(\pm 30\text{m}) & \text{if } \text{Day} \in [24, 29] \\
\text{2nd of Upcoming Month at 09:30 AM IST} + \text{Jitter}(\pm 30\text{m}) & \text{if } \text{Day} \in [30, 31] \\
\text{CurrentTime} + 48\text{ hours} + \text{Jitter}(\pm 2\text{h}) & \text{if } \text{Day} \in [6, 23] \\
\text{CurrentTime} + 12\text{ hours} + \text{Jitter}(\pm 1\text{h}) & \text{if } \text{Day} \in [1, 5]
\end{cases}$$

### 4.4 Decorrelated Jitter Algorithm
To prevent thundering herd waves on bank gateway switches:

$$T_{i+1} = \min\left(T_{\text{max}}, \; \text{Random}\left(T_{\text{base}}, \; 3 \times T_i\right)\right) \times (1 \pm \text{Jitter}_{\text{ratio}})$$

where $\text{Jitter}_{\text{ratio}} \in [0.80, 1.20]$.

---

## 5. Bounded AI Recovery Agent & Regulatory Firewall

```
┌────────────────────────────────────────────────────────┐
│ Context Assembly                                       │
│ • Amount at risk, LTV, Risk Tier, Failure Category     │
│ • Previous outreach history, Active Promise-to-Pay     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ LLM Structured JSON Inference                          │
│ • Groq Llama 3.3 70B / Gemini 1.5 Flash                │
│ • Validated against Zod AgentDecisionSchema            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ DunningRuleEngine (Regulatory Firewall)                │
│ 1. Hard Decline Check ──► Is failure non-retryable?    │
│ 2. TRAI Quiet Hours   ──► Is current time 20:00–08:00? │
│ 3. RBI Frequency Cap  ──► >= 3 contacts in 7 days?     │
│ 4. Concession Limit   ──► Discount > 10% or > ₹500?   │
│ 5. Active PTP Check   ──► Valid commitment exists?     │
└───────────────────────────┬────────────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
   [All Policies Passed]         [Policy Violation Detected]
   Execute approved tool         Log audit violation and execute
   in database transaction       safe compliant fallback tool
```

### The 6 Predefined Bounded Tools
The AI model must emit one of 6 strictly typed tool calls:
1. `retry_payment`: Schedules bank-aware auto-retry.
2. `send_whatsapp_recovery_link`: Generates frictionless 1-click checkout link.
3. `apply_partial_settlement_discount`: Applies bounded concession for hardship cases.
4. `schedule_promise_to_pay`: Records customer-committed payment date.
5. `escalate_to_human_agent`: Hands off complex or high-value enterprise cases.
6. `halt_dunning`: Halts outreach upon explicit refusal or hard failure.

---

## 6. Financial Integrity & Concurrency Architecture

### 6.1 Integer Paise Accounting
Floating point math is prohibited in the financial domain. All amounts are stored as integer paise (`BigInt` / `Int` in Prisma):
- ₹4,999.00 is stored as `499900`.
- All database aggregations (`SUM`, `AVG`) operate on integer values.
- Conversions to standard currency formats occur solely at the UI presentation boundary.

### 6.2 Optimistic Concurrency Control (OCC)
Workflows maintain a monotonic `version: Int` field. State transitions execute guarded updates:

```sql
UPDATE "RecoveryWorkflow"
SET "stage" = $1, "version" = "version" + 1, "updatedAt" = NOW()
WHERE "id" = $2 AND "version" = $3;
```

If a concurrent worker or manual merchant override updated the record in the interim, the affected row count is 0, triggering an atomic transaction rollback.

### 6.3 Append-Only Audit Ledger
Every state change, rule evaluation, policy rejection, and customer message is written to the immutable `AuditLog` table. Records are write-once and contain cryptographic references to the actor, event type, and payload snapshot.

---

## 7. Distributed Queue Mechanics & Fault Tolerance

```
[Incoming Webhook] ──► [BullMQ: payment-events]  ──► [paymentEvent.worker]
                                                            │
                                                     (Compute Schedule)
                                                            │
                                                            ▼
                       [BullMQ: retry-execution] ◄── (Delayed Enqueue)
                                │
                        (Wait for delayMs)
                                │
                                ▼
                       [retryExecution.worker]   ──► [Gateway Charge API]
```

1. **Persistent Delayed Queueing**: Retries scheduled days in advance (e.g. salary alignment) use BullMQ's native delayed job scheduler with Redis AOF persistence.
2. **Deterministic Offline Fallback**: If the LLM provider experiences latency spikes or downtime, `llmClient.ts` falls back to deterministic heuristic rules with zero system interruption.
3. **Graceful Teardown**: On `SIGTERM` or `SIGINT`, the API pauses queue consumption, allows in-flight jobs to complete within a 5-second deadline, and gracefully closes database and Redis connections.

