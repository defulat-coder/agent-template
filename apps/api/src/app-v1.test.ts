import { describe, expect, it } from "vitest";
import type {
  AgentConversationLifecycle,
  AgentRunLifecycle,
} from "@agent-template/agent";
import type {
  AgentConversationView,
  AgentRunSnapshot,
} from "@agent-template/shared";
import {
  AgentConversationBusyError,
  AgentRunSummarySchema,
} from "@agent-template/shared";
import { buildApp } from "./app";
import { loadEnv } from "./env";

const token = "test-agent-token-123";

describe("Agent API v1", () => {
  it("requires bearer authentication when configured", async () => {
    const app = buildV1App();
    const response = await app.inject({
      method: "GET",
      url: "/v1/agent/meta",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "需要有效的 Agent API Token",
        retryable: false,
      },
    });
  });

  it("creates and lists platform-owned Agent conversations", async () => {
    const conversation = createConversation();
    const lifecycle = createConversationLifecycleStub({
      create: async () => conversation,
      list: async () => ({ items: [conversation], nextCursor: null }),
    });
    const app = buildV1App({ agentConversationLifecycle: lifecycle });

    const created = await app.inject({
      method: "POST",
      url: "/v1/agent/conversations",
      headers: authorization(),
      payload: { title: "订单分析" },
    });
    const listed = await app.inject({
      method: "GET",
      url: "/v1/agent/conversations?limit=20",
      headers: authorization(),
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id: conversation.id });
    expect(listed.json()).toMatchObject({
      items: [{ id: conversation.id }],
      nextCursor: null,
    });
  });

  it("streams accepted, ordered event, and terminal frames", async () => {
    const snapshot = createRunSnapshot();
    const conversationLifecycle = createConversationLifecycleStub({
      async send(_conversationId, raw, _env, options) {
        options?.onAccepted?.(snapshot);
        options?.onEvent?.({ kind: "text", text: "Working" });
        return {
          status: "completed",
          promptLength: (raw as { prompt: string }).prompt.length,
          runtime: "claude",
          configured: true,
          model: "test-model",
          runId: snapshot.id,
          conversationId: "conversation-1",
          events: [
            { kind: "text", text: "Working" },
            { kind: "done", result: "Done" },
          ],
          output: "Done",
        };
      },
    });
    const app = buildV1App({
      agentConversationLifecycle: conversationLifecycle,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/conversations/conversation-1/runs",
      headers: authorization(),
      payload: { prompt: "Run" },
    });

    expect(response.statusCode).toBe(200);
    const frames = response.body
      .split("\n\n")
      .filter(Boolean)
      .map((block) => JSON.parse(block.split("\ndata: ")[1]!));
    expect(frames.map((frame) => frame.type)).toEqual([
      "accepted",
      "event",
      "terminal",
    ]);
    expect(frames[1]).toMatchObject({ sequence: 0 });
  });

  it("lists Agent runs through the durable lifecycle", async () => {
    const snapshot = createRunSnapshot();
    const runs = createRunLifecycleStub({
      list: async () => ({
        items: [
          AgentRunSummarySchema.parse({
            ...snapshot,
            promptPreview: snapshot.prompt,
          }),
        ],
        nextCursor: null,
      }),
    });
    const app = buildV1App({ agentRunLifecycle: runs });

    const response = await app.inject({
      method: "GET",
      url: "/v1/agent/runs?status=queued&limit=20",
      headers: authorization(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ id: snapshot.id, status: "queued" }],
    });
  });

  it("advances the follow cursor without replaying prior Agent run events", async () => {
    const snapshot = createRunSnapshot();
    const createdAt = "2026-07-11T00:00:01.000Z";
    const observedAfter: number[] = [];
    const result = {
      status: "completed" as const,
      promptLength: snapshot.prompt.length,
      runtime: "claude" as const,
      configured: true,
      model: "test-model",
      runId: snapshot.id,
      events: [
        { kind: "text" as const, text: "old" },
        { kind: "text" as const, text: "new" },
        { kind: "done" as const, result: "Done" },
      ],
      output: "Done",
    };
    const observations = [
      {
        runId: snapshot.id,
        terminal: false as const,
        events: [
          {
            sequence: 2,
            executionAttempt: 1,
            createdAt,
            event: { kind: "text" as const, text: "new" },
          },
        ],
      },
      {
        runId: snapshot.id,
        terminal: true as const,
        events: [
          {
            sequence: 3,
            executionAttempt: 1,
            createdAt,
            event: { kind: "done" as const, result: "Done" },
          },
        ],
        result,
      },
    ];
    const runs = createRunLifecycleStub({
      async observe(_runId, afterSequence) {
        observedAfter.push(afterSequence);
        return observations.shift();
      },
    });
    const app = buildV1App({ agentRunLifecycle: runs });

    const response = await app.inject({
      method: "GET",
      url: `/v1/agent/runs/${snapshot.id}/events?afterSequence=1&follow=true`,
      headers: authorization(),
    });
    const frames = response.body
      .split("\n\n")
      .filter(Boolean)
      .map((block) => JSON.parse(block.split("\ndata: ")[1]!));

    expect(observedAfter).toEqual([1, 2]);
    expect(frames.map((frame) => frame.type)).toEqual([
      "event",
      "event",
      "terminal",
    ]);
    expect(frames.slice(0, 2).map((frame) => frame.sequence)).toEqual([2, 3]);
  });

  it("rejects an invalid Agent run event cursor before opening a stream", async () => {
    const runs = createRunLifecycleStub();
    const app = buildV1App({ agentRunLifecycle: runs });

    const response = await app.inject({
      method: "GET",
      url: "/v1/agent/runs/run-1/events?afterSequence=not-a-number&follow=true",
      headers: authorization(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "请求参数无效",
        retryable: false,
      },
    });
  });

  it("maps the domain conversation busy error to a stable conflict", async () => {
    const lifecycle = createConversationLifecycleStub({
      async send() {
        throw new AgentConversationBusyError("conversation-1");
      },
    });
    const app = buildV1App({ agentConversationLifecycle: lifecycle });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agent/conversations/conversation-1/runs",
      headers: authorization(),
      payload: { prompt: "Run" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"code":"CONVERSATION_BUSY"');
    expect(response.body).toContain("已有一个运行中的 Agent run");
  });
});

