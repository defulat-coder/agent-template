import { describe, expect, it } from "vitest";
import type { AgentRunLifecycle } from "@agent-template/agent";
import type { AgentRunSnapshot } from "@agent-template/shared";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { getHealth } from "./health.js";

describe("GET /health", () => {
  it("returns health status without external services in tests", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      checkExternal: false,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.service).toBe("api");
    expect(body.status).toBe("ok");
    expect(body.database.status).toBe("skipped");
    expect(body.redis.status).toBe("skipped");
    expect(body.agent.runtime).toBe("claude");
    expect(body.agent.configured).toBe(false);
    expect(body.toolbox).toEqual({
      configured: true,
      url: "http://localhost:15000",
      capabilityProfile: "development-all",
    });
  });
});

describe("POST /agent/jobs", () => {
  it("accepts Agent jobs through the app-level intake interface", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      agentJobIntake: {
        async enqueue(input) {
          calls.push(input);
          return { id: "job-1", queue: "agent-jobs" };
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent/jobs",
      payload: {
        prompt: "Summarize this template",
        requestedAt: "2026-06-26T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ id: "job-1", queue: "agent-jobs" });
    expect(calls).toHaveLength(1);
  });
});

describe("POST /agent/chat", () => {
  it("streams Agent events and the final result without an MCP proxy", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      agentRunLifecycle: createAgentRunLifecycleStub({
        async run(input, _env, options) {
          options?.onEvent?.({ kind: "text", text: "Working" });

          return {
            configured: true,
            events: [
              { kind: "text", text: "Working" },
              { kind: "done", result: "Done" },
            ],
            model: "kimi-for-coding",
            output: "Done",
            promptLength: (input as { prompt: string }).prompt.length,
            runId: "run-chat-1",
            runtime: "claude",
            status: "completed",
          };
        },
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent/chat",
      payload: { prompt: "Run agent" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain(
      'event: agent-event\ndata: {"kind":"text","text":"Working"}',
    );
    expect(response.body).toContain('event: result\ndata: {"configured":true');
    expect(response.body).toContain('"runId":"run-chat-1"');
  });
});

describe("Agent run lifecycle routes", () => {
  it("returns and cancels durable Agent runs", async () => {
    const snapshot = createRunSnapshot();
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      agentRunLifecycle: createAgentRunLifecycleStub({
        get: async (runId) => (runId === snapshot.id ? snapshot : undefined),
        cancel: async (runId) =>
          runId === snapshot.id
            ? {
                ...snapshot,
                cancelRequestedAt: "2026-06-26T00:00:01.000Z",
                completedAt: "2026-06-26T00:00:01.000Z",
                status: "cancelled",
              }
            : undefined,
      }),
    });

    const found = await app.inject({
      method: "GET",
      url: `/agent/runs/${snapshot.id}`,
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ id: snapshot.id, status: "queued" });

    const cancelled = await app.inject({
      method: "DELETE",
      url: `/agent/runs/${snapshot.id}`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      id: snapshot.id,
      status: "cancelled",
    });
  });
});

describe("getHealth", () => {
  it("aggregates adapter results through the Health interface", async () => {
    const status = await getHealth(loadEnv({ NODE_ENV: "test" }), {
      checkExternal: true,
      adapters: {
        database: async () => ({
          status: "ok",
          message: "PostgreSQL reachable",
        }),
        redis: async () => ({
          status: "error",
          message: "Redis refused connection",
        }),
        now: () => "2026-06-26T00:00:00.000Z",
      },
    });

    expect(status.status).toBe("degraded");
    expect(status.timestamp).toBe("2026-06-26T00:00:00.000Z");
    expect(status.queue.status).toBe("unavailable");
    expect(status.redis.message).toBe("Redis refused connection");
    expect(status.agent.runtime).toBe("claude");
    expect(status.toolbox.capabilityProfile).toBe("development-all");
  });

  it("keeps Eve Agent runtime env config available after API env parsing", async () => {
    const status = await getHealth(
      loadEnv({
        NODE_ENV: "test",
        AGENT_RUNTIME: "eve",
        EVE_AGENT_HOST: "http://127.0.0.1:13000",
        EVE_AGENT_MODEL: "eve-custom",
      }),
      { checkExternal: false },
    );

    expect(status.agent.runtime).toBe("eve");
    expect(status.agent.configured).toBe(true);
    expect(status.agent.model).toBe("eve-custom");
  });

  it("reports an unconfigured Eve Agent runtime without an Eve Agent host", async () => {
    const status = await getHealth(
      loadEnv({
        NODE_ENV: "test",
        AGENT_RUNTIME: "eve",
        EVE_AGENT_MODEL: "eve-custom",
      }),
      { checkExternal: false },
    );

    expect(status.agent.runtime).toBe("eve");
    expect(status.agent.configured).toBe(false);
    expect(status.agent.model).toBe("eve-custom");
  });
});

function createRunSnapshot(): AgentRunSnapshot {
  return {
    id: "run-1",
    prompt: "Run agent",
    requestedAt: "2026-06-26T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    status: "queued",
    runtime: null,
    model: null,
    output: null,
    reason: null,
    sessionId: null,
    events: [],
  };
}

function createAgentRunLifecycleStub(
  overrides: Partial<AgentRunLifecycle>,
): AgentRunLifecycle {
  const snapshot = createRunSnapshot();
  return {
    queue: async () => snapshot,
    run: async () => ({
      configured: false,
      model: "unknown",
      promptLength: snapshot.prompt.length,
      reason: "not implemented",
      runId: snapshot.id,
      runtime: "claude",
      status: "skipped",
    }),
    resume: async () => ({
      configured: false,
      model: "unknown",
      promptLength: snapshot.prompt.length,
      reason: "not implemented",
      runId: snapshot.id,
      runtime: "claude",
      status: "skipped",
    }),
    get: async () => snapshot,
    cancel: async () => snapshot,
    failQueued: async () => snapshot,
    ...overrides,
  };
}
