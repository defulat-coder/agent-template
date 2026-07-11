import { PassThrough } from "node:stream";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createAgentConversationLifecycle,
  createAgentRunLifecycle,
  runAgent,
  type AgentConversationLifecycle,
  type AgentExecutionResult,
  type AgentRunLifecycle,
  type RunAgentOptions,
} from "@agent-template/agent";
import {
  createPrismaAgentConversationRepository,
  createPrismaAgentRunRepository,
  prisma,
} from "@agent-template/db";
import { createLoggerOptions } from "@agent-template/logger";
import { AgentRunInputSchema } from "@agent-template/shared";
import { areLegacyAgentRoutesEnabled, loadEnv, type Env } from "./env.js";
import { getHealth } from "./health.js";
import {
  createAgentJobIntake,
  type AgentJobIntake,
} from "./agent-job-intake.js";
import { registerV1AgentApi } from "./agent-api-v1.js";
import { sendEventStream, writeSseEvent } from "./sse.js";

export type BuildAppOptions = {
  env?: Env;
  checkExternal?: boolean;
  agentConversationLifecycle?: AgentConversationLifecycle;
  agentJobIntake?: AgentJobIntake;
  agentRunLifecycle?: AgentRunLifecycle;
  runAgent?: (
    input: unknown,
    env: Record<string, unknown>,
    options?: RunAgentOptions,
  ) => Promise<AgentExecutionResult>;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? loadEnv();
  const checkExternal = options.checkExternal ?? env.NODE_ENV !== "test";
  const runChatAgent = options.runAgent ?? runAgent;
  const agentRunLifecycle =
    options.agentRunLifecycle ??
    createAgentRunLifecycle({
      repository: createPrismaAgentRunRepository(prisma),
      execute: runChatAgent,
    });
  const agentConversationLifecycle =
    options.agentConversationLifecycle ??
    createAgentConversationLifecycle({
      repository: createPrismaAgentConversationRepository(prisma),
      runs: agentRunLifecycle,
    });
  const agentJobIntake =
    options.agentJobIntake ??
    createAgentJobIntake({
      agentRunLifecycle,
      redisUrl: env.REDIS_URL,
    });
  const app = Fastify({ logger: createLoggerOptions({ service: "api" }) });

  void app.register(cors, { origin: env.CORS_ORIGIN });

  app.get("/health", async () => getHealth(env, { checkExternal }));

  if (areLegacyAgentRoutesEnabled(env)) {
    registerLegacyAgentRoutes(app, {
      env,
      agentJobIntake,
      agentRunLifecycle,
    });
  }
  registerV1AgentApi(app, {
    env,
    agentConversationLifecycle,
    agentJobIntake,
    agentRunLifecycle,
  });

  return app;
}

function registerLegacyAgentRoutes(
  app: FastifyInstance,
  input: {
    env: Env;
    agentJobIntake: AgentJobIntake;
    agentRunLifecycle: AgentRunLifecycle;
  },
) {
  app.post("/agent/jobs", async (request, reply) => {
    const result = await input.agentJobIntake.enqueue(request.body);
    return reply.code(202).send(result);
  });

  app.get("/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await input.agentRunLifecycle.get(runId);
    return run ?? reply.code(404).send({ message: "Agent run not found" });
  });

  app.delete("/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await input.agentRunLifecycle.cancel(runId);
    return run ?? reply.code(404).send({ message: "Agent run not found" });
  });

  app.post("/agent/chat", async (request, reply) => {
    const runInput = AgentRunInputSchema.parse(request.body);
    const stream = new PassThrough();
    const abortController = new AbortController();
    const abortRun = () => abortController.abort("Agent Chat disconnected");
    reply.raw.once("close", abortRun);

    void (async () => {
      try {
        const result = await input.agentRunLifecycle.run(runInput, input.env, {
          abortSignal: abortController.signal,
          onEvent(event) {
            writeSseEvent(stream, "agent-event", event);
          },
        });
        writeSseEvent(stream, "result", result);
      } catch (caught) {
        writeSseEvent(stream, "error", {
          message:
            caught instanceof Error ? caught.message : "Agent chat failed",
        });
      } finally {
        reply.raw.off("close", abortRun);
        stream.end();
      }
    })();

    return sendEventStream(reply, stream);
  });
}
