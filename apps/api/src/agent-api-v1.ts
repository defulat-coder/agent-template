import { timingSafeEqual } from "node:crypto";
import { PassThrough } from "node:stream";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import {
  AgentConversationNotFoundError,
  AgentConversationRuntimeConflictError,
  getAgentRuntimeStateFromEnv,
  type AgentConversationLifecycle,
  type AgentRunLifecycle,
} from "@agent-template/agent";
import {
  AgentConversationBusyError,
  AgentConversationCreateInputSchema,
  AgentConversationListQuerySchema,
  AgentRunInputSchema,
  AgentRunListQuerySchema,
  type AgentRunStreamFrame,
} from "@agent-template/shared";
import type { AgentJobIntake } from "./agent-job-intake.js";
import type { Env } from "./env.js";
import { sendEventStream, writeSseEvent } from "./sse.js";

export type V1AgentApiDependencies = {
  env: Env;
  agentConversationLifecycle: AgentConversationLifecycle;
  agentJobIntake: AgentJobIntake;
  agentRunLifecycle: AgentRunLifecycle;
};

const AgentRunEventsQuerySchema = z.object({
  afterSequence: z.coerce.number().int().min(-1).default(-1),
  follow: z.enum(["true", "false"]).optional(),
});

export function registerV1AgentApi(
  app: FastifyInstance,
  input: V1AgentApiDependencies,
) {
  registerErrorHandler(app);
  registerAuthentication(app, input.env);

  app.get("/v1/agent/meta", async () => ({
    protocolVersion: "1",
    capabilities: [
      "conversations",
      "run-list",
      "run-stream",
      "run-stream-resume",
      "run-cancel",
      "human-input",
      "jobs",
    ],
  }));

  app.post("/v1/agent/conversations", async (request, reply) => {
    const body = AgentConversationCreateInputSchema.parse(request.body ?? {});
    const runtime = getAgentRuntimeStateFromEnv(input.env).runtime;
    return reply
      .code(201)
      .send(await input.agentConversationLifecycle.create(body, runtime));
  });

  app.get("/v1/agent/conversations", async (request) => {
    const query = AgentConversationListQuerySchema.parse(request.query ?? {});
    return input.agentConversationLifecycle.list(query);
  });

  app.get("/v1/agent/conversations/:conversationId", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const conversation =
      await input.agentConversationLifecycle.get(conversationId);
    return (
      conversation ??
      sendError(reply, 404, "NOT_FOUND", "Agent conversation 不存在")
    );
  });

  app.post(
    "/v1/agent/conversations/:conversationId/runs",
    async (request, reply) => {
      const { conversationId } = request.params as { conversationId: string };
      const runInput = AgentRunInputSchema.parse(request.body);
      const stream = new PassThrough();
      let acceptedRunId: string | undefined;
      let sequence = 0;

      void input.agentConversationLifecycle
        .send(conversationId, runInput, input.env, {
          onAccepted(run) {
            acceptedRunId = run.id;
            sequence = run.events.length;
            writeFrame(stream, {
              type: "accepted",
              runId: run.id,
              conversationId,
            });
          },
          onEvent(event) {
            if (!acceptedRunId) return;
            writeFrame(stream, {
              type: "event",
              runId: acceptedRunId,
              sequence,
              event,
            });
            sequence += 1;
          },
        })
        .then((result) => {
          if (result.runId) {
            writeFrame(stream, {
              type: "terminal",
              runId: result.runId,
              result,
            });
          }
        })
        .catch((error) => writeStreamError(stream, error))
        .finally(() => stream.end());

      return sendEventStream(reply, stream);
    },
  );

  app.post("/v1/agent/runs", async (request, reply) => {
    const runInput = AgentRunInputSchema.parse(request.body);
    const stream = new PassThrough();
    void startStandaloneRun(
      stream,
      input.agentRunLifecycle,
      runInput,
      input.env,
    );
    return sendEventStream(reply, stream);
  });

  app.get("/v1/agent/runs", async (request) => {
    const raw = request.query as Record<string, unknown>;
    const query = AgentRunListQuerySchema.parse({
      ...raw,
      ...(typeof raw.status === "string"
        ? { status: raw.status.split(",").filter(Boolean) }
        : {}),
    });
    return input.agentRunLifecycle.list(query);
  });

  app.get("/v1/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await input.agentRunLifecycle.get(runId);
    return run ?? sendError(reply, 404, "NOT_FOUND", "Agent run 不存在");
  });

  app.get("/v1/agent/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const query = AgentRunEventsQuerySchema.parse(request.query ?? {});
    const afterSequence = query.afterSequence;
    if (query.follow !== "true") {
      const run = await input.agentRunLifecycle.get(runId);
      if (!run) {
        return sendError(reply, 404, "NOT_FOUND", "Agent run 不存在");
      }
      return {
        items: run.events.filter((event) => event.sequence > afterSequence),
      };
    }
    const stream = new PassThrough();
    let closed = false;
    reply.raw.once("close", () => {
      closed = true;
    });
    void watchRun(
      stream,
      input.agentRunLifecycle,
      runId,
      afterSequence,
      () => closed,
    );
    return sendEventStream(reply, stream);
  });

  app.delete("/v1/agent/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await input.agentRunLifecycle.cancel(runId);
    return run ?? sendError(reply, 404, "NOT_FOUND", "Agent run 不存在");
  });

  app.post("/v1/agent/jobs", async (request, reply) => {
    const result = await input.agentJobIntake.enqueue(request.body);
    return reply.code(202).send({ runId: result.id });
  });
}

