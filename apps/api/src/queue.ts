import { Queue } from "bullmq";
import IORedis from "ioredis";
import { agentQueueName, type AgentJobPayload } from "@project-template/shared";
import { createBullMqConnectionOptions } from "@project-template/shared/node";

export function createRedisPingConnection(redisUrl: string) {
  return new IORedis(redisUrl, {
    connectTimeout: 500,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: null
  });
}

export function createAgentQueue(redisUrl: string) {
  return new Queue<AgentJobPayload>(agentQueueName, {
    connection: createBullMqConnectionOptions(redisUrl)
  });
}
