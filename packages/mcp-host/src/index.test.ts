import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMcpHost,
  defaultMcpHostConfigFileName,
  loadMcpHostConfig,
  parseMcpHostConfig,
  readAgentCapabilityTools,
} from "./index.js";

describe("MCP Host", () => {
  it("selects a deployment-owned Agent capability profile within the Host allowlist", () => {
    const config = parseMcpHostConfig({
      agentCapabilityProfile: "sales",
      capabilityProfiles: {
        sales: { toolbox: ["summarize-sales"] },
      },
      servers: {
        toolbox: {
          allowedTools: ["summarize-sales", "get-order"],
          toolset: "business_read_model",
          url: "http://toolbox:15000",
        },
      },
    });

    expect(readAgentCapabilityTools(config)).toEqual(["summarize-sales"]);
  });

  it("rejects an Agent capability profile that exceeds the Host allowlist", () => {
    expect(() =>
      parseMcpHostConfig({
        agentCapabilityProfile: "sales",
        capabilityProfiles: {
          sales: { toolbox: ["postgres-execute-sql"] },
        },
        servers: {
          toolbox: {
            allowedTools: ["summarize-sales"],
            toolset: "business_read_model",
            url: "http://toolbox:15000",
          },
        },
      }),
    ).toThrow("exceeds the Host allowlist");
  });

  it("fails closed when an MCP server omits its allowlist", () => {
    expect(() =>
      parseMcpHostConfig({ TOOLBOX_URL: "http://toolbox:15000" }),
    ).toThrow(
      "MCP server must configure allowedTools or explicitly enable allowAllToolsForDevelopment",
    );
  });

  it("registers the Toolbox MCP server from static env config", () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
        TOOLBOX_TOOLSET: "agent_template_read_model",
      }),
    );

    expect(host.getServers()).toEqual([
      {
        id: "toolbox",
        toolset: "agent_template_read_model",
        url: "http://toolbox:15000/mcp",
      },
    ]);
  });

  it("registers MCP servers from the registry config", () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        servers: {
          analytics: {
            allowAllToolsForDevelopment: true,
            toolset: "analytics_read_model",
            url: "http://analytics:15000",
          },
          toolbox: {
            allowAllToolsForDevelopment: true,
            toolset: "agent_template_read_model",
            url: "http://toolbox:15000",
          },
        },
      }),
    );

    expect(host.getServers()).toEqual([
      {
        id: "analytics",
        toolset: "analytics_read_model",
        url: "http://analytics:15000/mcp",
      },
      {
        id: "toolbox",
        toolset: "agent_template_read_model",
        url: "http://toolbox:15000/mcp",
      },
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
            allowAllToolsForDevelopment: true,
            toolset: "${TOOLBOX_TOOLSET:-file_toolset}",
            url: "http://file-toolbox:15000",
          },
        },
      }),
      "utf8",
    );

    try {
      expect(
        createMcpHost(
          loadMcpHostConfig({
            TOOLBOX_TOOLSET: "env_toolset",
            TOOLBOX_URL: "http://env-toolbox:15000",
          }),
        ).getServers(),
      ).toEqual([
        {
          id: "toolbox",
          toolset: "env_toolset",
          url: "http://file-toolbox:15000/mcp",
        },
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
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
        createClient: async () => ({
          async listTools() {
            return {
              tools: [
                {
                  description: "List recent Agent runs",
                  inputSchema: { type: "object" },
                  name: "list-agent-runs",
                },
              ],
            };
          },
          async callTool() {
            throw new Error("not used");
          },
        }),
      },
    );

    await expect(host.listTools()).resolves.toEqual([
      {
        description: "List recent Agent runs",
        inputSchema: { type: "object" },
        name: "list-agent-runs",
      },
    ]);
  });

  it("passes a trusted bearer token to the MCP client without exposing it", async () => {
    let clientToken: string | undefined;
    const host = createMcpHost(
      parseMcpHostConfig({
        servers: {
          toolbox: {
            allowedTools: ["list-agent-runs"],
            authorizationToken: "service-token",
            toolset: "agent_template_read_model",
            url: "http://toolbox:15000",
          },
        },
      }),
      {
        createClient: async (server) => {
          clientToken = server.authorizationToken;
          return {
            async listTools() {
              return { tools: [] };
            },
            async callTool() {
              return { content: [] };
            },
          };
        },
      },
    );

    expect(host.getServers()).toEqual([
      {
        id: "toolbox",
        toolset: "agent_template_read_model",
        url: "http://toolbox:15000/mcp",
      },
    ]);
    await host.listTools();
    expect(clientToken).toBe("service-token");
    await host.listTools("toolbox", { authorizationToken: "caller-token" });
    expect(clientToken).toBe("caller-token");
  });

  it("enforces a configured allowlist for tools/list and tools/call", async () => {
    let calledTool: string | undefined;
    const host = createMcpHost(
      parseMcpHostConfig({
        servers: {
          toolbox: {
            allowedTools: ["list-agent-runs"],
            toolset: "agent_template_read_model",
            url: "http://toolbox:15000",
          },
        },
      }),
      {
        createClient: async () => ({
          async listTools() {
            return {
              tools: [
                { inputSchema: { type: "object" }, name: "list-agent-runs" },
                {
                  inputSchema: { type: "object" },
                  name: "postgres-execute-sql",
                },
              ],
            };
          },
          async callTool(input) {
            calledTool = input.name;
            return { content: [] };
          },
        }),
      },
    );

    await expect(host.listTools()).resolves.toEqual([
      { inputSchema: { type: "object" }, name: "list-agent-runs" },
    ]);
    await expect(
      host.callTool("toolbox", "postgres-execute-sql"),
    ).rejects.toThrow(
      "MCP tool postgres-execute-sql is not allowed for server toolbox",
    );
    expect(calledTool).toBeUndefined();
    await expect(host.callTool("toolbox", "list-agent-runs")).resolves.toEqual({
      content: [],
    });
    expect(calledTool).toBe("list-agent-runs");
  });

  it("attaches certified semantic provenance to a business query result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-semantic-catalog-"));
    const catalogPath = join(dir, "catalog.yaml");
    writeFileSync(
      catalogPath,
      JSON.stringify({
        dimensions: [{ field: "Order.region", id: "region", labels: ["大区"] }],
        kind: "business-semantic-catalog",
        metrics: [
          {
            id: "gross_sales",
            labels: ["GMV"],
            resultField: "grossSales",
            tools: ["summarize-sales"],
          },
        ],
        name: "sales",
        queryContracts: [
          {
            dimensions: ["region"],
            id: "regional-sales",
            limitations: ["仅返回聚合结果"],
            metrics: ["gross_sales"],
            resultFields: ["region", "grossSales"],
            tool: "summarize-sales",
          },
        ],
        version: 2,
      }),
      "utf8",
    );

    try {
      const host = createMcpHost(
        parseMcpHostConfig({
          semanticCatalogs: {
            sales: { path: catalogPath, serverId: "toolbox" },
          },
          servers: {
            toolbox: {
              allowedTools: ["summarize-sales"],
              toolset: "sales",
              url: "http://toolbox:15000",
            },
          },
        }),
        {
          createClient: async () => ({
            async callTool() {
              return { content: [{ text: "[]", type: "text" }] };
            },
            async listTools() {
              return { tools: [] };
            },
          }),
        },
      );

      await expect(
        host.callTool("toolbox", "summarize-sales", { region: "华东" }),
      ).resolves.toMatchObject({
        structuredContent: {
          certifiedQuery: {
            catalog: { name: "sales", version: 2 },
            contract: {
              dimensions: ["region"],
              id: "regional-sales",
              metrics: ["gross_sales"],
            },
            dataFreshness: { status: "not-declared" },
            kind: "certified-query-result",
            request: { arguments: { region: "华东" } },
            tool: { name: "summarize-sales", serverId: "toolbox" },
          },
        },
      });
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("builds Agent run dashboard data from a Host-managed Toolbox call", async () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
        createClient: async () => ({
          async listTools() {
            return { tools: [] };
          },
          async callTool(input) {
            expect(input).toEqual({
              name: "list-agent-runs",
              arguments: { limit: 3 },
            });

            return {
              content: [],
              structuredContent: {
                result: [
                  {
                    eventCount: 4,
                    firstEventAt: "2026-07-04T11:30:00.000Z",
                    lastEventAt: "2026-07-04T11:30:22.000Z",
                    runId: "run_knowledge_001",
                    terminalEvent: "agent.run.completed",
                  },
                  {
                    eventCount: 3,
                    firstEventAt: "2026-07-04T10:15:00.000Z",
                    lastEventAt: "2026-07-04T10:15:11.000Z",
                    runId: "run_invoice_001",
                    terminalEvent: "agent.run.failed",
                  },
                ],
              },
            };
          },
        }),
      },
    );

    await expect(host.createAgentRunsDashboard(3)).resolves.toEqual({
      metrics: {
        completedRuns: 1,
        failedRuns: 1,
        failureRate: 0.5,
        totalRuns: 2,
      },
      runs: [
        {
          eventCount: 4,
          firstEventAt: "2026-07-04T11:30:00.000Z",
          lastEventAt: "2026-07-04T11:30:22.000Z",
          runId: "run_knowledge_001",
          terminalEvent: "agent.run.completed",
        },
        {
          eventCount: 3,
          firstEventAt: "2026-07-04T10:15:00.000Z",
          lastEventAt: "2026-07-04T10:15:11.000Z",
          runId: "run_invoice_001",
          terminalEvent: "agent.run.failed",
        },
      ],
    });
  });

  it("builds MCP App UI events inside the Host boundary", async () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
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
                    terminalEvent: "agent.run.completed",
                  },
                ],
              },
            };
          },
        }),
      },
    );

    const events =
      await host.createAgentRunsDashboardEvents("给我做 Agent 运行统计分析");

    expect(events.slice(0, 2)).toEqual([
      {
        input: '{"limit":20}',
        kind: "tool-call",
        tool: "mcp-host/toolbox/list-agent-runs",
      },
      {
        kind: "tool-result",
        tool: "mcp-host/toolbox/list-agent-runs",
      },
    ]);
    expect(events.slice(2)).toEqual([
      {
        kind: "ui",
        ui: expect.objectContaining({
          component: "mcp-app",
          resource: {
            mimeType: "text/html;profile=mcp-app",
            uri: "ui://agent-template/agent-runs",
          },
          serverId: "toolbox",
          toolName: "list-agent-runs",
        }),
      },
    ]);
    await expect(host.createAgentRunsDashboardEvents("hello")).resolves.toEqual(
      [],
    );
  });

  it("builds an MCP App event and HTML resource for interactive prompts", async () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
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
                    terminalEvent: "agent.run.completed",
                  },
                ],
              },
            };
          },
        }),
      },
    );

    const events = await host.createAgentRunsDashboardEvents(
      "用 MCP App 协议给我一个可交互统计",
    );

    expect(events).toContainEqual({
      kind: "ui",
      ui: expect.objectContaining({
        component: "mcp-app",
        resource: {
          mimeType: "text/html;profile=mcp-app",
          uri: "ui://agent-template/agent-runs",
        },
        serverId: "toolbox",
        toolName: "list-agent-runs",
      }),
    });
    expect(host.getAppResource("ui://agent-template/agent-runs")).toMatchObject(
      {
        mimeType: "text/html;profile=mcp-app",
        uri: "ui://agent-template/agent-runs",
      },
    );
    expect(
      host.getAppResource("ui://agent-template/agent-runs").html,
    ).toContain("tools/call");
  });

  it("builds Agent run dashboard data from Toolbox text rows", async () => {
    const host = createMcpHost(
      parseMcpHostConfig({
        MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT: "true",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
      {
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
                    terminalEvent: "agent.run.completed",
                  }),
                  type: "text",
                },
                {
                  text: JSON.stringify({
                    eventCount: 3,
                    firstEventAt: "2026-07-04T10:15:00Z",
                    lastEventAt: "2026-07-04T10:15:11Z",
                    runId: "run_invoice_001",
                    terminalEvent: "agent.run.failed",
                  }),
                  type: "text",
                },
              ],
            };
          },
        }),
      },
    );

    await expect(host.createAgentRunsDashboard()).resolves.toMatchObject({
      metrics: {
        completedRuns: 1,
        failedRuns: 1,
        totalRuns: 2,
      },
      runs: [{ runId: "run_knowledge_001" }, { runId: "run_invoice_001" }],
    });
  });
});
