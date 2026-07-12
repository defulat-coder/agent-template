import { z } from "zod";
import { Client, type SessionState } from "eve/client";
import { readSemanticQueryFailureMetadata } from "@agent-template/semantic-query";
import {
  appendCompactedAgentRunEvent,
  type AgentInputRequest,
  type AgentRunEvent,
  type AgentRunInput,
  type DependencyState,
} from "@agent-template/shared";
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

export type EveAgentRunInput = AgentRunInput;

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
      status: "waiting";
      events: AgentRunEvent[];
      reason: string;
      sessionId: string;
      sessionState: SessionState;
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
      input:
        | string
        | {
            message?: string;
            inputResponses?: NonNullable<AgentRunInput["inputResponses"]>;
            signal?: AbortSignal;
          },
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
    input.inputResponses
      ? {
          inputResponses: input.inputResponses,
          ...(options.abortController
            ? { signal: options.abortController.signal }
            : {}),
        }
      : options.abortController
        ? { message: input.prompt, signal: options.abortController.signal }
        : input.prompt,
  );
  const events: AgentRunEvent[] = [];
  let failure: string | undefined;
  let output = "";

  for await (const rawEvent of response) {
    failure ??= readEveFailure(rawEvent);
    output = updateEveOutput(output, rawEvent);

    for (const event of formatEveAgentEvents(rawEvent)) {
      appendCompactedAgentRunEvent(events, event);
      options.onEvent?.(event);
    }
  }

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

  if (events.some((event) => event.kind === "input-request")) {
    return {
      status: "waiting",
      events,
      reason: "Agent 正在等待用户输入",
      sessionId: response.sessionId,
      sessionState: session.state,
    };
  }

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
    redirect: "error",
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

  if (
    event.type === "input.requested" &&
    isRecord(event.data) &&
    Array.isArray(event.data.requests)
  ) {
    return event.data.requests.flatMap((request) => {
      const formatted = formatEveInputRequest(request);
      return formatted ? [{ kind: "input-request", request: formatted }] : [];
    });
  }

  if (event.type === "action.result" && isRecord(event.data)) {
    const completedSemanticQuery =
      event.data.status === "completed" &&
      (!isRecord(event.data.result) || event.data.result.isError !== true)
        ? readEveSemanticQueryEvent(event.data.result)
        : undefined;
    const failedSemanticQuery =
      event.data.status !== "completed" ||
      (isRecord(event.data.result) && event.data.result.isError === true)
        ? readEveSemanticQueryFailureEvent(event.data.result)
        : undefined;
    const tool = readEveActionResult(event.data.result);
    if (!tool) {
      return [{ kind: "unknown", text: formatEveOutput(event.data.result) }];
    }
    return [
      { kind: "tool-result", ...tool },
      ...(completedSemanticQuery ? [completedSemanticQuery] : []),
      ...(failedSemanticQuery ? [failedSemanticQuery] : []),
    ];
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

function formatEveInputRequest(
  request: unknown,
): AgentInputRequest | undefined {
  if (
    !isRecord(request) ||
    typeof request.requestId !== "string" ||
    typeof request.prompt !== "string"
  ) {
    return undefined;
  }
  const action = isRecord(request.action)
    ? {
        callId: readNonEmptyString(request.action.callId),
        toolName: readNonEmptyString(request.action.toolName),
        input: toJsonValue(request.action.input ?? {}),
      }
    : undefined;
  const formattedAction =
    action?.callId && action.toolName
      ? {
          callId: action.callId,
          toolName: action.toolName,
          input: action.input,
        }
      : undefined;
  const options = Array.isArray(request.options)
    ? request.options.flatMap((option) => {
        if (
          !isRecord(option) ||
          typeof option.id !== "string" ||
          typeof option.label !== "string"
        ) {
          return [];
        }
        const style: "primary" | "danger" | "default" | undefined =
          option.style === "primary" ||
          option.style === "danger" ||
          option.style === "default"
            ? option.style
            : undefined;
        return [
          {
            id: option.id,
            label: option.label,
            ...(typeof option.description === "string"
              ? { description: option.description }
              : {}),
            ...(style ? { style } : {}),
          },
        ];
      })
    : undefined;
  return {
    requestId: request.requestId,
    type: request.display === "confirmation" ? "approval" : "question",
    prompt: request.prompt,
    ...(options?.length ? { options } : {}),
    ...(request.allowFreeform === true ? { allowFreeform: true } : {}),
    ...(formattedAction ? { action: formattedAction } : {}),
  };
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

function readEveSemanticQueryEvent(
  result: unknown,
): Extract<AgentRunEvent, { kind: "semantic-query" }> | undefined {
  if (!isRecord(result) || result.toolName !== "query_business_data") {
    return undefined;
  }

  if (result.kind !== "tool-result") {
    throw new Error("Eve semantic query action result has an invalid kind");
  }

  const callId = readNonEmptyString(result.callId);
  if (!callId) {
    throw new Error("Eve semantic query action result is missing callId");
  }
  if (!isRecord(result.output)) {
    throw new Error(
      `Eve semantic query Tool result ${callId} has invalid output`,
    );
  }
  const queryId = readNonEmptyString(result.output.queryId);
  if (!queryId) {
    throw new Error(
      `Eve semantic query Tool result ${callId} is missing queryId`,
    );
  }
  const status = readSemanticQueryStatus(result.output.type);
  if (!status) {
    throw new Error(
      `Eve semantic query Tool result ${callId} has invalid status`,
    );
  }
  const durationMs = readEveSemanticQueryDurationMs(
    result.output.durationMs,
    callId,
  );

  const base = {
    kind: "semantic-query" as const,
    callId,
    status,
    queryId,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
  if (status !== "result") return base;
  if (!isRecord(result.output.plan)) {
    throw new Error(
      `Eve semantic query Tool result ${callId} is missing its plan`,
    );
  }

  const plan = result.output.plan;
  const catalog = readNonEmptyString(plan.catalog);
  const catalogVersion = plan.catalogVersion;
  const contractId = readNonEmptyString(plan.contract);
  const toolName = readNonEmptyString(plan.tool);
  const planHash = readNonEmptyString(result.output.planHash);
  const rowCount = result.output.rowCount;
  if (
    !catalog ||
    !isCatalogVersion(catalogVersion) ||
    !contractId ||
    !toolName ||
    !planHash ||
    !isNonNegativeSafeInteger(rowCount)
  ) {
    throw new Error(
      `Eve semantic query Tool result ${callId} has invalid provenance metadata`,
    );
  }
  return {
    ...base,
    catalog,
    catalogVersion,
    contractId,
    toolName,
    planHash,
    rowCount,
  };
}

function readEveSemanticQueryFailureEvent(
  result: unknown,
): Extract<AgentRunEvent, { kind: "semantic-query" }> | undefined {
  if (!isRecord(result) || result.toolName !== "query_business_data") {
    return undefined;
  }
  if (result.kind !== "tool-result") {
    throw new Error("Eve semantic query action result has an invalid kind");
  }
  const callId = readNonEmptyString(result.callId);
  if (!callId) {
    throw new Error("Eve semantic query action result is missing callId");
  }
  if (typeof result.output !== "string") return undefined;
  const metadata = readSemanticQueryFailureMetadata(result.output);
  if (!metadata) return undefined;
  return {
    kind: "semantic-query",
    callId,
    status: "failed",
    queryId: metadata.queryId,
    planHash: metadata.planHash,
    stage: metadata.stage,
    toolName: metadata.tool,
  };
}

function readEveSemanticQueryDurationMs(
  value: unknown,
  callId: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!isNonNegativeSafeInteger(value)) {
    throw new Error(
      `Eve semantic query Tool result ${callId} has invalid durationMs`,
    );
  }
  return value;
}

function readSemanticQueryStatus(
  value: unknown,
): "clarification" | "result" | "unsupported" | undefined {
  return value === "clarification" ||
    value === "result" ||
    value === "unsupported"
    ? value
    : undefined;
}

function isCatalogVersion(value: unknown): value is string | number {
  return (
    (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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

function readEveFailure(event: unknown): string | undefined {
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
  return undefined;
}

function updateEveOutput(output: string, event: unknown): string {
  if (!isRecord(event) || !isRecord(event.data)) return output;

  if (event.type === "result.completed") {
    return formatEveOutput(event.data.result);
  }

  if (
    event.type === "message.completed" &&
    typeof event.data.message === "string"
  ) {
    return event.data.message;
  }

  if (
    event.type === "message.appended" &&
    typeof event.data.messageSoFar === "string"
  ) {
    return event.data.messageSoFar;
  }
  return output;
}

function formatEveOutput(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
