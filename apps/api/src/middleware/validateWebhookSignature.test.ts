import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { validateWebhookSignature } from "./validateWebhookSignature";

describe("validateWebhookSignature Middleware", () => {
  const secret = "test_webhook_secret_12345678901234567890";
  const originalSecret = process.env["WEBHOOK_SECRET"];

  beforeAll(() => {
    process.env["WEBHOOK_SECRET"] = secret;
  });

  afterAll(() => {
    process.env["WEBHOOK_SECRET"] = originalSecret;
  });

  it("should reject requests without signature header with 401", () => {
    const req = {
      headers: {},
      body: Buffer.from(JSON.stringify({ test: true })),
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    validateWebhookSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should reject invalid HMAC signature with 401", () => {
    const rawPayload = JSON.stringify({ event: "payment.failed" });
    const req = {
      headers: { "x-razorpay-signature": "deadbeef12345678" },
      body: Buffer.from(rawPayload),
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    validateWebhookSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should accept valid HMAC signature and parse json into req.body", () => {
    const rawPayload = JSON.stringify({ event: "payment.failed", amount: 5000 });
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(Buffer.from(rawPayload))
      .digest("hex");

    const req = {
      headers: { "x-razorpay-signature": validSignature },
      body: Buffer.from(rawPayload),
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    validateWebhookSignature(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ event: "payment.failed", amount: 5000 });
  });
});
