import { describe, expect, it } from "vitest";
import { normalizeAgentRunEvent } from "./agent-run-events";

describe("normalizeAgentRunEvent", () => {
  it("normalizes known Agent run events", () => {
    expect(normalizeAgentRunEvent({ type: "tool:call", tool: "search", input: { q: "agentcn" } })).toEqual({
      kind: "tool-call",
      tool: "search",
      input: "{\"q\":\"agentcn\"}"
    });
    expect(normalizeAgentRunEvent({ type: "tool:result", tool: "search" })).toEqual({
      kind: "tool-result",
      tool: "search"
    });
    expect(normalizeAgentRunEvent({ type: "text:delta", text: "hello" })).toEqual({
      kind: "text",
      text: "hello"
    });
    expect(normalizeAgentRunEvent({ type: "done", result: { ok: true } })).toEqual({
      kind: "done",
      result: "{\n  \"ok\": true\n}"
    });
  });

  it("normalizes error and artifact events", () => {
    expect(normalizeAgentRunEvent({ type: "error", message: "failed" })).toEqual({
      kind: "error",
      message: "failed"
    });
    expect(
      normalizeAgentRunEvent({
        type: "artifacts",
        tabs: [{ id: "summary", label: "Summary", hint: "md", content: "# Done" }]
      })
    ).toEqual({
      kind: "artifacts",
      tabs: [{ id: "summary", label: "Summary", hint: "md", content: "# Done" }]
    });
  });

  it("keeps unknown Agent run events visible", () => {
    expect(normalizeAgentRunEvent({ type: "custom:event", value: 1 })).toEqual({
      kind: "unknown",
      text: "{\"type\":\"custom:event\",\"value\":1}"
    });
  });
});
