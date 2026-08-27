import { processCustomerMessage } from "./hinglishBot.service";
import { HinglishIntent, DunningChannel, RecoveryStage } from "@revrec/types";
import { prisma } from "@revrec/db";

// Mock Prisma for Bot operations
jest.mock("@revrec/db", () => {
  const actual = jest.requireActual("@revrec/db");
  return {
    ...actual,
    prisma: {
      recoveryWorkflow: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      promiseToPay: {
        create: jest.fn(),
      },
      dunningContact: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    },
  };
});

describe("Hinglish Recovery Bot Service", () => {
  const mockWorkflow = {
    id: "wf_test_123",
    customerId: "cust_test_123",
    paymentId: "pay_test_123",
    amountAtRiskInPaise: 150000, // ₹1,500
    stage: RecoveryStage.OUTREACH_SENT,
    customer: { name: "Rahul Sharma" },
    payment: { gateway: "razorpay" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.recoveryWorkflow.findUnique as jest.Mock).mockResolvedValue(mockWorkflow);
    (prisma.recoveryWorkflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
    (prisma.recoveryWorkflow.update as jest.Mock).mockResolvedValue(mockWorkflow);
    (prisma.promiseToPay.create as jest.Mock).mockResolvedValue({ id: "ptp_123" });
    (prisma.dunningContact.create as jest.Mock).mockResolvedValue({ id: "cnt_123" });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: "aud_123" });
  });

  describe("Salary Delay & PTP Extraction", () => {
    it("should extract salary commitment and create PromiseToPay record", async () => {
      const response = await processCustomerMessage({
        customerId: "cust_test_123",
        workflowId: "wf_test_123",
        userMessage: "Bhai salary 5th ko aayegi tab pakka pay kar dunga",
        channel: DunningChannel.WHATSAPP,
      });

      expect(response.intent).toBe(HinglishIntent.PROMISE_TO_PAY);
      expect(response.promiseToPayId).toBeDefined();
      expect(prisma.promiseToPay.create).toHaveBeenCalled();
      expect(prisma.recoveryWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wf_test_123" },
          data: expect.objectContaining({ stage: RecoveryStage.PROMISE_RECEIVED }),
        })
      );
    });
  });

  describe("Technical Issue / UPI Timeout", () => {
    it("should generate 1-click payment link when customer reports UPI failure", async () => {
      const response = await processCustomerMessage({
        customerId: "cust_test_123",
        workflowId: "wf_test_123",
        userMessage: "UPI timeout ho gaya tha link dubara bhejo",
        channel: DunningChannel.WHATSAPP,
      });

      expect(response.intent).toBe(HinglishIntent.PAYMENT_INTENT);
      expect(response.paymentUrl).toContain("https://rzp.io/i/");
      expect(response.replyText).toContain("https://rzp.io/i/");
    });
  });

  describe("Opt-Out & DND Compliance", () => {
    it("should halt dunning when customer requests STOP/DND", async () => {
      const response = await processCustomerMessage({
        customerId: "cust_test_123",
        workflowId: "wf_test_123",
        userMessage: "Bar bar message mat karo nahi karunga payment",
        channel: DunningChannel.SMS,
      });

      expect(response.intent).toBe(HinglishIntent.CONFIRMED_REFUSAL);
      expect(prisma.recoveryWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: RecoveryStage.HALTED }),
        })
      );
    });
  });

  describe("Dispute Handling", () => {
    it("should escalate workflow when customer disputes transaction", async () => {
      const response = await processCustomerMessage({
        customerId: "cust_test_123",
        workflowId: "wf_test_123",
        userMessage: "Maine ye product order nahi kiya fraud charge hai",
        channel: DunningChannel.WHATSAPP,
      });

      expect(response.intent).toBe(HinglishIntent.DISPUTE);
      expect(prisma.recoveryWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stage: RecoveryStage.ESCALATED }),
        })
      );
    });
  });
});
