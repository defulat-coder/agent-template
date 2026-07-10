import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  AgentRunsDashboardDataSchema,
  type AgentMcpAppUi,
  type AgentRunEvent,
  type AgentRunsDashboardData,
} from "@agent-template/shared";
import { z } from "zod";

export const defaultMcpToolboxServerId = "toolbox";
export const defaultMcpToolboxToolset = "agent_template_read_model";
export const defaultMcpHostConfigFileName = "mcp-host.config.json";
export const agentRunsMcpAppResourceUri = "ui://agent-template/agent-runs";

export const McpHostServerConfigSchema = z
  .object({
    url: z.string().url(),
    toolset: z.string().min(1).default(defaultMcpToolboxToolset),
    allowedTools: z
      .array(z.string().min(1))
      .min(1)
      .refine(
        (tools) => new Set(tools).size === tools.length,
        "allowedTools must not contain duplicates",
      )
      .optional(),
    allowAllToolsForDevelopment: z.boolean().default(false),
    authorizationToken: z.string().min(1).optional(),
  })
  .superRefine((server, context) => {
    if (!server.allowedTools && !server.allowAllToolsForDevelopment) {
      context.addIssue({
        code: "custom",
        message:
          "MCP server must configure allowedTools or explicitly enable allowAllToolsForDevelopment",
        path: ["allowedTools"],
      });
    }

    if (server.allowedTools && server.allowAllToolsForDevelopment) {
      context.addIssue({
        code: "custom",
        message:
          "MCP server cannot combine allowedTools with allowAllToolsForDevelopment",
        path: ["allowAllToolsForDevelopment"],
      });
    }
  });

export const McpHostConfigSchema = z.object({
  servers: z.record(z.string().min(1), McpHostServerConfigSchema).default({}),
  toolboxUrl: z.string().url().optional(),
  toolboxToolset: z.string().min(1).default(defaultMcpToolboxToolset),
});

export type McpHostConfig = z.infer<typeof McpHostConfigSchema>;

export type McpHostServer = {
  id: string;
  url: string;
  toolset: string;
  authorizationToken?: string | undefined;
};

type McpHostConfiguredServer = McpHostServer & {
  allowedTools?: string[] | undefined;
  allowAllToolsForDevelopment: boolean;
};

type McpHostServerConfigInput = {
  url: string;
  toolset: string;
  allowedTools?: unknown;
  allowAllToolsForDevelopment?: unknown;
  authorizationToken?: unknown;
};

export type McpHostInvocationContext = {
  authorizationToken?: string | undefined;
};

export type McpHostTool = {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
};

export type McpHostToolCallResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown> | undefined;
  isError?: boolean | undefined;
};

export type AgentRunSummary = {
  runId: string;
  eventCount: number;
  terminalEvent: string | null;
  firstEventAt: string;
  lastEventAt: string;
};

