import { describe, expect, it } from "vitest";
import { AgentRunResultSchema, AgentRunSnapshotSchema } from "./agent-run";

describe("AgentRunResultSchema", () => {
  it("accepts completed Agent runs with run events", () => {
    expect(
      AgentRunResultSchema.parse({
        configured: true,
        events: [{ kind: "done", result: "Done" }],
        model: "kimi-for-coding",
        output: "Done",
        promptLength: 9,
        runtime: "claude",
        status: "completed",
      }),
    ).toEqual({
      configured: true,
      events: [{ kind: "done", result: "Done" }],
      model: "kimi-for-coding",
      output: "Done",
      promptLength: 9,
      runtime: "claude",
      status: "completed",
    });
  });

  it("rejects terminal results that omit their status-specific invariant", () => {
    expect(() =>
      AgentRunResultSchema.parse({
        configured: true,
        events: [],
        model: "kimi-for-coding",
        promptLength: 9,
        runtime: "claude",
        status: "completed",
      }),
    ).toThrow();
    expect(() =>
      AgentRunResultSchema.parse({
        configured: true,
        events: [],
        model: "kimi-for-coding",
        promptLength: 9,
        runtime: "claude",
        status: "failed",
      }),
    ).toThrow();
  });

  it("keeps persistence metadata in snapshot event envelopes", () => {
    const snapshot = {
      id: "run-1",
      conversationId: null,
      prompt: "Run",
      requestedAt: "2026-07-11T00:00:00.000Z",
      startedAt: "2026-07-11T00:00:01.000Z",
      completedAt: "2026-07-11T00:00:02.000Z",
      cancelRequestedAt: null,
      status: "completed",
      executionAttempt: 2,
      leaseExpiresAt: null,
      heartbeatAt: "2026-07-11T00:00:01.500Z",
      runtime: "claude",
      model: "test-model",
      output: "Done",
      reason: null,
      events: [
        {
          sequence: 3,
          executionAttempt: 2,
          createdAt: "2026-07-11T00:00:01.500Z",
          event: { kind: "done", result: "Done" },
        },
      ],
    };

    expect(AgentRunSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      AgentRunSnapshotSchema.parse({
        ...snapshot,
        runtimeSessionId: "private-runtime-session",
      }),
    ).toEqual(snapshot);
    expect(() =>
      AgentRunSnapshotSchema.parse({
        ...snapshot,
        events: [{ kind: "done", result: "Done" }],
      }),
    ).toThrow();
  });

  it("does not expose runtime continuation handles in terminal results", () => {
    const result = AgentRunResultSchema.parse({
      configured: true,
      events: [],
      model: "kimi-for-coding",
      output: "Done",
      promptLength: 9,
      runtime: "claude",
      runtimeSessionId: "private-runtime-session",
      status: "completed",
    });

    expect(result).not.toHaveProperty("runtimeSessionId");
  });
});
