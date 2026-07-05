import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpHost, defaultMcpHostConfigFileName, loadMcpHostConfig, parseMcpHostConfig } from "./index.js";

describe("MCP Host", () => {
  it("registers the Toolbox MCP server from static env config", () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        TOOLBOX_URL: "http://toolbox:15000",
        TOOLBOX_TOOLSET: "agent_template_read_model"
      })
    );

    expect(host.getServers()).toEqual([
      {
        id: "toolbox",
        toolset: "agent_template_read_model",
        url: "http://toolbox:15000/mcp"
      }
    ]);
  });

  it("registers MCP servers from the registry config", () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        servers: {
          analytics: {
            toolset: "analytics_read_model",
            url: "http://analytics:15000"
          },
          toolbox: {
            toolset: "agent_template_read_model",
            url: "http://toolbox:15000"
          }
        }
      })
    );

    expect(host.getServers()).toEqual([
      {
        id: "analytics",
        toolset: "analytics_read_model",
        url: "http://analytics:15000/mcp"
      },
      {
        id: "toolbox",
        toolset: "agent_template_read_model",
        url: "http://toolbox:15000/mcp"
      }
    ]);
  });

  it("loads the Toolbox MCP server from filesystem config", () => {
    const previousInitCwd = process.env.INIT_CWD;
    const dir = mkdtempSync(join(tmpdir(), "mcp-host-config-"));
    process.env.INIT_CWD = dir;
    writeFileSync(
      join(dir, defaultMcpHostConfigFileName),
      JSON.stringify({
        servers: {
          toolbox: {
            toolset: "${TOOLBOX_TOOLSET:-file_toolset}",
            url: "http://file-toolbox:15000"
          }
        }
      }),
      "utf8"
    );

    try {
      expect(
        createMcpHost(
          loadMcpHostConfig({
            TOOLBOX_TOOLSET: "env_toolset",
            TOOLBOX_URL: "http://env-toolbox:15000"
          })
        ).getServers()
      ).toEqual([
        {
          id: "toolbox",
          toolset: "env_toolset",
          url: "http://file-toolbox:15000/mcp"
        }
      ]);
    } finally {
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = previousInitCwd;
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("lists tools through a Host-managed MCP client", async () => {
    const host = createMcpHost(parseMcpHostConfig({ TOOLBOX_URL: "http://toolbox:15000" }), {
      createClient: async () => ({
        async listTools() {
          return {
            tools: [
              {
                description: "List recent Agent runs",
                inputSchema: { type: "object" },
                name: "list-agent-runs"
              }
            ]
          };
        },
        async callTool() {
          throw new Error("not used");
        }
      })
    });

    await expect(host.listTools()).resolves.toEqual([
      {
        description: "List recent Agent runs",
        inputSchema: { type: "object" },
        name: "list-agent-runs"
      }
    ]);
  });

  it("builds Agent run dashboard data from a Host-managed Toolbox call", async () => {
    const host = createMcpHost(parseMcpHostConfig({ TOOLBOX_URL: "http://toolbox:15000" }), {
      createClient: async () => ({
        async listTools() {
          return { tools: [] };
        },
        async callTool(input) {
          expect(input).toEqual({ name: "list-agent-runs", arguments: { limit: 3 } });

          return {
            content: [],
            structuredContent: {
              result: [
                {
                  eventCount: 4,
                  firstEventAt: "2026-07-04T11:30:00.000Z",
                  lastEventAt: "2026-07-04T11:30:22.000Z",
                  runId: "run_knowledge_001",
                  terminalEvent: "agent.run.completed"
                },
                {
                  eventCount: 3,
                  firstEventAt: "2026-07-04T10:15:00.000Z",
                  lastEventAt: "2026-07-04T10:15:11.000Z",
                  runId: "run_invoice_001",
                  terminalEvent: "agent.run.failed"
                }
              ]
            }
          };
        }
      })
    });

    await expect(host.createAgentRunsDashboard(3)).resolves.toEqual({
      metrics: {
        completedRuns: 1,
        failedRuns: 1,
        failureRate: 0.5,
        totalRuns: 2
      },
      runs: [
        {
          eventCount: 4,
          firstEventAt: "2026-07-04T11:30:00.000Z",
          lastEventAt: "2026-07-04T11:30:22.000Z",
          runId: "run_knowledge_001",
          terminalEvent: "agent.run.completed"
        },
        {
          eventCount: 3,
          firstEventAt: "2026-07-04T10:15:00.000Z",
          lastEventAt: "2026-07-04T10:15:11.000Z",
          runId: "run_invoice_001",
          terminalEvent: "agent.run.failed"
        }
      ]
    });
  });

  it("builds Agent run dashboard UI events inside the Host boundary", async () => {
    const host = createMcpHost(parseMcpHostConfig({ TOOLBOX_URL: "http://toolbox:15000" }), {
      createClient: async () => ({
        async listTools() {
          return { tools: [] };
        },
        async callTool() {
          return {
            content: [],
            structuredContent: {
              result: [
                {
                  eventCount: 4,
                  firstEventAt: "2026-07-04T11:30:00.000Z",
                  lastEventAt: "2026-07-04T11:30:22.000Z",
                  runId: "run_knowledge_001",
                  terminalEvent: "agent.run.completed"
                }
              ]
            }
          };
        }
      })
    });

    await expect(host.createAgentRunsDashboardEvents("给我做 Agent 运行统计分析")).resolves.toEqual([
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
          component: "agent-runs-dashboard",
          data: {
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
          },
          title: "Agent 运行分析"
        }
      }
    ]);
    await expect(host.createAgentRunsDashboardEvents("hello")).resolves.toEqual([]);
  });

  it("builds Agent run dashboard data from Toolbox text rows", async () => {
    const host = createMcpHost(parseMcpHostConfig({ TOOLBOX_URL: "http://toolbox:15000" }), {
      createClient: async () => ({
        async listTools() {
          return { tools: [] };
        },
        async callTool() {
          return {
            content: [
              {
                text: JSON.stringify({
                  eventCount: 4,
                  firstEventAt: "2026-07-04T11:30:00Z",
                  lastEventAt: "2026-07-04T11:30:22Z",
                  runId: "run_knowledge_001",
                  terminalEvent: "agent.run.completed"
                }),
                type: "text"
              },
              {
                text: JSON.stringify({
                  eventCount: 3,
                  firstEventAt: "2026-07-04T10:15:00Z",
                  lastEventAt: "2026-07-04T10:15:11Z",
                  runId: "run_invoice_001",
                  terminalEvent: "agent.run.failed"
                }),
                type: "text"
              }
            ]
          };
        }
      })
    });

    await expect(host.createAgentRunsDashboard()).resolves.toMatchObject({
      metrics: {
        completedRuns: 1,
        failedRuns: 1,
        totalRuns: 2
      },
      runs: [
        { runId: "run_knowledge_001" },
        { runId: "run_invoice_001" }
      ]
    });
  });
});
