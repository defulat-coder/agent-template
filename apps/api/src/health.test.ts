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
    expect(body.toolbox).toEqual({
      configured: true,
      url: "http://localhost:15000",
      toolset: "agent_template_read_model"
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

describe("POST /agent/chat", () => {
  it("streams Agent events and the final result", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      mcpHost: {
        getServers: () => [],
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        createAgentRunsDashboard: async () => ({
          metrics: { completedRuns: 0, failedRuns: 0, failureRate: 0, totalRuns: 0 },
          runs: []
        }),
        createAgentRunsDashboardEvents: async () => []
      },
      async runAgent(input, _env, options) {
        options?.onEvent?.({ kind: "text", text: "Working" });

        return {
          configured: true,
          events: [{ kind: "text", text: "Working" }, { kind: "done", result: "Done" }],
          model: "kimi-for-coding",
          output: "Done",
          promptLength: (input as { prompt: string }).prompt.length,
          runtime: "claude",
          status: "completed"
        };
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent/chat",
      payload: {
        prompt: "Run agent"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('event: agent-event\ndata: {"kind":"text","text":"Working"}');
    expect(response.body).toContain('event: result\ndata: {"configured":true');
  });

  it("streams Host-managed MCP UI events for analytics prompts", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      mcpHost: {
        getServers: () => [],
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        createAgentRunsDashboard: async () => ({
          metrics: {
            completedRuns: 1,
            failedRuns: 0,
            failureRate: 0,
            totalRuns: 1
          },
          runs: [
            {
              eventCount: 4,
              firstEventAt: "2026-07-04T11:30:00.000Z",
              lastEventAt: "2026-07-04T11:30:22.000Z",
              runId: "run_knowledge_001",
              terminalEvent: "agent.run.completed"
            }
          ]
        }),
        createAgentRunsDashboardEvents: async () => [
          {
            input: "{\"limit\":20}",
            kind: "tool-call",
            tool: "mcp-host/toolbox/list-agent-runs"
          },
          {
            kind: "tool-result",
            tool: "mcp-host/toolbox/list-agent-runs"
          },
          {
            kind: "ui",
            ui: {
              component: "json-render",
              id: "agent-runs-report",
              patch: { op: "add", path: "/root", value: "report" },
              title: "Agent 运行分析"
            }
          }
        ]
      },
      async runAgent(input, _env, options) {
        options?.onEvent?.({ kind: "text", text: "Working" });

        return {
          configured: true,
          events: [{ kind: "text", text: "Working" }, { kind: "done", result: "Done" }],
          model: "kimi-for-coding",
          output: "Done",
          promptLength: (input as { prompt: string }).prompt.length,
          runtime: "claude",
          status: "completed"
        };
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent/chat",
      payload: {
        prompt: "给我做 Agent 运行统计分析"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"kind":"tool-call","tool":"mcp-host/toolbox/list-agent-runs"');
    expect(response.body).toContain('"kind":"ui","ui":{"component":"json-render"');
    expect(response.body).toContain('"patch":{"op":"add","path":"/root","value":"report"}');
  });
});

describe("MCP Host API", () => {
  it("exposes Host-managed MCP servers and tools", async () => {
    const app = buildApp({
      env: loadEnv({ NODE_ENV: "test" }),
      mcpHost: {
        getServers: () => [{ id: "toolbox", toolset: "agent_template_read_model", url: "http://toolbox:15000/mcp" }],
        listTools: async (serverId) => {
          expect(serverId).toBe("toolbox");

          return [{ inputSchema: { type: "object" }, name: "list-agent-runs" }];
        },
        callTool: async () => ({ content: [] }),
        createAgentRunsDashboard: async () => ({
          metrics: { completedRuns: 0, failedRuns: 0, failureRate: 0, totalRuns: 0 },
          runs: []
        }),
        createAgentRunsDashboardEvents: async () => []
      }
    });

    await expect(app.inject({ method: "GET", url: "/mcp/servers" }).then((response) => response.json())).resolves.toEqual({
      servers: [{ id: "toolbox", toolset: "agent_template_read_model", url: "http://toolbox:15000/mcp" }]
    });
    await expect(app.inject({ method: "GET", url: "/mcp/servers/toolbox/tools" }).then((response) => response.json())).resolves.toEqual({
      tools: [{ inputSchema: { type: "object" }, name: "list-agent-runs" }]
    });
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
    expect(status.toolbox.toolset).toBe("agent_template_read_model");
  });

  it("keeps Eve Agent runtime env config available after API env parsing", async () => {
    const status = await getHealth(
      loadEnv({
        NODE_ENV: "test",
        AGENT_RUNTIME: "eve",
        EVE_AGENT_HOST: "http://127.0.0.1:13000",
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
