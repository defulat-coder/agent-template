import { z } from "zod";
import type * as ClaudeRuntime from "@agent-template/agent-claude";
import type * as EveRuntime from "@agent-template/agent-eve";
import {
  AgentRunInputSchema,
  defaultClaudeAgentModel,
  defaultEveAgentModel,
  type AgentRunEvent,
  type AgentRunResult,
  type DependencyState,
} from "@agent-template/shared";
import { ToolboxCapabilityProfileSchema } from "@agent-template/toolbox-config";
import {
  AgentRuntimeContinuationSchema,
  type AgentExecutionResult,
  type AgentRuntimeContinuation,
} from "./runtime-continuation.js";

export { defaultClaudeAgentModel, defaultEveAgentModel };
export type { AgentRunResult };
export {
  AgentConversationNotFoundError,
  AgentConversationRuntimeConflictError,
  createAgentConversationLifecycle,
  type AgentConversationLifecycle,
  type AgentConversationRepository,
  type StoredAgentConversation,
} from "./conversation.js";
export {
  createAgentRunLifecycle,
  defaultAgentRunLeaseDurationMs,
  type AgentRunLifecycle,
  type AgentRunLifecycleExecutionOptions,
  type AgentRunLifecycleQueueOptions,
  type AgentRunRepository,
  type StoredAgentRun,
  type StoredAgentRunEvent,
} from "./lifecycle.js";

export const defaultAgentRuntimeName = "claude";
export const AgentRuntimeNameSchema = z.enum(["claude", "eve"]);

export const AgentRuntimeEnvSchema = z.object({
  AGENT_RUNTIME: AgentRuntimeNameSchema.default(defaultAgentRuntimeName),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_MODEL: z.string().default(defaultClaudeAgentModel),
  CLAUDE_AGENT_MODEL: z.string().default(defaultClaudeAgentModel),
  CLAUDE_PROJECT_DIR: z.string().optional(),
  EVE_AGENT_HOST: z.string().optional(),
  EVE_AGENT_MODEL: z.string().default(defaultEveAgentModel),
  EVE_AGENT_SERVICE_TOKEN: z.string().optional(),
  AGENT_CAPABILITY_PROFILE:
    ToolboxCapabilityProfileSchema.default("development-all"),
  TOOLBOX_AUTH_TOKEN: z.string().optional(),
  TOOLBOX_URL: z.string().url().optional(),
});

export type AgentRuntimeName = z.infer<typeof AgentRuntimeNameSchema>;
export type AgentRuntimeEnv = z.infer<typeof AgentRuntimeEnvSchema>;

export {
  AgentRuntimeContinuationSchema,
  type AgentExecutionResult,
  type AgentRuntimeContinuation,
};

export type AgentRuntimeState = {
  runtime: AgentRuntimeName;
  configured: boolean;
  model: string;
};

export type RunAgentOptions = {
  abortController?: AbortController;
  captureContinuation?: boolean;
  continuation?: AgentRuntimeContinuation;
  loadClaude?: () => Promise<ClaudeRuntimeModule>;
  loadEve?: () => Promise<EveRuntimeModule>;
  onEvent?: (event: AgentRunEvent) => void;
};

export type CheckAgentRuntimeReadinessOptions = {
  loadClaude?: () => Promise<ClaudeRuntimeModule>;
  loadEve?: () => Promise<EveRuntimeModule>;
  timeoutMs?: number;
};

type ClaudeRuntimeModule = Pick<
  typeof ClaudeRuntime,
  "checkClaudeAgentReadiness" | "parseClaudeAgentConfig" | "runClaudeAgent"
>;

type EveRuntimeModule = Pick<
  typeof EveRuntime,
  "checkEveAgentReadiness" | "parseEveAgentConfig" | "runEveAgent"
>;

export function parseAgentRuntimeEnv(
  input: Record<string, unknown>,
): AgentRuntimeEnv {
  return AgentRuntimeEnvSchema.parse(input);
}

export function getAgentRuntimeStateFromEnv(
  input: Record<string, unknown>,
): AgentRuntimeState {
  const env = parseAgentRuntimeEnv(input);
  const runtime = env.AGENT_RUNTIME;

  if (runtime === "eve") {
    return {
      runtime,
      configured: Boolean(env.EVE_AGENT_HOST),
      model: env.EVE_AGENT_MODEL,
    };
  }

  return {
    runtime,
    configured: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.CLAUDE_AGENT_MODEL,
  };
}

