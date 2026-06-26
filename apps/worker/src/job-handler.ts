import { getAgentConfigStateFromEnv } from "@project-template/agent";
import { AgentJobPayloadSchema, type AgentJobPayload } from "@project-template/shared";

export type AgentJobResult = {
  accepted: true;
  promptLength: number;
  claudeConfigured: boolean;
  model: string;
};

export async function handleAgentJob(
  payload: AgentJobPayload,
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
