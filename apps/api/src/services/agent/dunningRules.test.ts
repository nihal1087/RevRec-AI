import { validateAgentAction, isInsideQuietHours } from "./dunningRules";
import { AgentToolName, DeclineCategory } from "@revrec/types";
import { prisma } from "@revrec/db";

// Mock Prisma for compliance checks
jest.mock("@revrec/db", () => {
  const actual = jest.requireActual("@revrec/db");
  return {
    ...actual,
    prisma: {
      promiseToPay: {
        findFirst: jest.fn(),
      },
      dunningContact: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    },
  };
});

describe("Dunning Rule Engine & Compliance Guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Quiet Hours (TRAI DND)", () => {
    it("should detect quiet hours (e.g. 23:00 IST / 17:30 UTC)", () => {
      const lateNight = new Date("2026-03-15T17:30:00.000Z"); // 23:00 IST
      expect(isInsideQuietHours(lateNight)).toBe(true);
    });

    it("should allow outreach during business hours (e.g. 11:30 IST / 06:00 UTC)", () => {
      const morning = new Date("2026-03-15T06:00:00.000Z"); // 11:30 IST
      expect(isInsideQuietHours(morning)).toBe(false);
    });

    it("should reject direct customer communication during quiet hours", async () => {
      (prisma.promiseToPay.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.dunningContact.count as jest.Mock).mockResolvedValue(0);
      (prisma.dunningContact.findFirst as jest.Mock).mockResolvedValue(null);

      const lateNight = new Date("2026-03-15T17:30:00.000Z"); // 23:00 IST
      const result = await validateAgentAction(
        {
          tool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
          messageTemplateKey: "payment_reminder_v1",
          includeDiscount: false,
        },
        {
          customerId: "cust_123",
          workflowId: "wf_123",
          amountAtRiskInPaise: 500000,
          targetTimestamp: lateNight,
        }
      );

      expect(result.allowed).toBe(false);
      expect(result.ruleName).toBe("TRAI_QUIET_HOURS_VIOLATION");
    });
  });

  describe("Hard Decline Guard", () => {
    it("should reject automated retry on HARD decline", async () => {
      const result = await validateAgentAction(
        {
          tool: AgentToolName.RETRY_PAYMENT,
          delayMinutes: 60,
          reason: "Retry attempt",
        },
        {
          customerId: "cust_123",
          workflowId: "wf_123",
          amountAtRiskInPaise: 500000,
          declineCategory: DeclineCategory.HARD,
        }
      );

      expect(result.allowed).toBe(false);
      expect(result.ruleName).toBe("HARD_DECLINE_RETRY_PROHIBITED");
      expect(result.recommendedAlternative?.tool).toBe(AgentToolName.HALT_DUNNING);
    });
  });

  describe("RBI 7-Day Contact Frequency Limit", () => {
    it("should reject outreach when customer already contacted 3 times in past 7 days", async () => {
      (prisma.promiseToPay.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.dunningContact.count as jest.Mock).mockResolvedValue(3); // Hit 3 contacts limit

      const afternoon = new Date("2026-03-15T08:00:00.000Z"); // 13:30 IST
      const result = await validateAgentAction(
        {
          tool: AgentToolName.SEND_WHATSAPP_RECOVERY_LINK,
          messageTemplateKey: "reminder_v2",
          includeDiscount: false,
        },
        {
          customerId: "cust_123",
          workflowId: "wf_123",
          amountAtRiskInPaise: 500000,
          targetTimestamp: afternoon,
        }
      );

      expect(result.allowed).toBe(false);
      expect(result.ruleName).toBe("RBI_MAX_CONTACT_FREQUENCY_EXCEEDED");
      expect(result.recommendedAlternative?.tool).toBe(AgentToolName.ESCALATE_TO_HUMAN);
    });
  });

  describe("Discount / Concession Cap", () => {
    it("should reject discounts exceeding 10% or ₹500", async () => {
      const result = await validateAgentAction(
        {
          tool: AgentToolName.APPLY_PARTIAL_SETTLEMENT,
          settlementAmountInPaise: 100000, // ₹1,000 settlement on ₹2,000 bill (50% discount)
          discountPercent: 50,
          validForHours: 24,
          justification: "Customer request",
        },
        {
          customerId: "cust_123",
          workflowId: "wf_123",
          amountAtRiskInPaise: 200000, // ₹2,000 pending (10% max is ₹200)
        }
      );

      expect(result.allowed).toBe(false);
      expect(result.ruleName).toBe("DISCOUNT_CAP_EXCEEDED");
    });
  });
});
