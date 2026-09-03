/**
 * idempotency.service.test.ts
 * Tests for the Redis-backed webhook idempotency guard.
 */

// Mock the redis module before importing the service
const mockSet = jest.fn();
const mockDel = jest.fn();

jest.mock("../config/redis", () => ({
  getRedisClient: () => ({
    set: mockSet,
    del: mockDel,
  }),
}));

import { checkAndSetIdempotency, releaseIdempotencyKey } from "./idempotency.service";

const KEY_PREFIX = "revrec:webhook:idempotency:";

describe("checkAndSetIdempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when the key is newly set (first time = new event)", async () => {
    mockSet.mockResolvedValueOnce("OK");

    const result = await checkAndSetIdempotency("payment.failed:pay_test001");

    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      `${KEY_PREFIX}payment.failed:pay_test001`,
      expect.any(String), // ISO timestamp
      "EX",
      86400,
      "NX"
    );
  });

  it("returns false when key already exists (duplicate event)", async () => {
    mockSet.mockResolvedValueOnce(null); // null = key already existed

    const result = await checkAndSetIdempotency("payment.failed:pay_test001");

    expect(result).toBe(false);
  });

  it("sets TTL of 86400 seconds (24 hours)", async () => {
    mockSet.mockResolvedValueOnce("OK");

    await checkAndSetIdempotency("payment.failed:pay_test002");

    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      86400,
      "NX"
    );
  });

  it("uses correct Redis key prefix", async () => {
    mockSet.mockResolvedValueOnce("OK");

    await checkAndSetIdempotency("sub.charge.failed:sub_abc123");

    const callArgs = mockSet.mock.calls[0] as string[];
    expect(callArgs[0]).toBe(`${KEY_PREFIX}sub.charge.failed:sub_abc123`);
  });

  it("propagates Redis errors to caller (caller handles fallback)", async () => {
    mockSet.mockRejectedValueOnce(new Error("Redis connection timeout"));

    await expect(checkAndSetIdempotency("event:id")).rejects.toThrow("Redis connection timeout");
  });
});

describe("releaseIdempotencyKey", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDel.mockResolvedValue(1);
  });

  it("deletes the idempotency key from Redis", async () => {
    await releaseIdempotencyKey("payment.failed:pay_test001");

    expect(mockDel).toHaveBeenCalledWith(`${KEY_PREFIX}payment.failed:pay_test001`);
  });

  it("resolves without throwing even when key does not exist", async () => {
    mockDel.mockResolvedValueOnce(0); // 0 = key did not exist
    await expect(releaseIdempotencyKey("payment.failed:nonexistent")).resolves.toBeUndefined();
  });
});
