import { runAgentDecision } from "./agent.service";
import { RecoveryStage, DeclineCategory, AgentToolName } from "@revrec/types";
import { prisma } from "@revrec/db";

// Mock Prisma for agent tests
jest.mock("@revrec/db", () => {
  const actual = jest.requireActual("@revrec/db");
  return {
    ...actual,
    prisma: {
      recoveryWorkflow: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      agentExecution: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      dunningContact: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      promiseToPay: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback({
          recoveryWorkflow: { update: jest.fn() },
          auditLog: { create: jest.fn() },
          dunningContact: { create: jest.fn() },
        });
      }),
    },
  };
});

// Mock BullMQ queue
jest.mock("../../queues/retryExecution.queue", () => ({
  retryExecutionQueue: {
    add: jest.fn().mockResolvedValue({ id: "job_123" }),
  },
}));

describe("Bounded AI Recovery Agent Service", () => {
  const mockWorkflow = {
    id: "wf_agent_test",
    customerId: "cust_agent_test",
    paymentId: "pay_agent_test",
    amountAtRiskInPaise: 499900, // ₹4,999
    stage: RecoveryStage.ANALYZING,
    retryCount: 0,
    outreachCount: 0,
    customer: {
      name: "Aditya Verma",
      riskScore: 20,
      ltvInPaise: 5000000,
      preferredChannel: "WHATSAPP",
    },
    payment: {
      gateway: "razorpay",
      gatewayErrorCode: "INSUFFICIENT_FUNDS",
      declineCategory: DeclineCategory.SOFT,
    },
    dunningContacts: [],
    promiseToPays: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.recoveryWorkflow.findUnique as jest.Mock).mockResolvedValue(mockWorkflow);
    (prisma.agentExecution.create as jest.Mock).mockResolvedValue({ id: "exec_123" });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: "aud_123" });
  });

  it("should evaluate workflow and execute approved bounded tool", async () => {
    const result = await runAgentDecision("wf_agent_test");

    expect(result.workflowId).toBe("wf_agent_test");
    expect(result.decision.selectedTool).toBeDefined();
    expect(Object.values(AgentToolName)).toContain(result.decision.selectedTool);
    expect(result.decision.confidenceScore).toBeGreaterThan(0);
    expect(result.agentExecutionId).toBe("exec_123");
    expect(prisma.agentExecution.create).toHaveBeenCalled();
  });
});
