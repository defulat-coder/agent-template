export type AgentArtifact = {
  id: string;
  label: string;
  hint: string;
  content: string;
};

export type AgentRunEvent =
  | { kind: "tool-call"; tool: string; input: string }
  | { kind: "tool-result"; tool: string }
  | { kind: "text"; text: string }
  | { kind: "done"; result: string }
  | { kind: "error"; message: string }
  | { kind: "artifacts"; tabs: AgentArtifact[] }
  | { kind: "unknown"; text: string };

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
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.hint === "string" &&
    typeof value.content === "string"
  );
}

function formatValue(value: unknown, spaces?: number) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, spaces);
}
