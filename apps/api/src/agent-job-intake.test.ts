import { describe, expect, it } from "vitest";
import type { AgentRunLifecycle } from "@agent-template/agent";
import { createAgentJobIntake } from "./agent-job-intake.js";

describe("createAgentJobIntake", () => {
  it("validates, enqueues, and closes the Agent job queue", async () => {
    const calls: unknown[] = [];
    const intake = createAgentJobIntake({
      agentRunLifecycle: createAgentRunLifecycleStub({
        async queue(input) {
          calls.push(["queueRun", input]);
          return createRunSnapshot();
        },
      }),
      redisUrl: "redis://localhost:16379",
      createQueue: (redisUrl) => {
        calls.push(["createQueue", redisUrl]);

        return {
          name: "agent-jobs",
          async add(name, payload) {
            calls.push(["add", name, payload]);
            return { id: "job-1" };
          },
          async close() {
            calls.push(["close"]);
          },
        };
      },
    });
    const result = await intake.enqueue({
      prompt: "Summarize this template",
      requestedAt: "2026-06-26T00:00:00.000Z",
    });

    expect(result).toEqual({ id: "run-1", queue: "agent-jobs" });
    expect(calls).toEqual([
      [
        "queueRun",
        {
          prompt: "Summarize this template",
          requestedAt: "2026-06-26T00:00:00.000Z",
        },
      ],
      ["createQueue", "redis://localhost:16379"],
      [
        "add",
        "agent.run",
        {
          runId: "run-1",
        },
      ],
      ["close"],
    ]);
  });
});

function createRunSnapshot() {
  return {
    id: "run-1",
    prompt: "Summarize this template",
    requestedAt: "2026-06-26T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    status: "queued" as const,
    executionAttempt: 0,
    leaseExpiresAt: null,
    heartbeatAt: null,
    runtime: null,
    model: null,
    output: null,
    reason: null,
    sessionId: null,
    events: [],
  };
}

function createAgentRunLifecycleStub(
  overrides: Partial<AgentRunLifecycle>,
): AgentRunLifecycle {
  const snapshot = createRunSnapshot();
  const skipped = async () => ({
    configured: false,
    model: "unknown",
    promptLength: snapshot.prompt.length,
    reason: "not implemented",
    runId: snapshot.id,
    runtime: "claude" as const,
    status: "skipped" as const,
  });
  return {
    queue: async () => snapshot,
    run: skipped,
    resume: skipped,
    get: async () => snapshot,
    cancel: async () => snapshot,
    failQueued: async () => snapshot,
    ...overrides,
  };
}
