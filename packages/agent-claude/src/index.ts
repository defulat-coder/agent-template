import { z } from "zod";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export const defaultClaudeAgentModel = "claude-sonnet-4-5";

export const ClaudeAgentConfigSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default(defaultClaudeAgentModel)
});

export type ClaudeAgentConfig = z.infer<typeof ClaudeAgentConfigSchema>;

export type ClaudeAgentRuntimeState = {
  configured: boolean;
  model: string;
};

export type ClaudeAgentJobInput = {
  prompt: string;
};

export type ClaudeAgentJobRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "completed";
      events: SDKMessage[];
      output: string;
      sessionId?: string;
    }
  | {
      status: "failed";
      events: SDKMessage[];
      reason: string;
      sessionId?: string;
    };

export function parseClaudeAgentConfig(input: Record<string, unknown>): ClaudeAgentConfig {
  return ClaudeAgentConfigSchema.parse({
    apiKey: input.ANTHROPIC_API_KEY || undefined,
    model: input.CLAUDE_AGENT_MODEL || undefined
  });
}

export function getClaudeAgentRuntimeState(config: ClaudeAgentConfig): ClaudeAgentRuntimeState {
  return {
    configured: Boolean(config.apiKey),
    model: config.model
  };
}

export function getClaudeAgentRuntimeStateFromEnv(input: Record<string, unknown>): ClaudeAgentRuntimeState {
  return getClaudeAgentRuntimeState(parseClaudeAgentConfig(input));
}

export async function loadClaudeAgentSdk() {
  return import("@anthropic-ai/claude-agent-sdk");
}

export async function runClaudeAgentJob(
  input: ClaudeAgentJobInput,
  config: ClaudeAgentConfig,
  options: {
    loadSdk?: typeof loadClaudeAgentSdk;
  } = {}
): Promise<ClaudeAgentJobRunResult> {
  if (!config.apiKey) {
    return { status: "skipped", reason: "ANTHROPIC_API_KEY is not configured" };
  }

  const sdk = await (options.loadSdk ?? loadClaudeAgentSdk)();
  const events: SDKMessage[] = [];
  let result: Extract<SDKMessage, { type: "result" }> | undefined;
  let sessionId: string | undefined;

  for await (const message of sdk.query({
    prompt: input.prompt,
    options: {
      maxTurns: 1,
      model: config.model
    }
  })) {
    if ("session_id" in message) {
      sessionId = message.session_id;
    }

    events.push(message);

    if (message.type === "result") {
      result = message;
    }
  }

  if (!result) {
    return {
      status: "failed",
      events,
      reason: "Claude Agent SDK did not return a result",
      ...(sessionId ? { sessionId } : {})
    };
  }

  if (result.subtype !== "success" || result.is_error) {
    const reason = "errors" in result ? result.errors.join("\n") : result.result;

    return {
      status: "failed",
      events,
      reason: reason || "Claude Agent SDK run failed",
      ...(sessionId ? { sessionId } : {})
    };
  }

  return { status: "completed", events, output: result.result, ...(sessionId ? { sessionId } : {}) };
}
