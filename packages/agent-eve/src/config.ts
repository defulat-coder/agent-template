import { createAnthropic } from "@ai-sdk/anthropic";
import { defaultEveAgentModel } from "@agent-template/shared";
import type { AgentModelDefinition } from "eve";

export { defaultEveAgentModel };

export function readEveAgentModel(input: Record<string, unknown>): string {
  return typeof input.EVE_AGENT_MODEL === "string" &&
    input.EVE_AGENT_MODEL.length > 0
    ? input.EVE_AGENT_MODEL
    : typeof input.ANTHROPIC_MODEL === "string" &&
        input.ANTHROPIC_MODEL.length > 0
      ? input.ANTHROPIC_MODEL
      : defaultEveAgentModel;
}

export function readEveAnthropicBaseURL(
  input: Record<string, unknown>,
): string | undefined {
  if (
    typeof input.ANTHROPIC_BASE_URL !== "string" ||
    input.ANTHROPIC_BASE_URL.length === 0
  ) {
    return undefined;
  }

  return input.ANTHROPIC_BASE_URL.replace(/\/$/, "").endsWith("/v1")
    ? input.ANTHROPIC_BASE_URL.replace(/\/$/, "")
    : `${input.ANTHROPIC_BASE_URL.replace(/\/$/, "")}/v1`;
}

export function createEveAnthropicModel(
  input: Record<string, unknown>,
): AgentModelDefinition {
  const baseURL = readEveAnthropicBaseURL(input);
  const authToken =
    typeof input.ANTHROPIC_API_KEY === "string" &&
    input.ANTHROPIC_API_KEY.length > 0
      ? input.ANTHROPIC_API_KEY
      : typeof input.ANTHROPIC_AUTH_TOKEN === "string" &&
          input.ANTHROPIC_AUTH_TOKEN.length > 0
        ? input.ANTHROPIC_AUTH_TOKEN
        : undefined;
  const anthropic = createAnthropic({
    ...(authToken ? { apiKey: authToken } : {}),
    ...(baseURL ? { baseURL } : {}),
  });

  return anthropic(readEveAgentModel(input));
}
