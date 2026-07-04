import { z } from "zod";
import { Client, type MessageResult } from "eve/client";
import { defaultEveAgentModel, readEveAgentModel } from "./config.js";

export const eveAgentDirectory = "packages/agent-eve/agent";
export { defaultEveAgentModel, readEveAgentModel };

export const EveAgentConfigSchema = z.object({
  host: z.string().min(1).optional(),
  model: z.string().min(1).default(defaultEveAgentModel)
});

export type EveAgentConfig = z.infer<typeof EveAgentConfigSchema>;

export type EveAgentRuntimeState = {
  configured: boolean;
  model: string;
  authoredSurface: string;
  host?: string;
};

export type EveAgentJobInput = {
  prompt: string;
};

export type EveAgentJobRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "completed";
      events: unknown[];
      output: string;
      sessionId: string;
    }
  | {
      status: "failed";
      events: unknown[];
      reason: string;
      sessionId?: string;
    };

type EveClient = {
  session(): {
    send(input: string): Promise<{
      result(): Promise<MessageResult>;
    }>;
  };
};

export function parseEveAgentConfig(input: Record<string, unknown>): EveAgentConfig {
  return EveAgentConfigSchema.parse({
    host: typeof input.EVE_AGENT_HOST === "string" && input.EVE_AGENT_HOST.length > 0 ? input.EVE_AGENT_HOST : undefined,
    model: readEveAgentModel(input)
  });
}

export function getEveAgentRuntimeState(config: EveAgentConfig): EveAgentRuntimeState {
  return {
    configured: Boolean(config.host),
    model: config.model,
    authoredSurface: eveAgentDirectory,
    ...(config.host ? { host: config.host } : {})
  };
}

export function getEveAgentRuntimeStateFromEnv(input: Record<string, unknown>): EveAgentRuntimeState {
  return getEveAgentRuntimeState(parseEveAgentConfig(input));
}

export async function runEveAgentJob(
  input: EveAgentJobInput,
  config: EveAgentConfig,
  options: {
    createClient?: (host: string) => EveClient;
  } = {}
): Promise<EveAgentJobRunResult> {
  if (!config.host) {
    return { status: "skipped", reason: "EVE_AGENT_HOST is not configured" };
  }

  const client = (options.createClient ?? ((host: string) => new Client({ host })))(config.host);
  const response = await client.session().send(input.prompt);
  const result = await response.result();

  if (result.status === "failed") {
    return {
      status: "failed",
      events: [...result.events],
      reason: result.message ?? "Eve Agent runtime failed",
      sessionId: result.sessionId
    };
  }

  return {
    status: "completed",
    events: [...result.events],
    output: result.message ?? formatEveOutput(result.data),
    sessionId: result.sessionId
  };
}

function formatEveOutput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "";
}
