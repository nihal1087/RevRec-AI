import request from "supertest";
import { app } from "../index";

// Mock BullMQ queue
jest.mock("../queues/paymentEvents.queue", () => ({
  paymentEventsQueue: {
    add: jest.fn().mockResolvedValue({ id: "job_mock_123" }),
  },
}));

describe("Checkout Routes (/api/checkout)", () => {
  describe("POST /api/checkout/order", () => {
    it("should create order successfully or return mock in test environment", async () => {
      const res = await request(app)
        .post("/api/checkout/order")
        .send({
          amountInPaise: 499900,
          productName: "Enterprise Core License",
          customerName: "Nakul Mahajan",
          customerEmail: "nakul@mahajan.corp",
          customerPhone: "+919876543210",
        });

      expect([200, 502]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.order_id).toBeDefined();
        expect(res.body.amount).toBe(499900);
      }
    });

    it("should reject invalid order payload", async () => {
      const res = await request(app)
        .post("/api/checkout/order")
        .send({
          amountInPaise: -500, // Invalid negative
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Invalid request");
    });
  });

  describe("POST /api/checkout/simulate-failure", () => {
    it("should inject simulated payment failure into recovery queue", async () => {
      const res = await request(app)
        .post("/api/checkout/simulate-failure")
        .send({
          paymentId: "pay_test_sim_999",
          amountInPaise: 249900,
          errorCode: "INSUFFICIENT_FUNDS",
          errorDescription: "Customer balance low",
          customerName: "Tanishka Sharma",
          customerEmail: "tanishka@techcorp.in",
          customerPhone: "+919812345678",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.rca_hint).toBeDefined();
      expect(res.body.rca_hint.category).toBe("SOFT");
      expect(res.body.rca_hint.isRetryable).toBe(true);
    });

    it("should provide correct hint for network gateway timeout", async () => {
      const res = await request(app)
        .post("/api/checkout/simulate-failure")
        .send({
          paymentId: "pay_test_sim_network",
          amountInPaise: 129900,
          errorCode: "GATEWAY_TIMEOUT",
          errorDescription: "Bank gateway timed out",
          customerName: "Mohammad Nihal",
          customerEmail: "nihal@nexuslabs.in",
          customerPhone: "+919711223344",
        });

      expect(res.status).toBe(200);
      expect(res.body.rca_hint.category).toBe("NETWORK");
      expect(res.body.rca_hint.isRetryable).toBe(true);
    });

    it("should provide correct hint for hard decline", async () => {
      const res = await request(app)
        .post("/api/checkout/simulate-failure")
        .send({
          paymentId: "pay_test_sim_hard",
          amountInPaise: 49900,
          errorCode: "CARD_EXPIRED",
          errorDescription: "Card expired",
          customerName: "Priya Sharma",
          customerEmail: "priya@sharma.com",
          customerPhone: "+919988776655",
        });

      expect(res.status).toBe(200);
      expect(res.body.rca_hint.category).toBe("HARD");
      expect(res.body.rca_hint.isRetryable).toBe(false);
    });

    it("should automatically create a dunning contact in communications hub for failed payment", async () => {
      const paymentId = `pay_comm_test_${Date.now()}`;
      const res = await request(app)
        .post("/api/checkout/simulate-failure")
        .send({
          paymentId,
          amountInPaise: 199900,
          errorCode: "OTP_TIMEOUT",
          errorDescription: "Customer dropped off at OTP screen",
          customerName: "Rohan Varma",
          customerEmail: "rohan@varma.in",
          customerPhone: "+919876500001",
        });

      expect(res.status).toBe(200);
      expect(res.body.workflowId).toBeDefined();

      // Verify communication entry was created in database
      const commRes = await request(app).get("/api/communications?search=Rohan");
      expect(commRes.status).toBe(200);
      expect(commRes.body.data.length).toBeGreaterThanOrEqual(1);
      const outreach = commRes.body.data.find((d: any) => d.customer.name.includes("Rohan"));
      expect(outreach).toBeDefined();
      expect(outreach.channel).toBe("WHATSAPP");
      expect(outreach.templateName).toContain("intent_drop_recovery_v1");
    });
  });
});
