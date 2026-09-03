import { buildOutreachTemplate, recordAutomaticFailureOutreach } from "./outreach.service";
import { DeclineCategory, DunningChannel } from "@revrec/types";
import { prisma, AuditEventType, RecoveryStage } from "@revrec/db";

jest.mock("@revrec/db", () => {
  return {
    prisma: {
      dunningContact: {
        create: jest.fn().mockResolvedValue({ id: "contact_mock_123" }),
      },
      recoveryWorkflow: {
        update: jest.fn().mockResolvedValue({ id: "wf_mock_123" }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit_mock_123" }),
      },
    },
    DunningChannel: {
      WHATSAPP: "WHATSAPP",
      SMS: "SMS",
      EMAIL: "EMAIL",
      HINGLISH_VOICE: "HINGLISH_VOICE",
      HUMAN_AGENT: "HUMAN_AGENT",
    },
    AuditEventType: {
      OUTREACH_SENT: "OUTREACH_SENT",
    },
    RecoveryStage: {
      OUTREACH_SENT: "OUTREACH_SENT",
      RETRYING: "RETRYING",
      HALTED: "HALTED",
    },
  };
});

describe("Outreach Service — Automatic Customer Communication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.dunningContact.create as jest.Mock).mockResolvedValue({ id: "contact_mock_123" });
    (prisma.recoveryWorkflow.update as jest.Mock).mockResolvedValue({ id: "wf_mock_123" });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: "audit_mock_123" });
  });

  describe("buildOutreachTemplate", () => {
    it("should build 1-click WhatsApp link template for INTENT_DROP", () => {
      const template = buildOutreachTemplate(
        DeclineCategory.INTENT_DROP,
        "Nihal",
        499900,
        "https://rzp.io/i/test-link",
        "OTP_TIMEOUT"
      );

      expect(template.channel).toBe(DunningChannel.WHATSAPP);
      expect(template.templateKey).toBe("intent_drop_recovery_v1");
      expect(template.messageText).toContain("Nihal");
      expect(template.messageText).toContain("https://rzp.io/i/test-link");
      expect(template.messageText).toContain("OTP");
    });

    it("should build salary-cycle retry advisory template for SOFT decline", () => {
      const template = buildOutreachTemplate(
        DeclineCategory.SOFT,
        "Priya",
        249900,
        "https://rzp.io/i/test-link-2",
        "INSUFFICIENT_FUNDS"
      );

      expect(template.channel).toBe(DunningChannel.WHATSAPP);
      expect(template.templateKey).toBe("salary_delay_recovery_v2");
      expect(template.messageText).toContain("Priya");
      expect(template.messageText).toContain("salary");
    });

    it("should build switch downtime alert template for NETWORK decline", () => {
      const template = buildOutreachTemplate(
        DeclineCategory.NETWORK,
        "Amit",
        150000,
        "https://rzp.io/i/test-link-3",
        "GATEWAY_TIMEOUT"
      );

      expect(template.channel).toBe(DunningChannel.WHATSAPP);
      expect(template.templateKey).toBe("transient_switch_alert_v1");
      expect(template.messageText).toContain("Amit");
    });

    it("should build SMS card update request for HARD decline", () => {
      const template = buildOutreachTemplate(
        DeclineCategory.HARD,
        "Rajesh",
        99900,
        "https://rzp.io/i/test-link-4",
        "CARD_EXPIRED"
      );

      expect(template.channel).toBe(DunningChannel.SMS);
      expect(template.templateKey).toBe("payment_method_update_v1");
      expect(template.messageText).toContain("CARD_EXPIRED");
    });
  });

  describe("recordAutomaticFailureOutreach", () => {
    it("should create DunningContact, increment outreachCount, and write AuditLog", async () => {
      const result = await recordAutomaticFailureOutreach({
        workflowId: "wf_123",
        paymentId: "pay_123",
        customerId: "cust_123",
        customerName: "Tanishka",
        amountInPaise: 499900,
        category: DeclineCategory.INTENT_DROP,
        errorCode: "OTP_TIMEOUT",
      });

      expect(result.contactId).toBe("contact_mock_123");
      expect(result.channel).toBe(DunningChannel.WHATSAPP);
      expect(result.templateKey).toBe("intent_drop_recovery_v1");

      // Verify DunningContact created with ::: format
      expect(prisma.dunningContact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: "wf_123",
            customerId: "cust_123",
            channel: DunningChannel.WHATSAPP,
            messageTemplate: expect.stringContaining("intent_drop_recovery_v1:::"),
          }),
        })
      );

      // Verify RecoveryWorkflow stage set to OUTREACH_SENT for INTENT_DROP
      expect(prisma.recoveryWorkflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "wf_123" },
          data: expect.objectContaining({
            outreachCount: { increment: 1 },
            stage: RecoveryStage.OUTREACH_SENT,
          }),
        })
      );

      // Verify AuditLog written
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: AuditEventType.OUTREACH_SENT,
            workflowId: "wf_123",
            outcome: "SUCCESS",
          }),
        })
      );
    });
  });
});
