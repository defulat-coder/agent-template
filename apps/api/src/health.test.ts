import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { getHealth } from "./health.js";

describe("GET /health", () => {
  it("returns health status without external services in tests", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      checkExternal: false
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
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent/jobs",
      payload: {
        prompt: "Summarize this template",
        requestedAt: "2026-06-26T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ id: "job-1", queue: "agent-jobs" });
    expect(calls).toEqual([
      {
        prompt: "Summarize this template",
        requestedAt: "2026-06-26T00:00:00.000Z"
      }
    ]);
  });
});

describe("getHealth", () => {
  it("aggregates adapter results through the Health interface", async () => {
    const status = await getHealth(loadEnv({ NODE_ENV: "test" }), {
      checkExternal: true,
      adapters: {
        database: async () => ({ status: "ok", message: "PostgreSQL reachable" }),
        redis: async () => ({ status: "error", message: "Redis refused connection" }),
        now: () => "2026-06-26T00:00:00.000Z"
      }
    });

    expect(status.status).toBe("degraded");
    expect(status.timestamp).toBe("2026-06-26T00:00:00.000Z");
    expect(status.queue.status).toBe("unavailable");
    expect(status.redis.message).toBe("Redis refused connection");
    expect(status.agent.runtime).toBe("claude");
  });

  it("keeps Eve Agent runtime env config available after API env parsing", async () => {
    const status = await getHealth(
      loadEnv({
        NODE_ENV: "test",
        AGENT_RUNTIME: "eve",
        EVE_AGENT_HOST: "http://127.0.0.1:3000",
        EVE_AGENT_MODEL: "eve-custom"
      }),
      {
        checkExternal: false
      }
    );

    expect(status.agent.runtime).toBe("eve");
    expect(status.agent.configured).toBe(true);
    expect(status.agent.model).toBe("eve-custom");
  });

  it("reports an unconfigured Eve Agent runtime without an Eve Agent host", async () => {
    const status = await getHealth(loadEnv({ NODE_ENV: "test", AGENT_RUNTIME: "eve", EVE_AGENT_MODEL: "eve-custom" }), {
      checkExternal: false
    });

    expect(status.agent.runtime).toBe("eve");
    expect(status.agent.configured).toBe(false);
    expect(status.agent.model).toBe("eve-custom");
  });
});