export async function checkAgentRuntimeReadinessFromEnv(
  input: Record<string, unknown>,
  options: CheckAgentRuntimeReadinessOptions = {},
): Promise<DependencyState> {
  const env = parseAgentRuntimeEnv(input);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 800;
  const timeout = setTimeout(
    () => controller.abort("Agent runtime readiness timed out"),
    timeoutMs,
  );

  try {
    const check =
      env.AGENT_RUNTIME === "eve"
        ? (options.loadEve ?? loadEveRuntime)().then((runtime) =>
            runtime.checkEveAgentReadiness(runtime.parseEveAgentConfig(env)),
          )
        : (options.loadClaude ?? loadClaudeRuntime)().then((runtime) =>
            runtime.checkClaudeAgentReadiness(
              runtime.parseClaudeAgentConfig(env),
              { signal: controller.signal },
            ),
          );
    return await Promise.race([
      check,
      new Promise<DependencyState>((resolve) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            resolve({
              status: "error",
              message: "Agent runtime readiness 检查超时",
            }),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAgent(
  input: unknown,
  env: Record<string, unknown>,
  options: RunAgentOptions = {},
): Promise<AgentExecutionResult> {
  const parsed = AgentRunInputSchema.parse(input);
  const runtimeEnv = parseAgentRuntimeEnv(env);
  const agentState = getAgentRuntimeStateFromEnv(runtimeEnv);
  const continuation = options.continuation
    ? AgentRuntimeContinuationSchema.parse(options.continuation)
    : undefined;
  if (continuation && continuation.runtime !== agentState.runtime) {
    throw new Error(
      `Agent runtime continuation belongs to ${continuation.runtime}, not ${agentState.runtime}`,
    );
  }
  const eventOptions = {
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.abortController
      ? { abortController: options.abortController }
      : {}),
  };
  const run =
    agentState.runtime === "eve"
      ? await (async () => {
          const runtime = await (options.loadEve ?? loadEveRuntime)();
          return runtime.runEveAgent(
            parsed,
            runtime.parseEveAgentConfig(runtimeEnv),
            {
              ...eventOptions,
              ...(continuation?.runtime === "eve"
                ? { sessionState: toEveSessionState(continuation.sessionState) }
                : {}),
            },
          );
        })()
      : await (async () => {
          const runtime = await (options.loadClaude ?? loadClaudeRuntime)();
          return runtime.runClaudeAgent(
            parsed,
            runtime.parseClaudeAgentConfig(runtimeEnv),
            {
              ...eventOptions,
              persistSession: options.captureContinuation ?? false,
              ...(continuation?.runtime === "claude"
                ? { resumeSessionId: continuation.sessionId }
                : {}),
            },
          );
        })();

  const resultBase = {
    promptLength: parsed.prompt.length,
    runtime: agentState.runtime,
    configured: agentState.configured,
    model: agentState.model,
    ...("sessionId" in run ? { runtimeSessionId: run.sessionId } : {}),
  };
  const runtimeContinuation = readRuntimeContinuation(
    agentState.runtime,
    run,
    options.captureContinuation ?? false,
  );

  if (run.status === "completed") {
    return {
      ...resultBase,
      status: run.status,
      events: [...run.events],
      output: run.output,
      ...(runtimeContinuation ? { runtimeContinuation } : {}),
    };
  }
  if (run.status === "failed") {
    return {
      ...resultBase,
      status: run.status,
      events: [...run.events],
      reason: run.reason,
      ...(runtimeContinuation ? { runtimeContinuation } : {}),
    };
  }
  return {
    ...resultBase,
    status: run.status,
    reason: run.reason,
    ...(runtimeContinuation ? { runtimeContinuation } : {}),
  };
}

function readRuntimeContinuation(
  runtime: AgentRuntimeName,
  run: Awaited<
    | ReturnType<ClaudeRuntimeModule["runClaudeAgent"]>
    | ReturnType<EveRuntimeModule["runEveAgent"]>
  >,
  capture: boolean,
): AgentRuntimeContinuation | undefined {
  if (!capture) return undefined;
  if (runtime === "claude" && "sessionId" in run && run.sessionId) {
    return { runtime, sessionId: run.sessionId };
  }
  if (runtime === "eve" && "sessionState" in run && run.sessionState) {
    return AgentRuntimeContinuationSchema.parse({
      runtime,
      sessionState: run.sessionState,
    });
  }
  return undefined;
}

function toEveSessionState(
  state: Extract<AgentRuntimeContinuation, { runtime: "eve" }>["sessionState"],
) {
  return {
    streamIndex: state.streamIndex,
    ...(state.continuationToken
      ? { continuationToken: state.continuationToken }
      : {}),
    ...(state.sessionId ? { sessionId: state.sessionId } : {}),
  };
}

function loadClaudeRuntime(): Promise<ClaudeRuntimeModule> {
  return import("@agent-template/agent-claude");
}

function loadEveRuntime(): Promise<EveRuntimeModule> {
  return import("@agent-template/agent-eve");
}
