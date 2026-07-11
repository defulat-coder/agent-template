import { describe, expect, it, vi } from "vitest";
import type { AgentPlatformClient } from "@agent-template/agent-client";
import { createCli } from "./cli";

describe("agent-template CLI", () => {
  it("lists conversations through the Agent Client seam", async () => {
    const client = createFakeClient();
    const result = await serve(createCli({ client }), [
      "conversations",
      "list",
      "--format",
      "json",
    ]);

    expect(client.conversations.list).toHaveBeenCalledWith({ limit: 20 });
    expect(JSON.parse(result.output)).toMatchObject({
      items: [{ id: "conversation-1" }],
    });
    expect(result.exitCode).toBeUndefined();
  });

  it("creates a conversation before streaming chat frames", async () => {
    const client = createFakeClient();
    const result = await serve(createCli({ client }), [
      "chat",
      "分析订单",
      "--format",
      "jsonl",
    ]);

    expect(client.conversations.create).toHaveBeenCalled();
    expect(client.conversations.send).toHaveBeenCalledWith("conversation-1", {
      prompt: "分析订单",
    });
    expect(result.output).toContain('"type":"accepted"');
    expect(result.output).toContain('"type":"terminal"');
    expect(result.exitCode).toBeUndefined();
  });
});

async function serve(cli: ReturnType<typeof createCli>, argv: string[]) {
  let output = "";
  let exitCode: number | undefined;
  await cli.serve(argv, {
    stdout(value) {
      output += value;
    },
    exit(code) {
      exitCode = code;
    },
  });
  return { output, exitCode };
}

function createFakeClient(): AgentPlatformClient {
  const conversation = {
    id: "conversation-1",
    title: "分析订单",
    runtime: "claude" as const,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    lastRun: null,
    runs: [],
  };
  const frames = async function* () {
    yield {
      type: "accepted" as const,
      runId: "run-1",
      conversationId: conversation.id,
    };
    yield {
      type: "terminal" as const,
      runId: "run-1",
      result: {
        status: "completed" as const,
        promptLength: 4,
        runtime: "claude" as const,
        configured: true,
        model: "test-model",
        runId: "run-1",
        conversationId: conversation.id,
        events: [{ kind: "done" as const, result: "Done" }],
        output: "Done",
      },
    };
  };
  return {
    conversations: {
      create: vi.fn(async () => conversation),
      list: vi.fn(async () => ({ items: [conversation], nextCursor: null })),
      get: vi.fn(async () => conversation),
      send: vi.fn(() => frames()),
    },
    runs: {
      start: vi.fn(() => frames()),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => {
        throw new Error("not implemented");
      }),
      watch: vi.fn(() => frames()),
      cancel: vi.fn(async () => {
        throw new Error("not implemented");
      }),
    },
    jobs: {
      submit: vi.fn(async () => ({ runId: "run-1" })),
    },
    health: vi.fn(async () => {
      throw new Error("not implemented");
    }),
    meta: vi.fn(async () => ({ protocolVersion: "1", capabilities: [] })),
  };
}
