import { describe, expect, it } from "vitest";
import { AgentRunEventSchema } from "./agent-run-events";

describe("AgentRunEventSchema", () => {
  it("accepts the shared Agent run event protocol", () => {
    expect(
      AgentRunEventSchema.parse({
        kind: "tool-call",
        callId: "call-1",
        toolName: "search",
        input: { q: "agentcn" },
      }),
    ).toEqual({
      kind: "tool-call",
      callId: "call-1",
      toolName: "search",
      input: { q: "agentcn" },
    });
    expect(
      AgentRunEventSchema.parse({
        kind: "tool-result",
        callId: "call-1",
        toolName: "search",
      }),
    ).toEqual({
      kind: "tool-result",
      callId: "call-1",
      toolName: "search",
    });
    expect(AgentRunEventSchema.parse({ kind: "text", text: "hello" })).toEqual({
      kind: "text",
      text: "hello",
    });
    expect(AgentRunEventSchema.parse({ kind: "done", result: "ok" })).toEqual({
      kind: "done",
      result: "ok",
    });
  });

  it("accepts error, artifact, and unknown events", () => {
    const artifacts = AgentRunEventSchema.parse({
      kind: "artifacts",
      tabs: [
        { id: "summary", label: "Summary", hint: "md", content: "# Done" },
      ],
    });

    expect(
      AgentRunEventSchema.parse({ kind: "error", message: "failed" }),
    ).toEqual({ kind: "error", message: "failed" });
    expect(
      AgentRunEventSchema.parse({ kind: "cancelled", reason: "user request" }),
    ).toEqual({ kind: "cancelled", reason: "user request" });
    expect(artifacts).toEqual({
      kind: "artifacts",
      tabs: [
        { id: "summary", label: "Summary", hint: "md", content: "# Done" },
      ],
    });
    expect(
      AgentRunEventSchema.parse({ kind: "unknown", text: "raw event" }),
    ).toEqual({ kind: "unknown", text: "raw event" });
  });
});
