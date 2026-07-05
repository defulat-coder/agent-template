import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunEvent } from "@agent-template/shared";

export const defaultClaudeAgentModel = "kimi-for-coding";
export const defaultAnthropicBaseUrl = "https://api.kimi.com/coding/";
export const defaultClaudeAgentMaxTurns = 100;

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

  for await (const message of sdk.query({
    prompt: input.prompt,
    options: {
      env: createClaudeAgentSubprocessEnv(config),
      cwd: readClaudeProjectDir(),
      allowedTools: readClaudeProjectAllowedTools(),
      maxTurns: defaultClaudeAgentMaxTurns,
      permissionMode: "dontAsk",
      persistSession: false,
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
    }

    const partialTextDelta = readClaudePartialTextDelta(message);

    if (partialTextDelta !== undefined) {
      partialText += partialTextDelta;
      progressEvents.push({ kind: "text", text: partialText });
    }

    if (message.type === "assistant") {
      partialText = "";
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

function formatClaudeAgentProgressEvent(message: SDKMessage): AgentRunEvent[] {
  if (message.type === "result" || message.type === "system" || message.type === "stream_event") {
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

  if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") {
    return undefined;
  }

  return event.delta.text;
}

function isClaudePartialTextStart(message: SDKMessage) {
  return message.type === "stream_event" && message.event.type === "content_block_start" && message.event.content_block.type === "text";
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
    ...(config.toolboxUrl ? { TOOLBOX_URL: config.toolboxUrl } : {}),
    ...(config.toolboxToolset
      ? { TOOLBOX_TOOLSET: config.toolboxToolset }
      : {}),
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

  return findClaudeProjectDir(process.env.INIT_CWD ?? process.cwd());
}

function readClaudeProjectAllowedTools() {
  try {
    const settings = JSON.parse(
      readFileSync(
        join(readClaudeProjectDir(), ".claude/settings.json"),
        "utf8",
      ),
    ) as { permissions?: { allow?: unknown } };

    return Array.isArray(settings.permissions?.allow)
      ? settings.permissions.allow.filter(
          (tool): tool is string => typeof tool === "string",
        )
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function findClaudeProjectDir(start: string) {
  let dir = start;

  while (true) {
    if (
      existsSync(join(dir, ".claude/settings.json")) ||
      existsSync(join(dir, ".mcp.json"))
    ) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }

    dir = parent;
  }
}
