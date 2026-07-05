import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentRunsDashboardDataSchema, type AgentRunEvent, type AgentRunsDashboardData } from "@agent-template/shared";
import { z } from "zod";

export const defaultMcpToolboxServerId = "toolbox";
export const defaultMcpToolboxToolset = "agent_template_read_model";
export const defaultMcpHostConfigFileName = "mcp-host.config.json";

export const McpHostServerConfigSchema = z.object({
  url: z.string().url(),
  toolset: z.string().min(1).default(defaultMcpToolboxToolset)
});

export const McpHostConfigSchema = z.object({
  servers: z.record(z.string().min(1), McpHostServerConfigSchema).default({}),
  toolboxUrl: z.string().url().optional(),
  toolboxToolset: z.string().min(1).default(defaultMcpToolboxToolset)
});

export type McpHostConfig = z.infer<typeof McpHostConfigSchema>;

export type McpHostServer = {
  id: string;
  url: string;
  toolset: string;
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
  listTools(): Promise<{ tools: Array<{ name: string; description?: string | undefined; inputSchema: Record<string, unknown> }> }>;
  callTool(input: { name: string; arguments?: Record<string, unknown> }): Promise<McpHostToolCallResult>;
  close?(): Promise<void>;
};

type McpHostOptions = {
  createClient?: (server: McpHostServer) => Promise<McpClientLike>;
};

export function parseMcpHostConfig(input: Record<string, unknown>): McpHostConfig {
  const toolboxUrl = readString(input.toolboxUrl) ?? readString(input.TOOLBOX_URL);
  const toolboxToolset = readString(input.toolboxToolset) ?? readString(input.TOOLBOX_TOOLSET) ?? defaultMcpToolboxToolset;
  const servers = readServerConfigMap(input.servers);

  if (toolboxUrl && !servers[defaultMcpToolboxServerId]) {
    servers[defaultMcpToolboxServerId] = {
      toolset: toolboxToolset,
      url: toolboxUrl
    };
  }

  const parsed = McpHostConfigSchema.parse({
    servers,
    toolboxToolset,
    toolboxUrl
  });
  const toolboxServer = parsed.servers[defaultMcpToolboxServerId];

  return {
    ...parsed,
    toolboxToolset: toolboxServer?.toolset ?? parsed.toolboxToolset,
    ...(toolboxServer ? { toolboxUrl: toolboxServer.url } : {})
  };
}

export function loadMcpHostConfig(input: Record<string, unknown> = process.env): McpHostConfig {
  const fileConfig = readMcpHostConfigFile(input);

  return parseMcpHostConfig({
    ...input,
    ...fileConfig
  });
}

export function createMcpHost(config: McpHostConfig, options: McpHostOptions = {}) {
  const createClient = options.createClient ?? createMcpClient;

  function getServers(): McpHostServer[] {
    return Object.entries(config.servers).map(([id, server]) => ({
      id,
      toolset: server.toolset,
      url: `${server.url.replace(/\/$/, "")}/mcp`
    }));
  }

  async function listTools(serverId = defaultMcpToolboxServerId): Promise<McpHostTool[]> {
    return withClient(serverId, async (client) => {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema
      }));
    });
  }

  async function callTool(serverId: string, name: string, args: Record<string, unknown> = {}): Promise<McpHostToolCallResult> {
    return withClient(serverId, (client) => client.callTool({ name, arguments: args }));
  }

  async function createAgentRunsDashboard(limit = 20): Promise<AgentRunsDashboardData> {
    const result = await callTool(defaultMcpToolboxServerId, "list-agent-runs", { limit });
    const runs = readAgentRunRows(result);
    const completedRuns = runs.filter((run) => run.terminalEvent === "agent.run.completed").length;
    const failedRuns = runs.filter((run) => run.terminalEvent === "agent.run.failed").length;

    return AgentRunsDashboardDataSchema.parse({
      runs,
      metrics: {
        totalRuns: runs.length,
        completedRuns,
        failedRuns,
        failureRate: runs.length === 0 ? 0 : failedRuns / runs.length
      }
    });
  }

  async function createAgentRunsDashboardEvents(prompt: string): Promise<AgentRunEvent[]> {
    if (!shouldRenderAgentRunsDashboard(prompt)) {
      return [];
    }

    const tool = "mcp-host/toolbox/list-agent-runs";
    const data = await createAgentRunsDashboard(20);

    return [
      {
        input: "{\"limit\":20}",
        kind: "tool-call",
        tool
      },
      {
        kind: "tool-result",
        tool
      },
      {
        kind: "ui",
        ui: {
          component: "agent-runs-dashboard",
          data,
          title: "Agent 运行分析"
        }
      }
    ];
  }

  async function withClient<T>(serverId: string, task: (client: McpClientLike) => Promise<T>): Promise<T> {
    const server = getServers().find((candidate) => candidate.id === serverId);
    if (!server) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }

    const client = await createClient(server);

    try {
      return await task(client);
    } finally {
      await client.close?.();
    }
  }

  return {
    getServers,
    listTools,
    callTool,
    createAgentRunsDashboard,
    createAgentRunsDashboardEvents
  };
}

