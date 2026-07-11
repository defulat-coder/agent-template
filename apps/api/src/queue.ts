import { Queue } from "bullmq";
import IORedis from "ioredis";
import { agentQueueName, type AgentJobPayload } from "@agent-template/shared";
import { createBullMqConnectionOptions } from "@agent-template/shared/node";

export function createRedisPingConnection(redisUrl: string) {
  return new IORedis(redisUrl, {
    connectTimeout: 500,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: null,
  });
}

export function createAgentQueue(redisUrl: string) {
  const queue = new Queue<AgentJobPayload>(agentQueueName, {
    connection: createBullMqConnectionOptions(redisUrl),
  });

  return {
    name: queue.name,
    add(name: string, payload: AgentJobPayload) {
      return queue.add(name, payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        jobId: payload.runId,
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 604_800, count: 5_000 },
      });
    },
    close() {
      return queue.close();
    },
  };
}
