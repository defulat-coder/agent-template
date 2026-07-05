import { PassThrough } from "node:stream";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { runAgent, type AgentRunResult, type RunAgentOptions } from "@agent-template/agent";
import { createLoggerOptions } from "@agent-template/logger";
import { createMcpHost, loadMcpHostConfig, type McpHost } from "@agent-template/mcp-host";
import { AgentRunInputSchema, type AgentRunEvent } from "@agent-template/shared";
import { loadEnv, type Env } from "./env.js";
import { getHealth } from "./health.js";
import { createAgentJobIntake, type AgentJobIntake } from "./agent-job-intake.js";

export type BuildAppOptions = {
  env?: Env;
  checkExternal?: boolean;
  agentJobIntake?: AgentJobIntake;
  mcpHost?: McpHost;
  runAgent?: (input: unknown, env: Record<string, unknown>, options?: RunAgentOptions) => Promise<AgentRunResult>;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? loadEnv();
  const checkExternal = options.checkExternal ?? env.NODE_ENV !== "test";
  const agentJobIntake = options.agentJobIntake ?? createAgentJobIntake({ redisUrl: env.REDIS_URL });
  const mcpHost = options.mcpHost ?? createMcpHost(loadMcpHostConfig(env));
  const runChatAgent = options.runAgent ?? runAgent;
  const app = Fastify({ logger: createLoggerOptions({ service: "api" }) });

  void app.register(cors, { origin: env.CORS_ORIGIN });

  app.get("/health", async () => getHealth(env, { checkExternal }));

  app.post("/agent/jobs", async (request, reply) => {
    const result = await agentJobIntake.enqueue(request.body);
    return reply.code(202).send(result);
  });

  app.get("/mcp/servers", async () => ({
    servers: mcpHost.getServers()
  }));

  app.get("/mcp/servers/:serverId/tools", async (request) => {
    const { serverId } = request.params as { serverId: string };

    return {
      tools: await mcpHost.listTools(serverId)
    };
  });

  app.post("/mcp/servers/:serverId/tools/:toolName/call", async (request) => {
    const { serverId, toolName } = request.params as { serverId: string; toolName: string };

    return mcpHost.callTool(serverId, toolName, readToolArguments(request.body));
  });

  app.post("/agent/chat", async (request, reply) => {
    const input = AgentRunInputSchema.parse(request.body);
    const stream = new PassThrough();

    void (async () => {
      try {
        const result = await runChatAgent(input, env, {
          onEvent(event) {
            writeSseEvent(stream, "agent-event", event);
          }
        });

        for (const event of await mcpHost.createAgentRunsDashboardEvents(input.prompt)) {
          writeSseEvent(stream, "agent-event", event);
        }

        writeSseEvent(stream, "result", result);
      } catch (caught) {
        writeSseEvent(stream, "error", {
          message: caught instanceof Error ? caught.message : "Agent chat failed"
        });
      } finally {
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

function writeSseEvent(stream: PassThrough, event: string, data: AgentRunEvent | AgentRunResult | { message: string }) {
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}

function readToolArguments(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    return {};
  }

  return isRecord(input.arguments) ? input.arguments : input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
