import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type {
  McpServerConfig,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  createMcpHost,
  loadMcpHostConfig,
  readAgentCapabilityTools,
  type McpHostConfig,
  type McpHostToolCallResult,
} from "@agent-template/mcp-host";
import {
  McpToolboxLimitSchema,
  McpToolboxOrderNumberInputSchema,
  McpToolboxRunSummaryInputSchema,
  McpToolboxRunTimelineInputSchema,
  McpToolboxTimeWindowSchema,
  McpToolboxTimeWindowWithLimitSchema,
  type AgentRunEvent,
} from "@agent-template/shared";

export const defaultClaudeAgentModel = "kimi-for-coding";
export const defaultAnthropicBaseUrl = "https://api.kimi.com/coding/";
export const defaultClaudeAgentMaxTurns = 100;
const partialTextEventMinDelta = 200;

export const ClaudeAgentConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  authToken: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).default(defaultClaudeAgentModel),
  toolboxUrl: z.string().url().optional(),
  toolboxToolset: z.string().min(1).optional(),
});

export type ClaudeAgentConfig = z.infer<typeof ClaudeAgentConfigSchema>;

export type ClaudeAgentRuntimeState = {
  configured: boolean;
  model: string;
};

export type ClaudeAgentRunInput = {
  prompt: string;
};

export type ClaudeAgentRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "completed";
      events: AgentRunEvent[];
      output: string;
      sessionId?: string;
    }
  | {
      status: "failed";
      events: AgentRunEvent[];
      reason: string;
      sessionId?: string;
    };

export function parseClaudeAgentConfig(
  input: Record<string, unknown>,
): ClaudeAgentConfig {
  return ClaudeAgentConfigSchema.parse({
    apiKey: input.ANTHROPIC_API_KEY || undefined,
    authToken: input.ANTHROPIC_AUTH_TOKEN || undefined,
    baseUrl: input.ANTHROPIC_BASE_URL || undefined,
    model: input.CLAUDE_AGENT_MODEL || input.ANTHROPIC_MODEL || undefined,
    toolboxUrl: input.TOOLBOX_URL || undefined,
    toolboxToolset: input.TOOLBOX_TOOLSET || undefined,
  });
}

export function getClaudeAgentRuntimeState(
  config: ClaudeAgentConfig,
): ClaudeAgentRuntimeState {
  return {
    configured: Boolean(config.apiKey || config.authToken),
    model: config.model,
  };
}

export function getClaudeAgentRuntimeStateFromEnv(
  input: Record<string, unknown>,
): ClaudeAgentRuntimeState {
  return getClaudeAgentRuntimeState(parseClaudeAgentConfig(input));
}

export async function loadClaudeAgentSdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}

type ClaudeAgentSdk = {
  query(input: {
    prompt: string;
    options?: Record<string, unknown>;
  }): AsyncIterable<SDKMessage>;
  createSdkMcpServer(options: Record<string, unknown>): McpServerConfig;
  tool(
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodType>,
    handler: (args: Record<string, unknown>) => Promise<McpHostToolCallResult>,
    extras?: Record<string, unknown>,
  ): unknown;
};

export async function runClaudeAgent(
  input: ClaudeAgentRunInput,
  config: ClaudeAgentConfig,
  options: {
    loadSdk?: () => Promise<ClaudeAgentSdk>;
    onEvent?: (event: AgentRunEvent) => void;
  } = {},
): Promise<ClaudeAgentRunResult> {
  if (!config.apiKey && !config.authToken) {
    return {
      status: "skipped",
      reason: "ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is not configured",
    };
  }

  const sdk = await (options.loadSdk ?? loadClaudeAgentSdk)();
  const runEvents: AgentRunEvent[] = [];
  let result: Extract<SDKMessage, { type: "result" }> | undefined;
  let sessionId: string | undefined;
  let partialText = "";
  let lastPartialTextEventLength = 0;

  for await (const message of sdk.query({
    prompt: input.prompt,
    options: {
      env: createClaudeAgentSubprocessEnv(config),
      cwd: readClaudeProjectDir(),
      allowedTools: readHostManagedClaudeTools(config),
      maxTurns: defaultClaudeAgentMaxTurns,
      mcpServers: createHostManagedClaudeMcpServers(sdk, config),
      permissionMode: "dontAsk",
      persistSession: false,
      settingSources: ["project"],
      skills: "all",
      tools: [],
      includePartialMessages: true,
      ...(!config.baseUrl ? { model: config.model } : {}),
    },
  })) {
    if ("session_id" in message) {
      sessionId = message.session_id;
    }

    const progressEvents = formatClaudeAgentProgressEvent(message);

    if (isClaudePartialTextStart(message)) {
      partialText = "";
      lastPartialTextEventLength = 0;
    }

    const partialTextDelta = readClaudePartialTextDelta(message);

    if (partialTextDelta !== undefined) {
      partialText += partialTextDelta;
      if (shouldEmitPartialTextEvent(partialText, lastPartialTextEventLength)) {
        progressEvents.push({ kind: "text", text: partialText });
        lastPartialTextEventLength = partialText.length;
      }
    }

    if (
      message.type === "result" &&
      partialText.length > lastPartialTextEventLength
    ) {
      progressEvents.push({ kind: "text", text: partialText });
      partialText = "";
      lastPartialTextEventLength = 0;
    }

    if (message.type === "assistant") {
      partialText = "";
      lastPartialTextEventLength = 0;
    }

    for (const event of progressEvents) {
      runEvents.push(event);
      options.onEvent?.(event);
    }

    if (message.type === "result") {
      result = message;
    }
  }

  if (!result) {
    const event = {
      kind: "error",
      message: "Claude Agent SDK did not return a result",
    } satisfies AgentRunEvent;
    options.onEvent?.(event);

    return {
      status: "failed",
      events: [...runEvents, event],
      reason: "Claude Agent SDK did not return a result",
      ...(sessionId ? { sessionId } : {}),
    };
  }

  if (result.subtype !== "success" || result.is_error) {
    const reason =
      "errors" in result ? result.errors.join("\n") : result.result;
    const message = reason || "Claude Agent SDK run failed";
    const event = { kind: "error", message } satisfies AgentRunEvent;
    options.onEvent?.(event);

    return {
      status: "failed",
      events: [...runEvents, event],
      reason: message,
      ...(sessionId ? { sessionId } : {}),
    };
  }

  const event = { kind: "done", result: result.result } satisfies AgentRunEvent;
  options.onEvent?.(event);

  return {
    status: "completed",
    events: [...runEvents, event],
    output: result.result,
    ...(sessionId ? { sessionId } : {}),
  };
}

