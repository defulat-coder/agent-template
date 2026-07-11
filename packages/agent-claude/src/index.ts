import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
  McpHttpServerConfig,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  parseToolboxAgentConfig,
  ToolboxAgentConfigSchema,
  toolboxToolNames,
} from "@agent-template/toolbox-config";
import {
  defaultClaudeAgentModel,
  type AgentRunEvent,
  type DependencyState,
} from "@agent-template/shared";
import { resolveClaudeFilesystemProject } from "./filesystem-project.js";

export { defaultClaudeAgentModel };
export const defaultAnthropicBaseUrl = "https://api.kimi.com/coding/";
export const defaultClaudeAgentMaxTurns = 100;
const partialTextEventMinDelta = 200;
export const ClaudeAgentConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  authToken: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).default(defaultClaudeAgentModel),
  projectDir: z.string().min(1).optional(),
  toolbox: ToolboxAgentConfigSchema.optional(),
});

export type ClaudeAgentConfig = z.infer<typeof ClaudeAgentConfigSchema>;

export type ClaudeAgentRuntimeState = {
  configured: boolean;
  model: string;
};

export type ClaudeAgentRunInput = {
  prompt: string;
};

type ClaudeToolboxReadinessClient = {
  listTools(): Promise<{ tools: Array<{ name: string }> }>;
  close(): Promise<void>;
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
  const toolbox = parseToolboxAgentConfig(input);
  return ClaudeAgentConfigSchema.parse({
    apiKey: input.ANTHROPIC_API_KEY || undefined,
    authToken: input.ANTHROPIC_AUTH_TOKEN || undefined,
    baseUrl: input.ANTHROPIC_BASE_URL || undefined,
    model: input.CLAUDE_AGENT_MODEL || input.ANTHROPIC_MODEL || undefined,
    projectDir: input.CLAUDE_PROJECT_DIR || undefined,
    ...(toolbox ? { toolbox } : {}),
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

export async function checkClaudeAgentReadiness(
  config: ClaudeAgentConfig,
  options: {
    connectToolbox?: (
      config: NonNullable<ClaudeAgentConfig["toolbox"]>,
      signal?: AbortSignal,
    ) => Promise<ClaudeToolboxReadinessClient>;
    signal?: AbortSignal;
  } = {},
): Promise<DependencyState> {
  if (!config.apiKey && !config.authToken) {
    return {
      status: "error",
      message: "Claude runtime 缺少 API Key 或 Auth Token",
    };
  }

  let client: ClaudeToolboxReadinessClient | undefined;
  try {
    resolveClaudeFilesystemProject({
      allowedTools: config.toolbox?.allowedTools,
      projectDir: config.projectDir,
    });
    if (!config.toolbox) {
      return {
        status: "ok",
        message: "Claude runtime 凭据已配置，Toolbox 未启用",
      };
    }
    client = await (options.connectToolbox ?? connectClaudeToolboxReadiness)(
      config.toolbox,
      options.signal,
    );
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    const missing = config.toolbox.allowedTools.filter(
      (tool) => !names.has(tool),
    );
    if (missing.length > 0) {
      return {
        status: "error",
        message: `Toolbox 缺少 capability profile 所需 Tool: ${missing.join(", ")}`,
      };
    }
    return {
      status: "ok",
      message: `Claude runtime 与 Toolbox 已就绪（${tools.tools.length} tools）`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : "Claude runtime readiness 检查失败",
    };
  } finally {
    await client?.close();
  }
}

export async function loadClaudeAgentSdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}

async function connectClaudeToolboxReadiness(
  config: NonNullable<ClaudeAgentConfig["toolbox"]>,
  signal?: AbortSignal,
): Promise<ClaudeToolboxReadinessClient> {
  const client = new McpClient(
    { name: "agent-template-claude-readiness", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      ...(config.authorizationToken
        ? { headers: { Authorization: `Bearer ${config.authorizationToken}` } }
        : {}),
      ...(signal ? { signal } : {}),
    },
  });
  await client.connect(transport as Parameters<McpClient["connect"]>[0]);
  return client;
}

type ClaudeAgentSdk = {
  query(input: {
    prompt: string;
    options?: Record<string, unknown>;
  }): AsyncIterable<SDKMessage>;
};

export async function runClaudeAgent(
  input: ClaudeAgentRunInput,
  config: ClaudeAgentConfig,
  options: {
    abortController?: AbortController;
    loadSdk?: () => Promise<ClaudeAgentSdk>;
    onEvent?: (event: AgentRunEvent) => void;
    persistSession?: boolean;
    resumeSessionId?: string;
  } = {},
): Promise<ClaudeAgentRunResult> {
  if (!config.apiKey && !config.authToken) {
    return {
      status: "skipped",
      reason: "ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is not configured",
    };
  }

  const sdk = await (options.loadSdk ?? loadClaudeAgentSdk)();
  const filesystemProject = resolveClaudeFilesystemProject({
    allowedTools: config.toolbox?.allowedTools,
    projectDir: config.projectDir,
  });
  const runEvents: AgentRunEvent[] = [];
  let result: Extract<SDKMessage, { type: "result" }> | undefined;
  let sessionId: string | undefined;
  let partialText = "";
  let lastPartialTextEventLength = 0;
  const toolNamesByCallId = new Map<string, string>();

  for await (const message of sdk.query({
    prompt: input.prompt,
    options: {
      ...(options.abortController
        ? { abortController: options.abortController }
        : {}),
      env: createClaudeAgentSubprocessEnv(config),
      cwd: filesystemProject.cwd,
      allowedTools: readClaudeToolboxTools(config),
      maxTurns: defaultClaudeAgentMaxTurns,
      mcpServers: createClaudeToolboxMcpServers(config),
      permissionMode: "dontAsk",
      persistSession: options.persistSession ?? false,
      ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {}),
      settingSources: ["project"],
      skills: filesystemProject.skills,
      tools: [],
      includePartialMessages: true,
      ...(!config.baseUrl ? { model: config.model } : {}),
    },
  })) {
    if ("session_id" in message) {
      sessionId = message.session_id;
    }

    const progressEvents = formatClaudeAgentProgressEvent(
      message,
      toolNamesByCallId,
    );

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

function formatClaudeAgentProgressEvent(
  message: SDKMessage,
  toolNamesByCallId: Map<string, string>,
): AgentRunEvent[] {
  if (
    message.type === "result" ||
    message.type === "system" ||
    message.type === "stream_event"
  ) {
    return [];
  }

  if (message.type === "assistant") {
    return formatClaudeAssistantMessage(message, toolNamesByCallId);
  }

  if (message.type === "user") {
    return formatClaudeUserMessage(message, toolNamesByCallId);
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
  toolNamesByCallId: Map<string, string>,
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
      toolNamesByCallId.set(item.id, item.name);
      events.push({
        kind: "tool-call",
        callId: item.id,
        toolName: item.name,
        input: toJsonValue(item.input ?? {}),
      });
    }
  }

  return events;
}

function formatClaudeUserMessage(
  message: Extract<SDKMessage, { type: "user" }>,
  toolNamesByCallId: Map<string, string>,
): AgentRunEvent[] {
  const content = message.message.content;

  if (!Array.isArray(content)) {
    return [];
  }

  const events: AgentRunEvent[] = [];

  for (const item of content) {
    if (item.type === "tool_result") {
      const toolName = toolNamesByCallId.get(item.tool_use_id);
      events.push(
        toolName
          ? {
              kind: "tool-result",
              callId: item.tool_use_id,
              toolName,
            }
          : {
              kind: "unknown",
              text: `Tool result for unobserved call ${item.tool_use_id}`,
            },
      );
    }
  }

  return events;
}

function toJsonValue(
  value: unknown,
): Extract<AgentRunEvent, { kind: "tool-call" }>["input"] {
  return JSON.parse(JSON.stringify(value)) as Extract<
    AgentRunEvent,
    { kind: "tool-call" }
  >["input"];
}

function createClaudeAgentSubprocessEnv(config: ClaudeAgentConfig) {
  const claudeConfigDir = join(tmpdir(), "agent-template-claude-code");
  mkdirSync(claudeConfigDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
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

  delete env.AGENT_CAPABILITY_PROFILE;
  delete env.CLAUDE_PROJECT_DIR;
  delete env.TOOLBOX_AUTH_TOKEN;
  delete env.TOOLBOX_URL;

  return env;
}

function readClaudeToolboxTools(config: ClaudeAgentConfig) {
  return (
    config.toolbox?.allowedTools.map(
      (toolName) => `mcp__toolbox__${toolName}`,
    ) ?? []
  );
}

function createClaudeToolboxMcpServers(
  config: ClaudeAgentConfig,
): Record<string, McpHttpServerConfig> {
  const toolbox = config.toolbox;
  if (!toolbox) return {};

  const allowedTools = new Set(toolbox.allowedTools);

  return {
    toolbox: {
      type: "http",
      url: toolbox.url,
      ...(toolbox.authorizationToken
        ? {
            headers: {
              Authorization: `Bearer ${toolbox.authorizationToken}`,
            },
          }
        : {}),
      tools: toolboxToolNames.map((toolName) =>
        allowedTools.has(toolName)
          ? {
              name: toolName,
              org_max_permission: "allow",
              permission_policy: "always_allow",
            }
          : {
              name: toolName,
              org_max_permission: "blocked",
              permission_policy: "always_deny",
            },
      ),
    },
  };
}
