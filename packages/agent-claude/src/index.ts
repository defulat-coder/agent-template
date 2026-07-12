import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
  createSdkMcpServer,
  McpHttpServerConfig,
  McpServerConfig,
  SDKMessage,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  parseToolboxAgentConfig,
  ToolboxAgentConfigSchema,
  toolboxToolNames,
} from "@agent-template/toolbox-config";
import {
  appendCompactedAgentRunEvent,
  defaultClaudeAgentModel,
  type AgentInputRequest,
  type AgentInputResponse,
  type AgentRunInput,
  type AgentRunEvent,
  type DependencyState,
} from "@agent-template/shared";
import { resolveClaudeFilesystemProject } from "./filesystem-project.js";
import {
  claudeSemanticQueryAllowedTool,
  claudeSemanticQueryServerName,
  createClaudeSemanticQueryMcpServer,
  readClaudeSemanticQueryEvent,
  readClaudeSemanticQueryFailureEvent,
} from "./semantic-query.js";

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

export type ClaudeAgentRunInput = AgentRunInput;

export type ClaudePendingInput = {
  toolUseId: string;
  toolName: string;
  toolInput: Extract<AgentRunEvent, { kind: "tool-call" }>["input"];
  requests: AgentInputRequest[];
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
      status: "waiting";
      events: AgentRunEvent[];
      reason: string;
      sessionId: string;
      pendingInput: ClaudePendingInput;
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
      enabledSkills: config.toolbox?.enabledSkills,
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
    const requiredTools = [
      ...config.toolbox.modelSurface.visibleTools,
      ...config.toolbox.semanticExecutionTools,
    ];
    const missing = requiredTools.filter((tool) => !names.has(tool));
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
  createSdkMcpServer?: typeof createSdkMcpServer;
  query(input: {
    prompt: string;
    options?: Record<string, unknown>;
  }): AsyncIterable<SDKMessage>;
  tool?: typeof tool;
};

export async function runClaudeAgent(
  input: ClaudeAgentRunInput,
  config: ClaudeAgentConfig,
  options: {
    abortController?: AbortController;
    loadSdk?: () => Promise<ClaudeAgentSdk>;
    onEvent?: (event: AgentRunEvent) => void;
    pendingInput?: ClaudePendingInput;
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
    enabledSkills: config.toolbox?.enabledSkills,
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
      disallowedTools: readClaudeDisallowedToolboxTools(config),
      maxTurns: defaultClaudeAgentMaxTurns,
      mcpServers: createClaudeMcpServers(config, sdk),
      permissionMode: "dontAsk",
      persistSession: options.persistSession ?? false,
      ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {}),
      settingSources: ["project"],
      skills: filesystemProject.skills,
      tools: ["AskUserQuestion"],
      hooks: createClaudeInputHooks(options.pendingInput, input.inputResponses),
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
      appendCompactedAgentRunEvent(runEvents, event);
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

  const pendingInput = readClaudePendingInput(result);
  if (pendingInput) {
    const waitingEvents = pendingInput.requests.map(
      (request) => ({ kind: "input-request", request }) satisfies AgentRunEvent,
    );
    for (const event of waitingEvents) {
      appendCompactedAgentRunEvent(runEvents, event);
      options.onEvent?.(event);
    }
    if (!sessionId) {
      const event = {
        kind: "error",
        message: "Claude deferred a tool without a resumable session ID",
      } satisfies AgentRunEvent;
      options.onEvent?.(event);
      return {
        status: "failed",
        events: [...runEvents, event],
        reason: event.message,
      };
    }
    return {
      status: "waiting",
      events: runEvents,
      reason: "Agent 正在等待用户输入",
      sessionId,
      pendingInput,
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

function createClaudeInputHooks(
  pendingInput: ClaudePendingInput | undefined,
  inputResponses: AgentInputResponse[] | undefined,
) {
  return {
    PreToolUse: [
      {
        matcher: "AskUserQuestion",
        hooks: [
          async (hookInput: unknown) => {
            if (!isRecord(hookInput)) return {};
            const toolUseId = readNonEmptyString(hookInput.tool_use_id);
            if (
              pendingInput &&
              toolUseId === pendingInput.toolUseId &&
              inputResponses?.length
            ) {
              const updatedInput = resolveClaudeQuestionInput(
                pendingInput,
                inputResponses,
              );
              if (updatedInput) {
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse" as const,
                    permissionDecision: "allow" as const,
                    updatedInput,
                  },
                };
              }
            }
            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse" as const,
                permissionDecision: "defer" as const,
              },
            };
          },
        ],
      },
    ],
  };
}

function readClaudePendingInput(
  result: Extract<SDKMessage, { type: "result" }>,
): ClaudePendingInput | undefined {
  if (
    result.subtype !== "success" ||
    result.stop_reason !== "tool_deferred" ||
    !result.deferred_tool_use
  ) {
    return undefined;
  }
  const deferred = result.deferred_tool_use;
  const requests = formatClaudeInputRequests(
    deferred.id,
    deferred.name,
    deferred.input,
  );
  return {
    toolUseId: deferred.id,
    toolName: deferred.name,
    toolInput: toJsonValue(deferred.input),
    requests,
  };
}

