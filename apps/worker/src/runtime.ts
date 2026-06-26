import { Worker } from "bullmq";
import { createLogger } from "@project-template/logger";
import { agentQueueName, type AgentJobPayload } from "@project-template/shared";
import { createBullMqConnectionOptions } from "@project-template/shared/node";
import { handleAgentJob, type AgentJobResult } from "./job-handler.js";
import type { WorkerEnv } from "./env.js";

type RuntimeLogger = {
  info(data: unknown, message: string): void;
  error(data: unknown, message: string): void;
};

type AgentJob = {
  id?: string;
  name: string;
  data: AgentJobPayload;
};

type AgentWorker = {
  on(event: "completed", handler: (job: AgentJob) => void): void;
  on(event: "failed", handler: (job: AgentJob | undefined, error: Error) => void): void;
  close(): Promise<void>;
};

type CreateWorkerOptions = {
  env: WorkerEnv;
  logger: RuntimeLogger;
  processJob(job: AgentJob): Promise<AgentJobResult>;
};

export type AgentWorkerRuntime = {
  close(): Promise<void>;
};

export type CreateAgentWorkerRuntimeOptions = {
  env: WorkerEnv;
  logger?: RuntimeLogger;
  createWorker?: (options: CreateWorkerOptions) => AgentWorker;
  processJob?: (payload: AgentJobPayload, env: WorkerEnv) => Promise<AgentJobResult>;
};

function createBullMqWorker(options: CreateWorkerOptions): AgentWorker {
  return new Worker<AgentJobPayload>(agentQueueName, options.processJob, {
    connection: createBullMqConnectionOptions(options.env.REDIS_URL)
  });
}

export function createAgentWorkerRuntime(options: CreateAgentWorkerRuntimeOptions): AgentWorkerRuntime {
  const logger = options.logger ?? createLogger({ service: "worker" });
  const processJob =
    options.processJob ??
    ((payload, env) => {
      return handleAgentJob(payload, env);
    });
  const worker = (options.createWorker ?? createBullMqWorker)({
    env: options.env,
    logger,
    async processJob(job) {
      logger.info({ jobId: job.id, jobName: job.name }, "processing agent job");
      return processJob(job.data, options.env);
    }
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "agent job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, error }, "agent job failed");
  });

  return {
    close() {
      return worker.close();
    }
  };
}

export function registerWorkerShutdown(runtime: AgentWorkerRuntime, signalTarget: NodeJS.Process = process): void {
  signalTarget.on("SIGTERM", async () => {
    await runtime.close();
  });
}
