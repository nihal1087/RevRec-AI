import request from "supertest";
import { app } from "../index";

describe("Analytics & Funnel Routes (/api/analytics)", () => {
  it("GET /api/analytics/summary should return financial KPIs and AI metrics", async () => {
    const res = await request(app).get("/api/analytics/summary");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.financials).toBeDefined();
    expect(res.body.data.financials.currency).toBe("INR");
    expect(res.body.data.counts).toBeDefined();
    expect(res.body.data.aiMetrics).toBeDefined();
  });

  it("GET /api/analytics/timeseries should return 14-day recovery trend points", async () => {
    const res = await request(app).get("/api/analytics/timeseries");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(14);
    expect(res.body.data[0].atRisk).toBeDefined();
    expect(res.body.data[0].recovered).toBeDefined();
  });

  it("GET /api/analytics/categories should return category and channel breakdowns", async () => {
    const res = await request(app).get("/api/analytics/categories");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.byCategory).toBeDefined();
    expect(res.body.data.byChannel).toBeDefined();
  });

  it("GET /api/analytics/funnel should return 4-stage conversion waterfall with drop-off metrics", async () => {
    const res = await request(app).get("/api/analytics/funnel");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.stages).toBeDefined();
    expect(res.body.data.stages.length).toBe(4);

    const [stage1, stage2, stage3, stage4] = res.body.data.stages;
    expect(stage1.id).toBe("intercepted");
    expect(stage1.stepNumber).toBe(1);
    expect(stage1.conversionFromPrevious).toBeGreaterThanOrEqual(0);

    expect(stage2.id).toBe("diagnosed");
    expect(stage2.stepNumber).toBe(2);

    expect(stage3.id).toBe("engaged");
    expect(stage3.stepNumber).toBe(3);

    expect(stage4.id).toBe("recovered");
    expect(stage4.stepNumber).toBe(4);
    expect(res.body.data.overallConversionRatePercent).toBeGreaterThanOrEqual(0);
  });
});