type McpClientLike = {
  listTools(): Promise<{
    tools: Array<{
      name: string;
      description?: string | undefined;
      inputSchema: Record<string, unknown>;
    }>;
  }>;
  callTool(input: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<McpHostToolCallResult>;
  close?(): Promise<void>;
};

type McpHostOptions = {
  createClient?: (server: McpHostServer) => Promise<McpClientLike>;
};

export function parseMcpHostConfig(
  input: Record<string, unknown>,
): McpHostConfig {
  const toolboxUrl =
    readString(input.toolboxUrl) ?? readString(input.TOOLBOX_URL);
  const toolboxToolset =
    readString(input.toolboxToolset) ??
    readString(input.TOOLBOX_TOOLSET) ??
    defaultMcpToolboxToolset;
  const servers = readServerConfigMap(input.servers);

  if (toolboxUrl && !servers[defaultMcpToolboxServerId]) {
    servers[defaultMcpToolboxServerId] = {
      allowAllToolsForDevelopment: readBoolean(
        input.MCP_HOST_ALLOW_ALL_TOOLS_FOR_DEVELOPMENT,
      ),
      toolset: toolboxToolset,
      url: toolboxUrl,
      ...(readString(input.TOOLBOX_AUTH_TOKEN)
        ? { authorizationToken: input.TOOLBOX_AUTH_TOKEN }
        : {}),
    };
  }

  const parsed = McpHostConfigSchema.parse({
    servers,
    toolboxToolset,
    toolboxUrl,
  });
  const toolboxServer = parsed.servers[defaultMcpToolboxServerId];

  return {
    ...parsed,
    toolboxToolset: toolboxServer?.toolset ?? parsed.toolboxToolset,
    ...(toolboxServer ? { toolboxUrl: toolboxServer.url } : {}),
  };
}

export function loadMcpHostConfig(
  input: Record<string, unknown> = process.env,
): McpHostConfig {
  const fileConfig = readMcpHostConfigFile(input);

  return parseMcpHostConfig({
    ...input,
    ...fileConfig,
  });
}

export function createMcpHost(
  config: McpHostConfig,
  options: McpHostOptions = {},
) {
  const createClient = options.createClient ?? createMcpClient;

  function getServers(): McpHostServer[] {
    return Object.keys(config.servers).map((serverId) => {
      const { id, toolset, url } = getConfiguredServer(serverId);

      return { id, toolset, url };
    });
  }

  async function listTools(
    serverId = defaultMcpToolboxServerId,
    context: McpHostInvocationContext = {},
  ): Promise<McpHostTool[]> {
    return withClient(serverId, context, async (client, server) => {
      const result = await client.listTools();
      return result.tools
        .filter((tool) => isToolAllowed(server, tool.name))
        .map((tool) => ({
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          inputSchema: tool.inputSchema,
        }));
    });
  }

  async function callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown> = {},
    context: McpHostInvocationContext = {},
  ): Promise<McpHostToolCallResult> {
    return withClient(serverId, context, (client, server) => {
      if (!isToolAllowed(server, name)) {
        throw new Error(
          `MCP tool ${name} is not allowed for server ${serverId}`,
        );
      }

      return client.callTool({ name, arguments: args });
    });
  }

  async function createAgentRunsDashboard(
    limit = 20,
  ): Promise<AgentRunsDashboardData> {
    const result = await callTool(
      defaultMcpToolboxServerId,
      "list-agent-runs",
      { limit },
    );
    const runs = readAgentRunRows(result);
    const completedRuns = runs.filter(
      (run) => run.terminalEvent === "agent.run.completed",
    ).length;
    const failedRuns = runs.filter(
      (run) => run.terminalEvent === "agent.run.failed",
    ).length;

    return AgentRunsDashboardDataSchema.parse({
      runs,
      metrics: {
        totalRuns: runs.length,
        completedRuns,
        failedRuns,
        failureRate: runs.length === 0 ? 0 : failedRuns / runs.length,
      },
    });
  }

  async function createAgentRunsDashboardEvents(
    prompt: string,
  ): Promise<AgentRunEvent[]> {
    if (!shouldRenderAgentRunsDashboard(prompt)) {
      return [];
    }

    const tool = "mcp-host/toolbox/list-agent-runs";
    const data = await createAgentRunsDashboard(20);

    return [
      {
        input: '{"limit":20}',
        kind: "tool-call",
        tool,
      },
      {
        kind: "tool-result",
        tool,
      },
      createAgentRunsMcpAppEvent(data),
    ];
  }

  function getAppResource(resourceUri: string) {
    if (resourceUri !== agentRunsMcpAppResourceUri) {
      throw new Error(`Unknown MCP App resource: ${resourceUri}`);
    }

    return {
      html: createAgentRunsMcpAppHtml(),
      mimeType: "text/html;profile=mcp-app" as const,
      uri: agentRunsMcpAppResourceUri,
    };
  }

  function getConfiguredServer(serverId: string): McpHostConfiguredServer {
    return getConfiguredServerForInvocation(serverId);
  }

  function getConfiguredServerForInvocation(
    serverId: string,
    context: McpHostInvocationContext = {},
  ): McpHostConfiguredServer {
    const server = config.servers[serverId];
    if (!server) throw new Error(`Unknown MCP server: ${serverId}`);

    return {
      allowAllToolsForDevelopment: server.allowAllToolsForDevelopment,
      id: serverId,
      toolset: server.toolset,
      url: `${server.url.replace(/\/$/, "")}/mcp`,
      ...(server.allowedTools ? { allowedTools: server.allowedTools } : {}),
      ...((context.authorizationToken ?? server.authorizationToken)
        ? {
            authorizationToken:
              context.authorizationToken ?? server.authorizationToken,
          }
        : {}),
    };
  }

  async function withClient<T>(
    serverId: string,
    context: McpHostInvocationContext,
    task: (
      client: McpClientLike,
      server: McpHostConfiguredServer,
    ) => Promise<T>,
  ): Promise<T> {
    const server = getConfiguredServerForInvocation(serverId, context);

    const client = await createClient(server);

    try {
      return await task(client, server);
    } finally {
      await client.close?.();
    }
  }

  return {
    getServers,
    listTools,
    callTool,
    createAgentRunsDashboard,
    createAgentRunsDashboardEvents,
    getAppResource,
  };
}

