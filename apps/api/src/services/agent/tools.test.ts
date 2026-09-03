/**
 * tools.test.ts — Agent tool executor tests
 * Tests deterministic behaviors of the bounded recovery tools.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("@revrec/db", () => ({
  prisma: {
    recoveryWorkflow: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: any) =>
      fn({
        recoveryWorkflow: { update: jest.fn() },
        auditLog: { create: jest.fn() },
        dunningContact: { create: jest.fn() },
        promiseToPay: { create: jest.fn() },
      })
    ),
  },
  AuditEventType: {
    PAYMENT_RETRY_SCHEDULED: "PAYMENT_RETRY_SCHEDULED",
    OUTREACH_SENT: "OUTREACH_SENT",
    AGENT_TOOL_EXECUTED: "AGENT_TOOL_EXECUTED",
    WORKFLOW_HALTED: "WORKFLOW_HALTED",
    WORKFLOW_ESCALATED: "WORKFLOW_ESCALATED",
    PROMISE_SCHEDULED: "PROMISE_SCHEDULED",
  },
  PromiseStatus: { ACTIVE: "ACTIVE" },
}));

jest.mock("../../queues/retryExecution.queue", () => ({
  retryExecutionQueue: { add: jest.fn().mockResolvedValue({ id: "job_1" }) },
}));

import { prisma } from "@revrec/db";
import { executeAgentTool } from "./tools";
import { AgentToolName, RecoveryStage, DunningChannel } from "@revrec/types";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const BASE_WORKFLOW = {
  id: "wf_test_001",
  paymentId: "pay_001",
  customerId: "cust_001",
  stage: RecoveryStage.PENDING,
  retryCount: 0,
  outreachCount: 0,
  amountAtRiskInPaise: BigInt(5000000),
  haltReason: null,
  escalationReason: null,
  customer: {
    id: "cust_001",
    name: "Test Customer",
    phone: "+919999999999",
    email: "test@example.com",
    preferredChannel: DunningChannel.WHATSAPP,
  },
  payment: { id: "pay_001", externalId: "pay_rzp_001" },
};

describe("executeAgentTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.recoveryWorkflow.findUnique as jest.Mock).mockResolvedValue(BASE_WORKFLOW);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        recoveryWorkflow: { update: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        dunningContact: { create: jest.fn().mockResolvedValue({}) },
        promiseToPay: { create: jest.fn().mockResolvedValue({}) },
      })
    );
  });

  it("throws when workflow does not exist", async () => {
    (mockPrisma.recoveryWorkflow.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      executeAgentTool(
        { tool: AgentToolName.HALT_DUNNING, reason: "Test", writeOff: false },
        "nonexistent_wf"
      )
    ).rejects.toThrow("nonexistent_wf");
  });

  it("HALT_DUNNING: returns success result with correct toolExecuted", async () => {
    const result = await executeAgentTool(
      { tool: AgentToolName.HALT_DUNNING, reason: "Hard decline", writeOff: false },
      "wf_test_001"
    );
    expect(result.success).toBe(true);
    expect(result.toolExecuted).toBe(AgentToolName.HALT_DUNNING);
    expect(result.details).toMatchObject({ reason: "Hard decline" });
  });

  it("ESCALATE_TO_HUMAN: returns success result with correct toolExecuted", async () => {
    const result = await executeAgentTool(
      {
        tool: AgentToolName.ESCALATE_TO_HUMAN,
        escalationReason: "Repeated disputes",
        suggestedAction: "Offer EMI",
        priority: "HIGH",
      },
      "wf_test_001"
    );
    expect(result.success).toBe(true);
    expect(result.toolExecuted).toBe(AgentToolName.ESCALATE_TO_HUMAN);
  });

  it("RETRY_PAYMENT: returns success result with scheduled details", async () => {
    const result = await executeAgentTool(
      { tool: AgentToolName.RETRY_PAYMENT, delayMinutes: 60, reason: "Salary day retry" },
      "wf_test_001"
    );
    expect(result.success).toBe(true);
    expect(result.toolExecuted).toBe(AgentToolName.RETRY_PAYMENT);
    expect(result.details).toHaveProperty("scheduledAt");
  });

  it("throws on unsupported tool name", async () => {
    await expect(
      executeAgentTool({ tool: "UNSUPPORTED_TOOL" as AgentToolName } as never, "wf_test_001")
    ).rejects.toThrow("Unsupported agent tool");
  });
});