function buildV1App(
  overrides: {
    agentConversationLifecycle?: AgentConversationLifecycle;
    agentRunLifecycle?: AgentRunLifecycle;
  } = {},
) {
  return buildApp({
    env: loadEnv({ NODE_ENV: "test", AGENT_API_TOKEN: token }),
    checkExternal: false,
    agentConversationLifecycle:
      overrides.agentConversationLifecycle ?? createConversationLifecycleStub(),
    agentRunLifecycle: overrides.agentRunLifecycle ?? createRunLifecycleStub(),
    agentJobIntake: {
      enqueue: async () => ({ id: "run-job-1", queue: "agent-jobs" }),
    },
  });
}

function authorization() {
  return { authorization: `Bearer ${token}` };
}

function createConversation(): AgentConversationView {
  return {
    id: "conversation-1",
    title: "订单分析",
    runtime: "claude",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    lastRun: null,
    runs: [],
  };
}

function createRunSnapshot(): AgentRunSnapshot {
  return {
    id: "run-1",
    conversationId: "conversation-1",
    prompt: "Run",
    requestedAt: "2026-07-11T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    cancelRequestedAt: null,
    status: "queued",
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

function createConversationLifecycleStub(
  overrides: Partial<AgentConversationLifecycle> = {},
): AgentConversationLifecycle {
  const conversation = createConversation();
  return {
    create: async () => conversation,
    get: async () => conversation,
    list: async () => ({ items: [], nextCursor: null }),
    send: async () => ({
      status: "skipped",
      promptLength: 0,
      runtime: "claude",
      configured: false,
      model: "unknown",
      reason: "not implemented",
    }),
    ...overrides,
  };
}

function createRunLifecycleStub(
  overrides: Partial<AgentRunLifecycle> = {},
): AgentRunLifecycle {
  const snapshot = createRunSnapshot();
  const skipped = async () => ({
    status: "skipped" as const,
    promptLength: snapshot.prompt.length,
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
