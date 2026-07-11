import { strict as assert } from "node:assert";
import { Queue, Worker } from "bullmq";
import { createAgentJobRetryPolicy } from "../apps/api/src/queue.js";
import { createBullMqConnectionOptions } from "@agent-template/shared/node";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:16379";
const queueName = `agent-job-redelivery-verifier-${process.pid}`;
const connection = createBullMqConnectionOptions(redisUrl);
const queue = new Queue(queueName, { connection });
const attemptTimes: number[] = [];
const leaseDurationMs = 100;
const graceMs = 50;
const worker = new Worker(
  queueName,
  async () => {
    attemptTimes.push(Date.now());
    if (attemptTimes.length === 1) throw new Error("synthetic crash");
    return "recovered";
  },
  { connection },
);

async function main() {
  try {
    const job = await queue.add(
      "agent.run",
      { runId: `redelivery-${process.pid}` },
      createAgentJobRetryPolicy(leaseDurationMs, graceMs),
    );
    await waitFor(async () => (await job.getState()) === "completed");
    assert.equal(attemptTimes.length, 2);
    assert.ok(
      attemptTimes[1]! - attemptTimes[0]! >= leaseDurationMs + graceMs - 10,
      `retry arrived before lease-aware delay: ${attemptTimes.join(", ")}`,
    );
    console.log(
      "Local Agent job redelivery verification passed: BullMQ retried only after the configured execution lease and grace period.",
    );
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("BullMQ redelivery verification timed out");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