function isToolAllowed(server: McpHostConfiguredServer, toolName: string) {
  return (
    server.allowedTools?.includes(toolName) === true ||
    server.allowAllToolsForDevelopment
  );
}

function createAgentRunsMcpAppEvent(
  data: AgentRunsDashboardData,
): AgentRunEvent {
  return {
    kind: "ui",
    ui: {
      component: "mcp-app",
      id: "agent-runs-mcp-app",
      resource: {
        mimeType: "text/html;profile=mcp-app",
        uri: agentRunsMcpAppResourceUri,
      },
      serverId: defaultMcpToolboxServerId,
      title: "Agent Runs MCP App",
      toolData: data,
      toolName: "list-agent-runs",
    } satisfies AgentMcpAppUi,
  };
}

function readMcpHostConfigFile(input: Record<string, unknown>) {
  const configPath = findMcpHostConfigPath(
    process.env.INIT_CWD ?? process.cwd(),
  );
  if (!configPath) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(
      `${defaultMcpHostConfigFileName} must contain a JSON object`,
    );
  }

  return {
    servers: readFileServerConfigMap(parsed.servers, input),
    toolboxToolset:
      typeof parsed.toolboxToolset === "string"
        ? expandEnv(parsed.toolboxToolset, input)
        : undefined,
    toolboxUrl:
      typeof parsed.toolboxUrl === "string"
        ? expandEnv(parsed.toolboxUrl, input)
        : undefined,
  };
}

function readServerConfigMap(input: unknown) {
  const servers: Record<string, McpHostServerConfigInput> = {};
  if (!isRecord(input)) {
    return servers;
  }

  for (const [id, value] of Object.entries(input)) {
    if (!isRecord(value)) {
      continue;
    }

    const url = readString(value.url);
    if (!url) {
      continue;
    }

    servers[id] = {
      allowAllToolsForDevelopment: value.allowAllToolsForDevelopment,
      toolset: readString(value.toolset) ?? defaultMcpToolboxToolset,
      url,
      ...(value.allowedTools === undefined
        ? {}
        : { allowedTools: value.allowedTools }),
      ...(value.authorizationToken === undefined
        ? {}
        : { authorizationToken: value.authorizationToken }),
    };
  }

  return servers;
}