function formatClaudeInputRequests(
  toolUseId: string,
  toolName: string,
  input: unknown,
): AgentInputRequest[] {
  if (toolName === "AskUserQuestion" && isRecord(input)) {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const requests = questions.flatMap((question, index) => {
      if (!isRecord(question) || typeof question.question !== "string") {
        return [];
      }
      const options = Array.isArray(question.options)
        ? question.options.flatMap((option, optionIndex) => {
            if (!isRecord(option) || typeof option.label !== "string") {
              return [];
            }
            return [
              {
                id: String(optionIndex),
                label: option.label,
                ...(typeof option.description === "string"
                  ? { description: option.description }
                  : {}),
                ...(optionIndex === 0 ? { style: "primary" as const } : {}),
              },
            ];
          })
        : undefined;
      return [
        {
          requestId: `${toolUseId}:${index}`,
          type: "question" as const,
          prompt: question.question,
          ...(options?.length ? { options } : {}),
          ...(question.multiSelect === true || options?.length === 0
            ? { allowFreeform: true }
            : {}),
          action: {
            callId: toolUseId,
            toolName,
            input: toJsonValue(input),
          },
        },
      ];
    });
    if (requests.length) return requests;
  }
  return [
    {
      requestId: toolUseId,
      type: "approval",
      prompt: `允许 Agent 执行 ${toolName}？`,
      options: [
        { id: "approve", label: "允许并继续", style: "primary" },
        { id: "deny", label: "拒绝", style: "danger" },
      ],
      action: {
        callId: toolUseId,
        toolName,
        input: toJsonValue(input),
      },
    },
  ];
}

function resolveClaudeQuestionInput(
  pendingInput: ClaudePendingInput,
  responses: AgentInputResponse[],
): Record<string, unknown> | undefined {
  if (pendingInput.toolName !== "AskUserQuestion") return undefined;
  if (!isRecord(pendingInput.toolInput)) return undefined;
  const responseById = new Map(
    responses.map((response) => [response.requestId, response]),
  );
  const answers: Record<string, string> = {};
  for (const request of pendingInput.requests) {
    const response = responseById.get(request.requestId);
    if (!response) return undefined;
    const option = request.options?.find(
      (candidate) => candidate.id === response.optionId,
    );
    const answer = response.text ?? option?.label;
    if (!answer) return undefined;
    answers[request.prompt] = answer;
  }
  return {
    ...pendingInput.toolInput,
    answers,
  };
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
      toolNamesByCallId.delete(item.tool_use_id);
      if (!toolName) {
        events.push({
          kind: "unknown",
          text: `Tool result for unobserved call ${item.tool_use_id}`,
        });
        continue;
      }
      events.push({
        kind: "tool-result",
        callId: item.tool_use_id,
        toolName,
      });
      if (toolName === claudeSemanticQueryAllowedTool) {
        const semanticQuery =
          item.is_error === true
            ? readClaudeSemanticQueryFailureEvent(
                item.tool_use_id,
                item.content,
              )
            : readClaudeSemanticQueryEvent(item.tool_use_id, item.content);
        if (semanticQuery) events.push(semanticQuery);
      }
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

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  return [
    "AskUserQuestion",
    ...(config.toolbox?.modelSurface.visibleTools.map(
      (toolName) => `mcp__toolbox__${toolName}`,
    ) ?? []),
    ...(config.toolbox?.semanticCatalogs.length
      ? [claudeSemanticQueryAllowedTool]
      : []),
  ];
}

function readClaudeDisallowedToolboxTools(config: ClaudeAgentConfig) {
  return config.toolbox
    ? config.toolbox.modelSurface.hiddenTools.map(
        (toolName) => `mcp__toolbox__${toolName}`,
      )
    : [];
}

function createClaudeMcpServers(
  config: ClaudeAgentConfig,
  sdk: ClaudeAgentSdk,
): Record<string, McpServerConfig> {
  const toolbox = config.toolbox;
  if (!toolbox) return {};

  const servers: Record<string, McpServerConfig> = {};
  const modelVisibleTools = new Set(toolbox.modelSurface.visibleTools);

  if (modelVisibleTools.size > 0) {
    servers.toolbox = {
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
        modelVisibleTools.has(toolName)
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
    } satisfies McpHttpServerConfig;
  }

  if (toolbox.semanticCatalogs.length > 0) {
    if (!sdk.createSdkMcpServer || !sdk.tool) {
      throw new Error(
        "Claude Agent SDK does not expose semantic query MCP Tool factories",
      );
    }
    servers[claudeSemanticQueryServerName] = createClaudeSemanticQueryMcpServer(
      toolbox,
      {
        createServer: sdk.createSdkMcpServer,
        defineTool: sdk.tool,
      },
    );
  }

  return servers;
}
