import { z } from "zod";
import {
  checkClaudeAgentReadiness,
  defaultClaudeAgentModel,
  getClaudeAgentRuntimeStateFromEnv,
  loadClaudeAgentSdk,
  parseClaudeAgentConfig,
  runClaudeAgent,
} from "@agent-template/agent-claude";
import {
  checkEveAgentReadiness,
  defaultEveAgentModel,
  getEveAgentRuntimeStateFromEnv,
  parseEveAgentConfig,
  runEveAgent,
} from "@agent-template/agent-eve";
import {
  AgentRunInputSchema,
  type AgentRunEvent,
  type AgentRunResult,
  type DependencyState,
} from "@agent-template/shared";
import { ToolboxCapabilityProfileSchema } from "@agent-template/toolbox-config";

export { defaultClaudeAgentModel, defaultEveAgentModel, loadClaudeAgentSdk };
export type { AgentRunResult };
export {
  createAgentRunLifecycle,
  type AgentRunLifecycle,
  type AgentRunLifecycleExecutionOptions,
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

export type AgentRuntimeState = {
  runtime: AgentRuntimeName;
  configured: boolean;
  model: string;
};

export type RunAgentOptions = {
  abortController?: AbortController;
  runClaude?: typeof runClaudeAgent;
  runEve?: typeof runEveAgent;
  onEvent?: (event: AgentRunEvent) => void;
};

export type CheckAgentRuntimeReadinessOptions = {
  checkClaude?: typeof checkClaudeAgentReadiness;
  checkEve?: typeof checkEveAgentReadiness;
  timeoutMs?: number;
};

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
      ...getEveAgentRuntimeStateFromEnv(env),
    };
  }

  return {
    runtime,
    ...getClaudeAgentRuntimeStateFromEnv(env),
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
        ? (options.checkEve ?? checkEveAgentReadiness)(parseEveAgentConfig(env))
        : (options.checkClaude ?? checkClaudeAgentReadiness)(
            parseClaudeAgentConfig(env),
            { signal: controller.signal },
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
): Promise<AgentRunResult> {
  const parsed = AgentRunInputSchema.parse(input);
  const runtimeEnv = parseAgentRuntimeEnv(env);
  const agentState = getAgentRuntimeStateFromEnv(runtimeEnv);
  const eventOptions = {
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.abortController
      ? { abortController: options.abortController }
      : {}),
  };
  const run =
    agentState.runtime === "eve"
      ? await (options.runEve ?? runEveAgent)(
          parsed,
          parseEveAgentConfig(runtimeEnv),
          eventOptions,
        )
      : await (options.runClaude ?? runClaudeAgent)(
          parsed,
          parseClaudeAgentConfig(runtimeEnv),
          eventOptions,
        );

  return {
    promptLength: parsed.prompt.length,
    runtime: agentState.runtime,
    configured: agentState.configured,
    model: agentState.model,
    status: run.status,
    ...("events" in run ? { events: [...run.events] } : {}),
    ...("output" in run ? { output: run.output } : {}),
    ...("reason" in run ? { reason: run.reason } : {}),
    ...("sessionId" in run ? { sessionId: run.sessionId } : {}),
  };
}