function shouldEmitPartialTextEvent(text: string, lastEventLength: number) {
  return (
    lastEventLength === 0 ||
    text.length - lastEventLength >= partialTextEventMinDelta
  );
}

function formatClaudeAgentProgressEvent(message: SDKMessage): AgentRunEvent[] {
  if (
    message.type === "result" ||
    message.type === "system" ||
    message.type === "stream_event"
  ) {
    return [];
  }

  if (message.type === "assistant") {
    return formatClaudeAssistantMessage(message);
  }

  if (message.type === "user") {
    return formatClaudeUserMessage(message);
  }

  return [
    { kind: "unknown", text: JSON.stringify(message) ?? String(message) },
  ];
}

function readClaudePartialTextDelta(message: SDKMessage): string | undefined {
  if (message.type !== "stream_event") {
    return undefined;
  }

  const { event } = message;

  if (
    event.type !== "content_block_delta" ||
    event.delta.type !== "text_delta"
  ) {
    return undefined;
  }

  return event.delta.text;
}

function isClaudePartialTextStart(message: SDKMessage) {
  return (
    message.type === "stream_event" &&
    message.event.type === "content_block_start" &&
    message.event.content_block.type === "text"
  );
}

function formatClaudeAssistantMessage(
  message: Extract<SDKMessage, { type: "assistant" }>,
): AgentRunEvent[] {
  const content = message.message.content;

  if (!Array.isArray(content)) {
    return [];
  }

  const events: AgentRunEvent[] = [];

  for (const item of content) {
    if (item.type === "text") {
      events.push({ kind: "text", text: item.text });
    }

    if (item.type === "tool_use") {
      events.push({
        kind: "tool-call",
        tool: item.name,
        input: JSON.stringify(item.input ?? {}),
      });
    }
  }

  return events;
}

function formatClaudeUserMessage(
  message: Extract<SDKMessage, { type: "user" }>,
): AgentRunEvent[] {
  const content = message.message.content;

  if (!Array.isArray(content)) {
    return [];
  }

  const events: AgentRunEvent[] = [];

  for (const item of content) {
    if (item.type === "tool_result") {
      events.push({
        kind: "tool-result",
        tool: item.tool_use_id,
      });
    }
  }

  return events;
}

function createClaudeAgentSubprocessEnv(config: ClaudeAgentConfig) {
  const claudeConfigDir = join(tmpdir(), "agent-template-claude-code");
  mkdirSync(claudeConfigDir, { recursive: true });

  const env = {
    ...process.env,
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: "262144",
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    ...(config.apiKey ? { ANTHROPIC_API_KEY: config.apiKey } : {}),
    ...(config.authToken ? { ANTHROPIC_AUTH_TOKEN: config.authToken } : {}),
    ...(config.baseUrl ? { ANTHROPIC_BASE_URL: config.baseUrl } : {}),
    ...(!config.baseUrl
      ? {
          ANTHROPIC_DEFAULT_HAIKU_MODEL: config.model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: config.model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: config.model,
          ANTHROPIC_MODEL: config.model,
        }
      : {}),
  };

  if (config.baseUrl) {
    delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    delete env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    delete env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    delete env.ANTHROPIC_MODEL;
  }

  return env;
}

function readClaudeProjectDir() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  return process.env.INIT_CWD ?? process.cwd();
}

