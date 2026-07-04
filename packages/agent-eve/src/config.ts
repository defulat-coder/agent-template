export const defaultEveAgentModel = "anthropic/claude-sonnet-5";

export function readEveAgentModel(input: Record<string, unknown>): string {
  return typeof input.EVE_AGENT_MODEL === "string" && input.EVE_AGENT_MODEL.length > 0
    ? input.EVE_AGENT_MODEL
    : defaultEveAgentModel;
}
