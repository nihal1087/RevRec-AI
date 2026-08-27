/**
 * queues/retryExecution.queue.ts — BullMQ Smart Retry Execution Queue
 *
 * Persists and schedules delayed payment retries in Redis.
 * Jobs remain in "delayed" state in Redis until their target timestamp arrives.
 */

import { Queue } from "bullmq";
import { getBullMQRedisClient } from "../config/redis";

export interface RetryExecutionJobData {
  readonly workflowId: string;
  readonly paymentId: string;
  readonly customerId: string;
  readonly attemptNumber: number;
  readonly scheduledFor: string; // ISO string
  readonly strategyUsed: string;
}

export const retryExecutionQueue = new Queue<RetryExecutionJobData>(
  "retry-execution",
  {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 5000,
      },
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
    },
  }
);

retryExecutionQueue.on("error", (err: Error) => {
  console.error("[Queue:retry-execution] ❌ Error:", err.message);
});
