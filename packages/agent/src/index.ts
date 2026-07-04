import { z } from "zod";
import {
  defaultClaudeAgentModel,
  getClaudeAgentRuntimeStateFromEnv,
  loadClaudeAgentSdk,
  parseClaudeAgentConfig,
  runClaudeAgentJob
} from "@agent-template/agent-claude";
import {
  defaultEveAgentModel,
  getEveAgentRuntimeStateFromEnv,
  parseEveAgentConfig,
  runEveAgentJob
} from "@agent-template/agent-eve";
import { AgentJobPayloadSchema } from "@agent-template/shared";

export { defaultClaudeAgentModel, defaultEveAgentModel, loadClaudeAgentSdk };

export const defaultAgentRuntimeName = "claude";
export const AgentRuntimeNameSchema = z.enum(["claude", "eve"]);

export const AgentRuntimeEnvSchema = z.object({
  AGENT_RUNTIME: AgentRuntimeNameSchema.default(defaultAgentRuntimeName),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_AGENT_MODEL: z.string().default(defaultClaudeAgentModel),
  EVE_AGENT_HOST: z.string().optional(),
  EVE_AGENT_MODEL: z.string().default(defaultEveAgentModel)
});

export type AgentRuntimeName = z.infer<typeof AgentRuntimeNameSchema>;
export type AgentRuntimeEnv = z.infer<typeof AgentRuntimeEnvSchema>;

export type AgentRuntimeState = {
  runtime: AgentRuntimeName;
  configured: boolean;
  model: string;
};

export type AgentJobResult = {
  accepted: true;
  promptLength: number;
  runtime: AgentRuntimeName;
  configured: boolean;
  model: string;
  status: "skipped" | "completed" | "failed";
  events?: unknown[];
  output?: string;
  reason?: string;
  sessionId?: string;
};

export type RunAgentJobOptions = {
  runClaude?: typeof runClaudeAgentJob;
  runEve?: typeof runEveAgentJob;
};

export function parseAgentRuntimeEnv(input: Record<string, unknown>): AgentRuntimeEnv {
  return AgentRuntimeEnvSchema.parse(input);
}

export function getAgentRuntimeStateFromEnv(input: Record<string, unknown>): AgentRuntimeState {
  const env = parseAgentRuntimeEnv(input);
  const runtime = env.AGENT_RUNTIME;

  if (runtime === "eve") {
    return {
      runtime,
      ...getEveAgentRuntimeStateFromEnv(env)
    };
  }

  return {
    runtime,
    ...getClaudeAgentRuntimeStateFromEnv(env)
  };
}

export async function runAgentJob(
  payload: unknown,
  env: Record<string, unknown>,
  options: RunAgentJobOptions = {}
): Promise<AgentJobResult> {
  const parsed = AgentJobPayloadSchema.parse(payload);
  const runtimeEnv = parseAgentRuntimeEnv(env);
  const agentState = getAgentRuntimeStateFromEnv(runtimeEnv);
  const run =
    agentState.runtime === "eve"
      ? await (options.runEve ?? runEveAgentJob)(parsed, parseEveAgentConfig(runtimeEnv))
      : await (options.runClaude ?? runClaudeAgentJob)(parsed, parseClaudeAgentConfig(runtimeEnv));

  return {
    accepted: true,
    promptLength: parsed.prompt.length,
    runtime: agentState.runtime,
    configured: agentState.configured,
    model: agentState.model,
    status: run.status,
    ...("events" in run ? { events: [...run.events] } : {}),
    ...("output" in run ? { output: run.output } : {}),
    ...("reason" in run ? { reason: run.reason } : {}),
    ...("sessionId" in run ? { sessionId: run.sessionId } : {})
  };
}
