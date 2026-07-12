import { describe, expect, it, vi } from "vitest";
import { cancelAgentRun, streamAgentChat } from "./agent-client";

describe("streamAgentChat", () => {
  it("consumes v1 Agent run frames and returns the terminal result", async () => {
    const events: unknown[] = [];
    const accepted: unknown[] = [];
    const fetcher = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "accepted",
          runId: "run-1",
          conversationId: "conversation-1",
        },
        {
          type: "event",
          runId: "run-1",
          sequence: 0,
          event: { kind: "text", text: "Working" },
        },
        {
          type: "terminal",
          runId: "run-1",
          result: {
            promptLength: 9,
            runtime: "claude",
            configured: true,
            model: "kimi-for-coding",
            status: "completed",
            events: [
              { kind: "text", text: "Working" },
              { kind: "done", result: "Done" },
            ],
            output: "Done",
            runId: "run-1",
            conversationId: "conversation-1",
          },
        },
      ]),
    );

    await expect(
      streamAgentChat({
        prompt: "Run agent",
        baseUrl: "http://api.test",
        fetcher,
        onEvent(event) {
          events.push(event);
        },
        onAccepted(frame) {
          accepted.push(frame);
        },
      }),
    ).resolves.toMatchObject({
      output: "Done",
      runId: "run-1",
      status: "completed",
    });

    expect(fetcher).toHaveBeenCalledWith("http://api.test/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Run agent" }),
    });
    expect(events).toEqual([{ kind: "text", text: "Working" }]);
    expect(accepted).toEqual([
      { runId: "run-1", conversationId: "conversation-1" },
    ]);
  });

  it("continues an existing platform conversation", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      streamResponse([
        {
          type: "terminal",
          runId: "run-2",
          result: {
            promptLength: 8,
            runtime: "claude",
            configured: true,
            model: "test",
            status: "completed",
            events: [],
            output: "Done",
            runId: "run-2",
            conversationId: "conversation-1",
          },
        },
      ]),
    );

    await streamAgentChat({
      conversationId: "conversation-1",
      prompt: "Continue",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Continue",
        conversationId: "conversation-1",
      }),
    });
  });

  it("preserves the v1 stream error envelope", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          createStream(
            'event: error\ndata: {"error":{"code":"CONVERSATION_BUSY","message":"Agent conversation 已有运行中的 Agent run","retryable":true}}\n\n',
          ),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );

    await expect(
      streamAgentChat({ prompt: "Run agent", fetcher }),
    ).rejects.toMatchObject({
      code: "CONVERSATION_BUSY",
      message: "Agent conversation 已有运行中的 Agent run",
      retryable: true,
    });
  });

  it("reports caller cancellation separately", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(
      streamAgentChat({
        prompt: "Run agent",
        fetcher,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Agent chat cancelled");
  });

  it("releases the shared SSE reader after a completed stream", async () => {
    const releaseLock = vi.fn();
    const cancel = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          frame({
            type: "terminal",
            runId: "run-1",
            result: {
              promptLength: 9,
              runtime: "claude",
              configured: true,
              model: "test",
              status: "completed",
              events: [],
              output: "Done",
              runId: "run-1",
            },
          }),
        ),
      })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const fetcher = vi.fn().mockResolvedValue({
      body: { getReader: () => ({ cancel, read, releaseLock }) },
      ok: true,
      status: 200,
    });

    await streamAgentChat({ prompt: "Run agent", fetcher });

    expect(releaseLock).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("rejects an unterminated v1 frame before buffering without limit", async () => {
    const releaseLock = vi.fn();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      body: {
        getReader: () => ({
          cancel,
          read: vi.fn().mockResolvedValue({
            done: false,
            value: new Uint8Array(16 * 1024 * 1024 + 1),
          }),
          releaseLock,
        }),
      },
      ok: true,
      status: 200,
    });

    await expect(
      streamAgentChat({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow("Agent SSE message exceeded 16 MiB");
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });
});

describe("cancelAgentRun", () => {
  it("uses the minimal same-origin run adapter", async () => {
    const snapshot = {
      id: "run-1",
      conversationId: null,
      prompt: "Run agent",
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
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    });

    await expect(
      cancelAgentRun("run-1", { baseUrl: "http://api.test", fetcher }),
    ).resolves.toMatchObject({ id: "run-1", status: "queued" });
    expect(fetcher).toHaveBeenCalledWith("http://api.test/agent/runs/run-1", {
      method: "DELETE",
    });
  });
});

function streamResponse(frames: unknown[]) {
  return new Response(createStream(frames.map(frame).join("")), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function frame(value: unknown) {
  return `event: frame\ndata: ${JSON.stringify(value)}\n\n`;
}

function createStream(input: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });
}