function readFileServerConfigMap(input: unknown, env: Record<string, unknown>) {
  const servers: Record<string, McpHostServerConfigInput> = {};
  if (!isRecord(input)) {
    return servers;
  }

  for (const [id, value] of Object.entries(input)) {
    if (!isRecord(value) || typeof value.url !== "string") {
      continue;
    }

    servers[id] = {
      allowAllToolsForDevelopment: value.allowAllToolsForDevelopment,
      toolset:
        typeof value.toolset === "string"
          ? expandEnv(value.toolset, env)
          : defaultMcpToolboxToolset,
      url: expandEnv(value.url, env),
      ...(value.allowedTools === undefined
        ? {}
        : { allowedTools: value.allowedTools }),
      ...(typeof value.authTokenEnv === "string" &&
      readString(env[value.authTokenEnv])
        ? { authorizationToken: env[value.authTokenEnv] }
        : {}),
    };
  }

  return servers;
}

function findMcpHostConfigPath(start: string) {
  let dir = start;

  while (true) {
    const candidate = join(dir, defaultMcpHostConfigFileName);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }

    dir = parent;
  }
}

function expandEnv(value: string, input: Record<string, unknown>) {
  return value.replace(
    /\$\{([A-Z0-9_]+)(?::-(.*?))?\}/g,
    (_match, name: string, fallback = "") => {
      const envValue = input[name];
      return typeof envValue === "string" && envValue.length > 0
        ? envValue
        : fallback;
    },
  );
}

function shouldRenderAgentRunsDashboard(prompt: string) {
  return /mcp|toolbox|统计|分析|图表|dashboard|运行|可交互/i.test(prompt);
}

function createAgentRunsMcpAppHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #ffffff; color: #0f172a; }
      main { padding: 16px; }
      header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      h1 { margin: 0; font-size: 16px; line-height: 24px; }
      p { margin: 4px 0 0; color: #64748b; font-size: 13px; line-height: 20px; }
      button { border: 1px solid #0f172a; border-radius: 6px; background: #0f172a; color: #fff; cursor: pointer; font-size: 13px; padding: 8px 10px; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
      .metric { border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; padding: 10px; }
      .metric span { display: block; color: #64748b; font-size: 12px; }
      .metric strong { display: block; margin-top: 4px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
      th { color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; }
      tr:hover td { background: #f8fafc; }
      .status { margin-top: 12px; color: #64748b; font-size: 12px; }
      @media (max-width: 640px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } table { font-size: 12px; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Agent Runs MCP App</h1>
          <p>通过 MCP Apps postMessage bridge 调用 Host-managed Toolbox 工具。</p>
        </div>
        <button id="refresh" type="button">刷新 MCP 数据</button>
      </header>
      <section class="metrics" aria-label="Agent run metrics">
        <div class="metric"><span>总运行数</span><strong id="total">0</strong></div>
        <div class="metric"><span>完成</span><strong id="completed">0</strong></div>
        <div class="metric"><span>失败</span><strong id="failed">0</strong></div>
        <div class="metric"><span>失败率</span><strong id="failureRate">0%</strong></div>
      </section>
      <table>
        <thead>
          <tr><th>Run ID</th><th>事件数</th><th>终态</th><th>开始</th><th>结束</th></tr>
        </thead>
        <tbody id="runs"></tbody>
      </table>
      <div class="status" id="status">等待 Host 初始化。</div>
    </main>
    <script>
      let requestId = 0;
      const pending = new Map();
      const button = document.getElementById("refresh");
      const status = document.getElementById("status");

      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;

        if (message.method === "ui/initialize") {
          renderDashboard(message.params && message.params.toolData);
          status.textContent = "Host 已初始化 MCP App。";
          return;
        }

        if (Object.prototype.hasOwnProperty.call(message, "id")) {
          const resolve = pending.get(message.id);
          if (!resolve) return;
          pending.delete(message.id);
          resolve(message);
        }
      });

      button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "正在通过 tools/call 请求最新数据...";
        try {
          const response = await callHostTool("list-agent-runs", { limit: 20 });
          if (response.error) throw new Error(response.error.message || "tools/call failed");
          renderRows(readToolRows(response.result));
          status.textContent = "已通过 MCP Apps tools/call 刷新。";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "刷新失败";
        } finally {
          button.disabled = false;
        }
      });

      function callHostTool(name, args) {
        const id = ++requestId;
        const message = { jsonrpc: "2.0", id, method: "tools/call", params: { arguments: args, name } };
        window.parent.postMessage(message, "*");
        return new Promise((resolve) => pending.set(id, resolve));
      }

      function renderDashboard(data) {
        if (!data) return;
        document.getElementById("total").textContent = String(data.metrics.totalRuns);
        document.getElementById("completed").textContent = String(data.metrics.completedRuns);
        document.getElementById("failed").textContent = String(data.metrics.failedRuns);
        document.getElementById("failureRate").textContent = Math.round(data.metrics.failureRate * 100) + "%";
        renderRows(data.runs);
      }

      function renderRows(rows) {
        const safeRows = Array.isArray(rows) ? rows : [];
        document.getElementById("runs").innerHTML = safeRows.map((run) => (
          "<tr><td>" + escapeHtml(run.runId) + "</td><td>" + escapeHtml(run.eventCount) + "</td><td>" +
          escapeHtml(run.terminalEvent || "运行中") + "</td><td>" + escapeHtml(run.firstEventAt) + "</td><td>" +
          escapeHtml(run.lastEventAt) + "</td></tr>"
        )).join("");
      }

      function readToolRows(result) {
        if (result && result.structuredContent && Array.isArray(result.structuredContent.result)) return result.structuredContent.result;
        if (!result || !Array.isArray(result.content)) return [];
        return result.content.flatMap((part) => {
          if (!part || part.type !== "text" || typeof part.text !== "string") return [];
          try {
            const parsed = JSON.parse(part.text);
            return Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            return [];
          }
        });
      }

      function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
      }
    </script>
  </body>
</html>`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}

export type McpHost = ReturnType<typeof createMcpHost>;

async function createMcpClient(server: McpHostServer): Promise<McpClientLike> {
  const client = new Client({
    name: "agent-template-mcp-host",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    ...(server.authorizationToken
      ? {
          requestInit: {
            headers: {
              Authorization: `Bearer ${server.authorizationToken}`,
            },
          },
        }
      : {}),
  });

  await client.connect(transport as Parameters<Client["connect"]>[0]);

  return {
    listTools: () => client.listTools(),
    callTool: async (input) =>
      normalizeMcpToolCallResult(await client.callTool(input)),
    close: () => transport.close(),
  };
}

function normalizeMcpToolCallResult(result: unknown): McpHostToolCallResult {
  if (isRecord(result) && Array.isArray(result.content)) {
    return {
      content: result.content,
      ...(isRecord(result.structuredContent)
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(typeof result.isError === "boolean"
        ? { isError: result.isError }
        : {}),
    };
  }

  return {
    content: [
      {
        text: JSON.stringify(result),
        type: "text",
      },
    ],
  };
}

function readAgentRunRows(result: McpHostToolCallResult): AgentRunSummary[] {
  const rows = Array.isArray(result.structuredContent?.result)
    ? result.structuredContent.result
    : readJsonTextContent(result.content);

  return rows.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }

    const runId = String(row.runId ?? "");
    const eventCount = Number(row.eventCount ?? 0);
    const firstEventAt = String(row.firstEventAt ?? "");
    const lastEventAt = String(row.lastEventAt ?? "");
    const terminalEvent =
      row.terminalEvent === null || row.terminalEvent === undefined
        ? null
        : String(row.terminalEvent);

    return runId
      ? [{ runId, eventCount, firstEventAt, lastEventAt, terminalEvent }]
      : [];
  });
}

function readJsonTextContent(content: unknown[]) {
  const rows: unknown[] = [];

  for (const part of content) {
    if (
      !isRecord(part) ||
      part.type !== "text" ||
      typeof part.text !== "string"
    ) {
      continue;
    }

    try {
      const parsed = JSON.parse(part.text) as unknown;
      if (Array.isArray(parsed)) {
        rows.push(...parsed);
      } else if (isRecord(parsed)) {
        rows.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