async function startStandaloneRun(
  stream: PassThrough,
  lifecycle: AgentRunLifecycle,
  input: unknown,
  env: Env,
) {
  try {
    const queued = await lifecycle.queue(input);
    let sequence = queued.events.length;
    writeFrame(stream, { type: "accepted", runId: queued.id });
    const result = await lifecycle.resume(queued.id, env, {
      onEvent(event) {
        writeFrame(stream, {
          type: "event",
          runId: queued.id,
          sequence,
          event,
        });
        sequence += 1;
      },
    });
    writeFrame(stream, {
      type: "terminal",
      runId: queued.id,
      result,
    });
  } catch (error) {
    writeStreamError(stream, error);
  } finally {
    stream.end();
  }
}

async function watchRun(
  stream: PassThrough,
  lifecycle: AgentRunLifecycle,
  runId: string,
  afterSequence: number,
  isClosed: () => boolean,
) {
  let cursor = afterSequence;
  try {
    while (!isClosed()) {
      const observation = await lifecycle.observe(runId, cursor);
      if (!observation) throw new Error(`Agent run ${runId} not found`);
      for (const record of observation.events) {
        writeSseEvent(
          stream,
          "frame",
          {
            type: "event",
            runId,
            sequence: record.sequence,
            event: record.event,
          } satisfies AgentRunStreamFrame,
          String(record.sequence),
        );
        cursor = record.sequence;
      }
      if (observation.terminal) {
        writeFrame(stream, {
          type: "terminal",
          runId,
          result: observation.result,
        });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch (error) {
    writeStreamError(stream, error);
  } finally {
    stream.end();
  }
}

function registerAuthentication(app: FastifyInstance, env: Env) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/v1/agent") || !env.AGENT_API_TOKEN) return;
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!safeEqual(token, env.AGENT_API_TOKEN)) {
      return sendError(
        reply,
        401,
        "AUTH_REQUIRED",
        "需要有效的 Agent API Token",
      );
    }
  });
}

function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (!request.url.startsWith("/v1/")) return reply.send(error);
    if (error instanceof ZodError) {
      return sendError(reply, 400, "INVALID_INPUT", "请求参数无效", false);
    }
    if (error instanceof AgentConversationNotFoundError) {
      return sendError(reply, 404, "NOT_FOUND", "Agent conversation 不存在");
    }
    if (error instanceof AgentConversationRuntimeConflictError) {
      return sendError(reply, 409, "RUNTIME_CONFLICT", error.message);
    }
    if (error instanceof AgentConversationBusyError) {
      return sendError(
        reply,
        409,
        "CONVERSATION_BUSY",
        "Agent conversation 已有一个运行中的 Agent run",
      );
    }
    request.log.error(error);
    return sendError(reply, 500, "INTERNAL_ERROR", "服务端处理失败", true);
  });
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  retryable = false,
) {
  return reply.code(status).send({
    error: { code, message, retryable },
  });
}

function writeFrame(stream: PassThrough, frame: AgentRunStreamFrame) {
  writeSseEvent(stream, "frame", frame);
}

function writeStreamError(stream: PassThrough, error: unknown) {
  writeSseEvent(stream, "error", {
    error: describeError(error),
  });
}

function describeError(error: unknown) {
  if (error instanceof AgentConversationNotFoundError) {
    return {
      code: "NOT_FOUND",
      message: "Agent conversation 不存在",
      retryable: false,
    };
  }
  if (error instanceof AgentConversationRuntimeConflictError) {
    return {
      code: "RUNTIME_CONFLICT",
      message: error.message,
      retryable: false,
    };
  }
  if (error instanceof AgentConversationBusyError) {
    return {
      code: "CONVERSATION_BUSY",
      message: "Agent conversation 已有一个运行中的 Agent run",
      retryable: true,
    };
  }
  return {
    code: "STREAM_FAILED",
    message: error instanceof Error ? error.message : "Agent stream failed",
    retryable: false,
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
