import { getAgentConfigStateFromEnv } from "@agent-template/agent";
import { AgentJobPayloadSchema } from "@agent-template/shared";

export type AgentJobResult = {
  accepted: true;
  promptLength: number;
  claudeConfigured: boolean;
  model: string;
};

export async function handleAgentJob(
  payload: unknown,
  env: Record<string, unknown>
): Promise<AgentJobResult> {
  const parsed = AgentJobPayloadSchema.parse(payload);
  const agentState = getAgentConfigStateFromEnv(env);

  return {
    accepted: true,
    promptLength: parsed.prompt.length,
    claudeConfigured: agentState.configured,
    model: agentState.model
  };
}
