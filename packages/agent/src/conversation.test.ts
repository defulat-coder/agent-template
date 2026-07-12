import { describe, expect, it, vi } from "vitest";
import type { AgentRunLifecycle } from "./lifecycle";
import {
  AgentConversationRuntimeConflictError,
  createAgentConversationLifecycle,
  type AgentConversationRepository,
  type StoredAgentConversation,
} from "./conversation";

describe("Agent conversation lifecycle", () => {
  it("keeps runtime continuation private and resumes through the selected adapter", async () => {
    const run = createRunSnapshot();
    const runs = createRunsStub({
      queue: vi.fn(async () => run),
      resume: vi.fn(async () => ({
        status: "completed" as const,
        promptLength: 8,
        runtime: "eve" as const,
        configured: true,
        model: "test-model",
        runId: run.id,
        conversationId: "conversation-1",
        events: [{ kind: "done" as const, result: "Done" }],
        output: "Done",
      })),
    });
    const lifecycle = createAgentConversationLifecycle({
      repository: createRepository({
        runtime: "eve",
        runtimeContinuation: {
          runtime: "eve",
          sessionState: {
            continuationToken: "secret-continuation",
            sessionId: "runtime-session-1",
            streamIndex: 4,
          },
        },
      }),
      runs,
    });

    await lifecycle.send(
      "conversation-1",
      { prompt: "Continue" },
      { AGENT_RUNTIME: "eve" },
    );

    expect(runs.queue).toHaveBeenCalledWith(
      { prompt: "Continue" },
      { conversationId: "conversation-1" },
    );
    expect(runs.resume).toHaveBeenCalledWith(
      run.id,
      { AGENT_RUNTIME: "eve" },
      expect.objectContaining({
        captureContinuation: true,
        continuation: {
          runtime: "eve",
          sessionState: {
            continuationToken: "secret-continuation",
            sessionId: "runtime-session-1",
            streamIndex: 4,
          },
        },
      }),
    );
  });

  it("rejects a conversation after the deployment runtime changes", async () => {
    const lifecycle = createAgentConversationLifecycle({
      repository: createRepository({ runtime: "claude" }),
      runs: createRunsStub(),
    });

    await expect(
      lifecycle.send(
        "conversation-1",
        { prompt: "Continue" },
        { AGENT_RUNTIME: "eve" },
      ),
    ).rejects.toBeInstanceOf(AgentConversationRuntimeConflictError);
  });
});

function createRepository(
  overrides: Partial<StoredAgentConversation> = {},
): AgentConversationRepository {
  const conversation = {
    id: "conversation-1",
    title: "Conversation",
    runtime: "claude" as const,
    runtimeContinuation: null,
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    runs: [],
    ...overrides,
  };
  return {
    create: async () => conversation,
    find: async () => conversation,
    list: async () => ({ items: [conversation], nextCursor: null }),
  };
}

function createRunsStub(
  overrides: Partial<AgentRunLifecycle> = {},
): AgentRunLifecycle {
  const snapshot = createRunSnapshot();
  const skipped = async () => ({
    status: "skipped" as const,
    promptLength: 0,
    runtime: "claude" as const,
    configured: false,
    model: "unknown",
    reason: "not implemented",
  });
  return {
    queue: async () => snapshot,
    run: skipped,
    resume: skipped,
    get: async () => snapshot,
    observe: async () => ({
      runId: snapshot.id,
      terminal: false,
      events: [],
    }),
    list: async () => ({ items: [], nextCursor: null }),
    cancel: async () => snapshot,
    failQueued: async () => snapshot,
    ...overrides,
  };
}

function createRunSnapshot() {
  return {
    id: "run-1",
    conversationId: "conversation-1",
    prompt: "Continue",
    requestedAt: "2026-07-11T00:00:00.000Z",
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
    events: [],
  };
}
