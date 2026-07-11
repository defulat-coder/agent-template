import { z } from "zod";
import { Client, type SessionState } from "eve/client";
import type { AgentRunEvent, DependencyState } from "@agent-template/shared";
import { defaultEveAgentModel, readEveAgentModel } from "./config.js";

export const eveAgentDirectory = "packages/agent-eve/agent";
export {
  defaultEveAgentModel,
  readEveAgentModel,
  readEveAnthropicBaseURL,
} from "./config.js";

export const EveAgentConfigSchema = z.object({
  host: z.string().min(1).optional(),
  model: z.string().min(1).default(defaultEveAgentModel),
  serviceToken: z.string().min(1).optional(),
});

export type EveAgentConfig = z.infer<typeof EveAgentConfigSchema>;

export type EveAgentRuntimeState = {
  configured: boolean;
  model: string;
  authoredSurface: string;
  host?: string;
};

export type EveAgentRunInput = {
  prompt: string;
};

export type EveAgentRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "completed";
      events: AgentRunEvent[];
      output: string;
      sessionId: string;
      sessionState?: SessionState;
    }
  | {
      status: "failed";
      events: AgentRunEvent[];
      reason: string;
      sessionId?: string;
      sessionState?: SessionState;
    };

type EveReadinessClient = {
  health(): Promise<{ ok: true; status: "ready"; workflowId: string }>;
};

type EveRunClient = {
  session(state?: SessionState): {
    readonly state: SessionState;
    send(
      input: string | { message: string; signal?: AbortSignal },
    ): Promise<EveMessageResponse>;
  };
};

type EveMessageResponse = AsyncIterable<unknown> & {
  sessionId: string;
};

export function parseEveAgentConfig(
  input: Record<string, unknown>,
): EveAgentConfig {
  return EveAgentConfigSchema.parse({
    host:
      typeof input.EVE_AGENT_HOST === "string" &&
      input.EVE_AGENT_HOST.length > 0
        ? input.EVE_AGENT_HOST
        : undefined,
    model: readEveAgentModel(input),
    serviceToken:
      typeof input.EVE_AGENT_SERVICE_TOKEN === "string" &&
      input.EVE_AGENT_SERVICE_TOKEN.length > 0
        ? input.EVE_AGENT_SERVICE_TOKEN
        : undefined,
  });
}

export function getEveAgentRuntimeState(
  config: EveAgentConfig,
): EveAgentRuntimeState {
  return {
    configured: Boolean(config.host),
    model: config.model,
    authoredSurface: eveAgentDirectory,
    ...(config.host ? { host: config.host } : {}),
  };
}

export function getEveAgentRuntimeStateFromEnv(
  input: Record<string, unknown>,
): EveAgentRuntimeState {
  return getEveAgentRuntimeState(parseEveAgentConfig(input));
}

export async function checkEveAgentReadiness(
  config: EveAgentConfig,
  options: {
    createClient?: (host: string, config: EveAgentConfig) => EveReadinessClient;
  } = {},
): Promise<DependencyState> {
  if (!config.host) {
    return { status: "error", message: "Eve runtime 缺少 EVE_AGENT_HOST" };
  }

  try {
    const health = await (options.createClient ?? createEveClient)(
      config.host,
      config,
    ).health();
    return {
      status: "ok",
      message: `Eve runtime 已就绪（workflow: ${health.workflowId}）`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : "Eve runtime readiness 检查失败",
    };
  }
}

export async function runEveAgent(
  input: EveAgentRunInput,
  config: EveAgentConfig,
  options: {
    abortController?: AbortController;
    createClient?: (host: string, config: EveAgentConfig) => EveRunClient;
    onEvent?: (event: AgentRunEvent) => void;
    sessionState?: SessionState;
  } = {},
): Promise<EveAgentRunResult> {
  if (!config.host) {
    return { status: "skipped", reason: "EVE_AGENT_HOST is not configured" };
  }

  const client = (options.createClient ?? createEveClient)(config.host, config);
  const session = client.session(options.sessionState);
  const response = await session.send(
    options.abortController
      ? { message: input.prompt, signal: options.abortController.signal }
      : input.prompt,
  );
  const rawEvents: unknown[] = [];
  const events: AgentRunEvent[] = [];

  for await (const rawEvent of response) {
    rawEvents.push(rawEvent);

    for (const event of formatEveAgentEvents(rawEvent)) {
      events.push(event);
      options.onEvent?.(event);
    }
  }

  const failure = findEveFailure(rawEvents);

  if (failure) {
    const reason = failure;
    const event = { kind: "error", message: reason } satisfies AgentRunEvent;
    options.onEvent?.(event);

    return {
      status: "failed",
      events: [...events, event],
      reason,
      sessionId: response.sessionId,
      sessionState: session.state,
    };
  }

  const output = findEveOutput(rawEvents);
  const event = { kind: "done", result: output } satisfies AgentRunEvent;
  options.onEvent?.(event);

  return {
    status: "completed",
    events: [...events, event],
    output,
    sessionId: response.sessionId,
    sessionState: session.state,
  };
}

