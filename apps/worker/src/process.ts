import { Worker } from "bullmq";
import type { AgentRunResult } from "@agent-template/agent";
import { createLogger } from "@agent-template/logger";
import { agentQueueName, type AgentJobPayload } from "@agent-template/shared";
import { createBullMqConnectionOptions } from "@agent-template/shared/node";
import type { WorkerEnv } from "./env.js";

type ProcessLogger = {
  info(data: unknown, message: string): void;
  error(data: unknown, message: string): void;
};

type AgentJob = {
  id?: string;
  name: string;
  data: AgentJobPayload;
};

type AgentWorker = {
  close(): Promise<void>;
};

type CreateWorkerOptions = {
  env: WorkerEnv;
  logger: ProcessLogger;
  processJob(job: AgentJob): Promise<AgentRunResult>;
  onCompleted(job: AgentJob): void;
  onFailed(job: AgentJob | undefined, error: Error): void;
};

export type AgentWorkerProcess = {
  close(): Promise<void>;
};

export type CreateAgentWorkerProcessOptions = {
  env: WorkerEnv;
  logger?: ProcessLogger;
  createWorker?: (options: CreateWorkerOptions) => AgentWorker;
  processJob(payload: AgentJobPayload, env: WorkerEnv): Promise<AgentRunResult>;
};

function createBullMqWorker(options: CreateWorkerOptions): AgentWorker {
  const worker = new Worker<AgentJobPayload>(
    agentQueueName,
    options.processJob,
    {
      connection: createBullMqConnectionOptions(options.env.REDIS_URL),
    },
  );

  worker.on("completed", options.onCompleted);
  worker.on("failed", options.onFailed);

  return worker;
}

export function createAgentWorkerProcess(
  options: CreateAgentWorkerProcessOptions,
): AgentWorkerProcess {
  const logger = options.logger ?? createLogger({ service: "worker" });
  const worker = (options.createWorker ?? createBullMqWorker)({
    env: options.env,
    logger,
    async processJob(job) {
      logger.info({ jobId: job.id, jobName: job.name }, "processing agent job");
      return options.processJob(job.data, options.env);
    },
    onCompleted(job) {
      logger.info({ jobId: job.id }, "agent job completed");
    },
    onFailed(job, error) {
      logger.error({ jobId: job?.id, error }, "agent job failed");
    },
  });

  return {
    close() {
      return worker.close();
    },
  };
}

export function registerWorkerShutdown(
  workerProcess: AgentWorkerProcess,
  signalTarget: NodeJS.Process = process,
): void {
  signalTarget.on("SIGTERM", async () => {
    await workerProcess.close();
  });
}
