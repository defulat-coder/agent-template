import { createAgentRunLifecycle, runAgent } from "@agent-template/agent";
import { createPrismaAgentRunRepository, prisma } from "@agent-template/db";
import { loadWorkerEnv } from "./env.js";
import { createAgentWorkerProcess, registerWorkerShutdown } from "./process.js";

const agentRunLifecycle = createAgentRunLifecycle({
  repository: createPrismaAgentRunRepository(prisma),
  execute: runAgent,
});
const workerProcess = createAgentWorkerProcess({
  env: loadWorkerEnv(),
  processJob: (payload, env) => agentRunLifecycle.resume(payload.runId, env),
});
registerWorkerShutdown(workerProcess);