function readHostManagedClaudeTools(config: ClaudeAgentConfig) {
  const mcpHostConfig = readClaudeMcpHostConfig(config);
  return mcpHostConfig.toolboxUrl
    ? readAgentCapabilityTools(mcpHostConfig).map(
        (toolName) => `mcp__agent_template_mcp_host__${toolName}`,
      )
    : [];
}

function createHostManagedClaudeMcpServers(
  sdk: ClaudeAgentSdk,
  config: ClaudeAgentConfig,
): Record<string, McpServerConfig> {
  const mcpHostConfig = readClaudeMcpHostConfig(config);

  if (!mcpHostConfig.toolboxUrl) {
    return {};
  }

  const host = createMcpHost(mcpHostConfig);

  return {
    agent_template_mcp_host: sdk.createSdkMcpServer({
      name: "agent_template_mcp_host",
      version: "0.1.0",
      instructions:
        "Use these Host-managed MCP tools for Agent Template read-model data. The runtime must not connect to Toolbox directly.",
      tools: [
        sdk.tool(
          "list-agent-runs",
          "List Agent runs from the last 30 days through the Host-managed Toolbox MCP server.",
          { limit: McpToolboxLimitSchema.optional() },
          async (args) => host.callTool("toolbox", "list-agent-runs", args),
        ),
        sdk.tool(
          "get-agent-run-summary",
          "Get the lifecycle summary for one concrete Agent run from the Host-managed Toolbox MCP server.",
          McpToolboxRunSummaryInputSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "get-agent-run-summary",
              McpToolboxRunSummaryInputSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-agent-run-timeline",
          "List a bounded event timeline for one concrete Agent run from the Host-managed Toolbox MCP server.",
          McpToolboxRunTimelineInputSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-agent-run-timeline",
              McpToolboxRunTimelineInputSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-template-events",
          "List template business events from the last 30 days through the Host-managed Toolbox MCP server.",
          { limit: McpToolboxLimitSchema.optional() },
          async (args) =>
            host.callTool("toolbox", "list-template-events", args),
        ),
        sdk.tool(
          "summarize-ecommerce-sales-by-day",
          "Summarize daily gross sales, refunds, net sales, orders, and buyers for the synthetic ecommerce dataset.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize-ecommerce-sales-by-day",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize-ecommerce-sales-by-channel",
          "Compare synthetic ecommerce sales performance by channel in an explicit UTC time window.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize-ecommerce-sales-by-channel",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize_sales_by_region",
          "Summarize synthetic ecommerce gross sales, refunds, net sales, buyers, and AOV by customer region in an explicit UTC time window.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize_sales_by_region",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize_sales_by_customer_segment",
          "Summarize synthetic ecommerce gross sales, refunds, net sales, buyers, and AOV by customer segment in an explicit UTC time window.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize_sales_by_customer_segment",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-ecommerce-top-products",
          "Rank synthetic ecommerce products by paid quantity and net merchandise sales in an explicit UTC time window.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-ecommerce-top-products",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize_merchandise_by_category",
          "Summarize synthetic ecommerce units, gross merchandise sales, and refund-adjusted net merchandise sales by category in an explicit UTC time window.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize_merchandise_by_category",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-ecommerce-orders-in-window",
          "List bounded synthetic ecommerce orders with operational and customer-segment context in an explicit UTC time window.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-ecommerce-orders-in-window",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "get-ecommerce-order-detail",
          "Get one synthetic ecommerce order and its line items from a concrete order number.",
          McpToolboxOrderNumberInputSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "get-ecommerce-order-detail",
              McpToolboxOrderNumberInputSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-ecommerce-fulfillment-exceptions",
          "List bounded paid but unfulfilled synthetic ecommerce orders in an explicit UTC time window.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-ecommerce-fulfillment-exceptions",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-template-events-in-window",
          "List bounded template events in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-template-events-in-window",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize-template-events-by-type",
          "Summarize template event counts by type in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          McpToolboxTimeWindowSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize-template-events-by-type",
              McpToolboxTimeWindowSchema.parse(args),
            ),
        ),
        sdk.tool(
          "list-failed-agent-runs-in-window",
          "List bounded Agent failures in an explicit UTC time window through the Host-managed Toolbox MCP server.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "list-failed-agent-runs-in-window",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "summarize-tool-invocations",
          "Summarize MCP Toolbox invocation volume and latency in an explicit UTC time window.",
          McpToolboxTimeWindowWithLimitSchema.shape,
          async (args) =>
            host.callTool(
              "toolbox",
              "summarize-tool-invocations",
              McpToolboxTimeWindowWithLimitSchema.parse(args),
            ),
        ),
        sdk.tool(
          "get-template-event",
          "Get one template business event from the Host-managed Toolbox MCP server.",
          { eventId: z.string().min(1) },
          async (args) => host.callTool("toolbox", "get-template-event", args),
        ),
      ],
    }),
  };
}

function readClaudeMcpHostConfig(config: ClaudeAgentConfig): McpHostConfig {
  return loadMcpHostConfig({
    ...process.env,
    TOOLBOX_TOOLSET: config.toolboxToolset,
    TOOLBOX_URL: config.toolboxUrl,
  });
}
