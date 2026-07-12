import { describe, expect, it } from "vitest";
import {
  AgentRunEventSchema,
  appendCompactedAgentRunEvent,
  type AgentRunEvent,
} from "./agent-run-events";

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

  it("accepts a runtime-neutral input request", () => {
    expect(
      AgentRunEventSchema.parse({
        kind: "input-request",
        request: {
          requestId: "request-1",
          type: "question",
          prompt: "是否排除内部测试订单？",
          options: [
            { id: "exclude", label: "排除并继续", style: "primary" },
            { id: "keep", label: "保留" },
          ],
          action: {
            callId: "call-1",
            toolName: "AskUserQuestion",
            input: { source: "agent" },
          },
        },
      }),
    ).toMatchObject({
      kind: "input-request",
      request: { requestId: "request-1", type: "question" },
    });
  });

  it("accepts metadata-only semantic query events", () => {
    expect(
      AgentRunEventSchema.parse({
        kind: "semantic-query",
        callId: "call-semantic-1",
        status: "result",
        queryId: "query-1",
        catalog: "finance",
        catalogVersion: 2,
        contractId: "finance_overview",
        toolName: "summarize_finance_overview",
        planHash: "sha256:plan-1",
        rowCount: 4,
        durationMs: 28,
      }),
    ).toEqual({
      kind: "semantic-query",
      callId: "call-semantic-1",
      status: "result",
      queryId: "query-1",
      catalog: "finance",
      catalogVersion: 2,
      contractId: "finance_overview",
      toolName: "summarize_finance_overview",
      planHash: "sha256:plan-1",
      rowCount: 4,
      durationMs: 28,
    });

    for (const status of ["clarification", "unsupported"] as const) {
      const catalogVersion = status === "unsupported" ? "2026-07" : undefined;
      expect(
        AgentRunEventSchema.parse({
          kind: "semantic-query",
          callId: `call-${status}`,
          status,
          queryId: `query-${status}`,
          ...(catalogVersion ? { catalogVersion } : {}),
        }),
      ).toEqual({
        kind: "semantic-query",
        callId: `call-${status}`,
        status,
        queryId: `query-${status}`,
        ...(catalogVersion ? { catalogVersion } : {}),
      });
    }
  });

  it("rejects semantic query payload data and invalid metadata", () => {
    const baseEvent = {
      kind: "semantic-query",
      callId: "call-semantic-1",
      status: "result",
      queryId: "query-1",
    } as const;

    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, data: { total: 10 } })
        .success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, rows: [{ total: 10 }] })
        .success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, rowCount: -1 }).success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, durationMs: 1.5 }).success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, catalogVersion: "" })
        .success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({ ...baseEvent, status: "completed" })
        .success,
    ).toBe(false);
    expect(
      AgentRunEventSchema.safeParse({
        kind: "semantic-query",
        callId: "call-semantic-1",
        status: "result",
      }).success,
    ).toBe(false);
  });

  it("keeps only the latest consecutive cumulative text snapshot", () => {
    const events: AgentRunEvent[] = [
      { kind: "tool-call", callId: "call-1", toolName: "search", input: {} },
    ];

    appendCompactedAgentRunEvent(events, { kind: "text", text: "Hel" });
    appendCompactedAgentRunEvent(events, { kind: "text", text: "Hello" });
    appendCompactedAgentRunEvent(events, { kind: "done", result: "Hello" });

    expect(events).toEqual([
      { kind: "tool-call", callId: "call-1", toolName: "search", input: {} },
      { kind: "text", text: "Hello" },
      { kind: "done", result: "Hello" },
    ]);
  });
});
