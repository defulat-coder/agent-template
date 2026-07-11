import {
  agentJobName,
  AgentJobAcceptedSchema,
  AgentJobPayloadSchema,
  type AgentJobAccepted,
  type AgentJobName,
  type AgentJobPayload,
} from "@agent-template/shared";
import { createAgentQueue } from "./queue.js";

export type AgentJobIntake = {
  enqueue(input: unknown): Promise<AgentJobAccepted>;
};

type AgentJobQueue = {
  name: string;
  add(
    name: AgentJobName,
    payload: AgentJobPayload,
  ): Promise<{ id: string | undefined }>;
  close(): Promise<unknown>;
};

type EnqueueAgentJobOptions = {
  redisUrl: string;
  createQueue?: (redisUrl: string) => AgentJobQueue;
};

export function createAgentJobIntake(
  options: EnqueueAgentJobOptions,
): AgentJobIntake {
  return {
    enqueue(input) {
      return enqueueAgentJob(input, options);
    },
  };
}

async function enqueueAgentJob(
  input: unknown,
  options: EnqueueAgentJobOptions,
): Promise<AgentJobAccepted> {
  const payload = AgentJobPayloadSchema.parse(input);
  const queue = (options.createQueue ?? createAgentQueue)(options.redisUrl);

  try {
    const job = await queue.add(agentJobName, payload);
    return AgentJobAcceptedSchema.parse({ id: job.id, queue: queue.name });
  } finally {
    await queue.close();
  }
}
