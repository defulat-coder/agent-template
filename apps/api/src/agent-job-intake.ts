import {
  agentJobName,
  AgentJobAcceptedSchema,
  AgentJobRequestSchema,
  type AgentJobAccepted,
  type AgentJobName,
  type AgentJobPayload,
} from "@agent-template/shared";
import type { AgentRunLifecycle } from "@agent-template/agent";
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
  agentRunLifecycle: AgentRunLifecycle;
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
  const request = AgentJobRequestSchema.parse(input);
  const run = await options.agentRunLifecycle.queue(request);
  const payload = { runId: run.id } satisfies AgentJobPayload;
  const queue = (options.createQueue ?? createAgentQueue)(options.redisUrl);

  try {
    await queue.add(agentJobName, payload);
    return AgentJobAcceptedSchema.parse({ id: run.id, queue: queue.name });
  } catch (error) {
    await options.agentRunLifecycle.failQueued(
      run.id,
      error instanceof Error ? error.message : "Agent job enqueue failed",
    );
    throw error;
  } finally {
    await queue.close();
  }
}
