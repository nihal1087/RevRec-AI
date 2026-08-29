import request from "supertest";
import { app } from "../index";

describe("Communications Center Routes (/api/communications)", () => {
  it("should return list of dispatches and computed omnichannel delivery metrics", async () => {
    const res = await request(app).get("/api/communications");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    // Verify delivery metrics shape
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.totalDispatches).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.whatsappReadRatePercent).toBeDefined();
    expect(res.body.metrics.smsDeliveryRatePercent).toBeDefined();
    expect(res.body.metrics.totalRecoveredViaOutreachInPaise).toBeGreaterThan(0);
  });

  it("should filter dispatches by channel = WHATSAPP", async () => {
    const res = await request(app).get("/api/communications?channel=WHATSAPP");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    res.body.data.forEach((item: any) => {
      expect(item.channel).toBe("WHATSAPP");
    });
  });

  it("should filter dispatches by search keyword", async () => {
    const res = await request(app).get("/api/communications?search=Tanishka");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((d: any) => d.customer.name.includes("Tanishka"))).toBe(true);
  });
});
