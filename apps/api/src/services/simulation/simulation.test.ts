import { generateRandomFailure, generateBatchScenarios } from "./scenarioGenerator";
import { runBatchSimulation } from "./batchRunner";
import { prisma } from "@revrec/db";

// Mock Prisma for simulation tests
jest.mock("@revrec/db", () => {
  const actual = jest.requireActual("@revrec/db");
  return {
    ...actual,
    prisma: {
      customer: {
        upsert: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      recoveryWorkflow: {
        create: jest.fn(),
      },
      dunningContact: {
        create: jest.fn(),
      },
      promiseToPay: {
        create: jest.fn(),
      },
      agentExecution: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    },
  };
});

describe("Simulation Engine & Scenario Generator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.upsert as jest.Mock).mockResolvedValue({ id: "cust_test_1", name: "Aarav Sharma" });
    (prisma.payment.create as jest.Mock).mockResolvedValue({ id: "pay_test_1" });
    (prisma.recoveryWorkflow.create as jest.Mock).mockResolvedValue({ id: "wf_test_1" });
    (prisma.dunningContact.create as jest.Mock).mockResolvedValue({ id: "cnt_test_1" });
    (prisma.promiseToPay.create as jest.Mock).mockResolvedValue({ id: "ptp_test_1" });
    (prisma.agentExecution.create as jest.Mock).mockResolvedValue({ id: "exec_test_1" });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: "aud_test_1" });
  });

  describe("Scenario Generator", () => {
    it("should generate a realistic synthetic Indian failure scenario", () => {
      const scenario = generateRandomFailure(0);

      expect(scenario.externalPaymentId).toBeDefined();
      expect(scenario.customerName).toBeDefined();
      expect(scenario.amountInPaise).toBeGreaterThan(0);
      expect(scenario.gatewayErrorCode).toBeDefined();
      expect(scenario.declineCategory).toBeDefined();
    });

    it("should generate a batch of requested size", () => {
      const batch = generateBatchScenarios(10);
      expect(batch.length).toBe(10);
    });
  });

  describe("Batch Simulation Runner", () => {
    it("should execute batch simulation and compute benchmark ROI lift", async () => {
      const result = await runBatchSimulation(10);

      expect(result.batchSize).toBe(10);
      expect(result.totalAtRiskInPaise).toBeGreaterThan(0);
      expect(result.revRecPerformance.recoveryRatePercent).toBeGreaterThanOrEqual(0);
      expect(result.revRecPerformance.complianceViolations).toBe(0);
      expect(result.revRecPerformance.bankDowntimeCollisions).toBe(0);
      expect(result.breakdownByStage).toBeDefined();
    });
  });
});
