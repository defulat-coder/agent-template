import { z } from "zod";

export const defaultClaudeAgentModel = "claude-sonnet-4-5";

export const AgentConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default(defaultClaudeAgentModel)
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type AgentConfigState = {
  configured: boolean;
  model: string;
};

export function parseAgentConfig(input: Record<string, unknown>): AgentConfig {
  return AgentConfigSchema.parse({
    apiKey: input.ANTHROPIC_API_KEY || undefined,
    model: input.CLAUDE_AGENT_MODEL || undefined
  });
}

export function getAgentConfigState(config: AgentConfig): AgentConfigState {
  return {
    configured: Boolean(config.apiKey),
    model: config.model
  };
}

export function getAgentConfigStateFromEnv(input: Record<string, unknown>): AgentConfigState {
  return getAgentConfigState(parseAgentConfig(input));
}

export async function loadClaudeAgentSdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}