function createEveClient(
  host: string,
  config: EveAgentConfig,
): EveReadinessClient & EveRunClient {
  return new Client({
    host,
    ...(config.serviceToken
      ? { headers: { "x-agent-template-eve-token": config.serviceToken } }
      : {}),
  });
}

function formatEveAgentEvents(event: unknown): AgentRunEvent[] {
  if (!isRecord(event) || typeof event.type !== "string") {
    return [{ kind: "unknown", text: formatEveOutput(event) }];
  }

  if (
    event.type === "message.appended" &&
    isRecord(event.data) &&
    typeof event.data.messageSoFar === "string"
  ) {
    return [{ kind: "text", text: event.data.messageSoFar }];
  }

  if (
    event.type === "message.completed" &&
    isRecord(event.data) &&
    typeof event.data.message === "string"
  ) {
    return [{ kind: "text", text: event.data.message }];
  }

  if (
    event.type === "actions.requested" &&
    isRecord(event.data) &&
    Array.isArray(event.data.actions)
  ) {
    return event.data.actions.map(formatEveActionRequest);
  }

  if (event.type === "action.result" && isRecord(event.data)) {
    const tool = readEveActionResult(event.data.result);
    return tool
      ? [{ kind: "tool-result", ...tool }]
      : [{ kind: "unknown", text: formatEveOutput(event.data.result) }];
  }

  if (
    (event.type === "step.failed" ||
      event.type === "turn.failed" ||
      event.type === "session.failed") &&
    isRecord(event.data) &&
    typeof event.data.message === "string"
  ) {
    return [{ kind: "error", message: event.data.message }];
  }

  return [];
}

function formatEveActionRequest(action: unknown): AgentRunEvent {
  if (!isRecord(action)) {
    return { kind: "unknown", text: formatEveOutput(action) };
  }

  const callId = readNonEmptyString(action.callId);
  const toolName = readEveActionRequestToolName(action);
  return callId
    ? {
        kind: "tool-call",
        callId,
        toolName,
        input: toJsonValue(action.input ?? {}),
      }
    : { kind: "unknown", text: formatEveOutput(action) };
}

function readEveActionRequestToolName(action: Record<string, unknown>): string {
  if (action.kind === "tool-call" && typeof action.toolName === "string") {
    return action.toolName;
  }

  if (
    action.kind === "subagent-call" &&
    typeof action.subagentName === "string"
  ) {
    return `eve:subagent:${action.subagentName}`;
  }

  if (
    action.kind === "remote-agent-call" &&
    typeof action.remoteAgentName === "string"
  ) {
    return `eve:subagent:${action.remoteAgentName}`;
  }

  return "eve:load-skill";
}

function readEveActionResult(
  result: unknown,
): { callId: string; toolName: string } | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const callId = readNonEmptyString(result.callId);
  if (!callId) return undefined;

  if (result.kind === "tool-result" && typeof result.toolName === "string") {
    return { callId, toolName: result.toolName };
  }

  if (
    result.kind === "subagent-result" &&
    typeof result.subagentName === "string"
  ) {
    return { callId, toolName: `eve:subagent:${result.subagentName}` };
  }

  if (result.kind === "load-skill-result") {
    return { callId, toolName: "eve:load-skill" };
  }

  return undefined;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function toJsonValue(
  value: unknown,
): Extract<AgentRunEvent, { kind: "tool-call" }>["input"] {
  return JSON.parse(JSON.stringify(value)) as Extract<
    AgentRunEvent,
    { kind: "tool-call" }
  >["input"];
}

function findEveFailure(events: unknown[]): string | undefined {
  for (const event of events) {
    if (
      isRecord(event) &&
      (event.type === "session.failed" ||
        event.type === "turn.failed" ||
        event.type === "step.failed") &&
      isRecord(event.data) &&
      typeof event.data.message === "string"
    ) {
      return event.data.message;
    }
  }

  return undefined;
}

function findEveOutput(events: unknown[]): string {
  let output = "";

  for (const event of events) {
    if (!isRecord(event) || !isRecord(event.data)) {
      continue;
    }

    if (event.type === "result.completed") {
      output = formatEveOutput(event.data.result);
    }

    if (
      event.type === "message.completed" &&
      typeof event.data.message === "string"
    ) {
      output = event.data.message;
    }

    if (
      event.type === "message.appended" &&
      typeof event.data.messageSoFar === "string"
    ) {
      output = event.data.messageSoFar;
    }
  }

  return output;
}

function formatEveOutput(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
