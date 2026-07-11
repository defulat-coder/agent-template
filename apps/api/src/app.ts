import { PassThrough } from "node:stream";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createAgentRunLifecycle,
  runAgent,
  type AgentRunLifecycle,
  type AgentRunResult,
  type RunAgentOptions,
} from "@agent-template/agent";
import { createPrismaAgentRunRepository, prisma } from "@agent-template/db";
import { createLoggerOptions } from "@agent-template/logger";
import {
  AgentRunInputSchema,
  type AgentRunEvent,
} from "@agent-template/shared";
import { loadEnv, type Env } from "./env.js";
import { getHealth } from "./health.js";
import {
  createAgentJobIntake,
  type AgentJobIntake,
} from "./agent-job-intake.js";

export type BuildAppOptions = {
  env?: Env;
  checkExternal?: boolean;
  agentJobIntake?: AgentJobIntake;
  agentRunLifecycle?: AgentRunLifecycle;
  runAgent?: (
    input: unknown,
    env: Record<string, unknown>,
    options?: RunAgentOptions,
  ) => Promise<AgentRunResult>;
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
  const agentJobIntake =
    options.agentJobIntake ??
    createAgentJobIntake({
      agentRunLifecycle,
      redisUrl: env.REDIS_URL,
    });
  const app = Fastify({ logger: createLoggerOptions({ service: "api" }) });

  void app.register(cors, { origin: env.CORS_ORIGIN });

  app.get("/health", async () => getHealth(env, { checkExternal }));

  app.post("/agent/jobs", async (request, reply) => {
    const result = await agentJobIntake.enqueue(request.body);
    return reply.code(202).send(result);
  });

  app.get("/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await agentRunLifecycle.get(runId);
    return run ?? reply.code(404).send({ message: "Agent run not found" });
  });

  app.delete("/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await agentRunLifecycle.cancel(runId);
    return run ?? reply.code(404).send({ message: "Agent run not found" });
  });

  app.post("/agent/chat", async (request, reply) => {
    const input = AgentRunInputSchema.parse(request.body);
    const stream = new PassThrough();
    const abortController = new AbortController();
    const abortRun = () => abortController.abort("Agent Chat disconnected");
    reply.raw.once("close", abortRun);

    void (async () => {
      try {
        const result = await agentRunLifecycle.run(input, env, {
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

    return reply
      .header("Cache-Control", "no-cache, no-transform")
      .header("Connection", "keep-alive")
      .header("Content-Type", "text/event-stream; charset=utf-8")
      .header("X-Accel-Buffering", "no")
      .send(stream);
  });

  return app;
}

function writeSseEvent(
  stream: PassThrough,
  event: string,
  data: AgentRunEvent | AgentRunResult | { message: string },
) {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}
