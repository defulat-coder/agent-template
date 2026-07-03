import { z } from "zod";

export const AgentArtifactSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  content: z.string()
});

export const AgentRunEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool-call"), tool: z.string(), input: z.string() }),
  z.object({ kind: z.literal("tool-result"), tool: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("done"), result: z.string() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("artifacts"), tabs: z.array(AgentArtifactSchema) }),
  z.object({ kind: z.literal("unknown"), text: z.string() })
]);

export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;

export function normalizeAgentRunEvent(event: unknown): AgentRunEvent {
  if (!isRecord(event) || typeof event.type !== "string") {
    return { kind: "unknown", text: formatValue(event) };
  }

  switch (event.type) {
    case "tool:call":
      return {
        kind: "tool-call",
        tool: String(event.tool ?? "tool"),
        input: formatValue(event.input)
      };
    case "tool:result":
      return { kind: "tool-result", tool: String(event.tool ?? "tool") };
    case "text:delta":
      return { kind: "text", text: String(event.text ?? "") };
    case "done":
      return { kind: "done", result: formatValue(event.result, 2) };
    case "error":
      return { kind: "error", message: String(event.message ?? "Agent run failed") };
    case "artifacts":
      return {
        kind: "artifacts",
        tabs: Array.isArray(event.tabs) ? event.tabs.filter(isAgentArtifact) : []
      };
    default:
      return { kind: "unknown", text: formatValue(event) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentArtifact(value: unknown): value is AgentArtifact {
  return AgentArtifactSchema.safeParse(value).success;
}

function formatValue(value: unknown, spaces?: number) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, spaces) ?? String(value);
}