function readMcpHostConfigFile(input: Record<string, unknown>) {
  const configPath = findMcpHostConfigPath(process.env.INIT_CWD ?? process.cwd());
  if (!configPath) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${defaultMcpHostConfigFileName} must contain a JSON object`);
  }

  return {
    servers: readFileServerConfigMap(parsed.servers, input),
    toolboxToolset: typeof parsed.toolboxToolset === "string" ? expandEnv(parsed.toolboxToolset, input) : undefined,
    toolboxUrl: typeof parsed.toolboxUrl === "string" ? expandEnv(parsed.toolboxUrl, input) : undefined
  };
}

function readServerConfigMap(input: unknown) {
  const servers: Record<string, { url: string; toolset: string }> = {};
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
      toolset: readString(value.toolset) ?? defaultMcpToolboxToolset,
      url
    };
  }

  return servers;
}

function readFileServerConfigMap(input: unknown, env: Record<string, unknown>) {
  const servers: Record<string, { url: string; toolset: string }> = {};
  if (!isRecord(input)) {
    return servers;
  }

  for (const [id, value] of Object.entries(input)) {
    if (!isRecord(value) || typeof value.url !== "string") {
      continue;
    }

    servers[id] = {
      toolset: typeof value.toolset === "string" ? expandEnv(value.toolset, env) : defaultMcpToolboxToolset,
      url: expandEnv(value.url, env)
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
  return value.replace(/\$\{([A-Z0-9_]+)(?::-(.*?))?\}/g, (_match, name: string, fallback = "") => {
    const envValue = input[name];
    return typeof envValue === "string" && envValue.length > 0 ? envValue : fallback;
  });
}

function shouldRenderAgentRunsDashboard(prompt: string) {
  return /mcp|toolbox|统计|分析|图表|dashboard|运行|可交互/i.test(prompt);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export type McpHost = ReturnType<typeof createMcpHost>;

async function createMcpClient(server: McpHostServer): Promise<McpClientLike> {
  const client = new Client({ name: "agent-template-mcp-host", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url));

  await client.connect(transport as Parameters<Client["connect"]>[0]);

  return {
    listTools: () => client.listTools(),
    callTool: async (input) => normalizeMcpToolCallResult(await client.callTool(input)),
    close: () => transport.close()
  };
}

function normalizeMcpToolCallResult(result: unknown): McpHostToolCallResult {
  if (isRecord(result) && Array.isArray(result.content)) {
    return {
      content: result.content,
      ...(isRecord(result.structuredContent) ? { structuredContent: result.structuredContent } : {}),
      ...(typeof result.isError === "boolean" ? { isError: result.isError } : {})
    };
  }

  return {
    content: [
      {
        text: JSON.stringify(result),
        type: "text"
      }
    ]
  };
}

function readAgentRunRows(result: McpHostToolCallResult): AgentRunSummary[] {
  const rows = Array.isArray(result.structuredContent?.result) ? result.structuredContent.result : readJsonTextContent(result.content);

  return rows.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }

    const runId = String(row.runId ?? "");
    const eventCount = Number(row.eventCount ?? 0);
    const firstEventAt = String(row.firstEventAt ?? "");
    const lastEventAt = String(row.lastEventAt ?? "");
    const terminalEvent = row.terminalEvent === null || row.terminalEvent === undefined ? null : String(row.terminalEvent);

    return runId ? [{ runId, eventCount, firstEventAt, lastEventAt, terminalEvent }] : [];
  });
}

function readJsonTextContent(content: unknown[]) {
  const rows: unknown[] = [];

  for (const part of content) {
    if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
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
