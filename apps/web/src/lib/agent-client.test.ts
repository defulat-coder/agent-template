import { describe, expect, it, vi } from "vitest";
import {
  cancelAgentRun,
  fetchAgentRun,
  streamAgentChat,
  submitAgentJob,
} from "./agent-client";

describe("submitAgentJob", () => {
  it("rejects an empty prompt before calling the backend", async () => {
    const fetcher = vi.fn();

    await expect(submitAgentJob({ prompt: "   ", fetcher })).rejects.toThrow(
      "Prompt is required",
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("submits a valid Agent job to the configured API base URL", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-1", queue: "agent-jobs" }),
    });

    await submitAgentJob({
      prompt: "  Summarize this template  ",
      baseUrl: "http://api.test",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith("http://api.test/agent/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      prompt: "Summarize this template",
    });
    expect(
      new Date(
        JSON.parse(fetcher.mock.calls[0][1].body).requestedAt,
      ).toString(),
    ).not.toBe("Invalid Date");
  });

  it("returns accepted Agent job metadata from the backend", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-42", queue: "agent-jobs" }),
    });

    await expect(
      submitAgentJob({ prompt: "Run agent", fetcher }),
    ).resolves.toEqual({
      id: "job-42",
      queue: "agent-jobs",
    });
  });

  it("reports backend submission failures separately from network failures", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    await expect(
      submitAgentJob({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow("Agent job intake rejected the request with status 400");
  });

  it("reports network failures separately from backend submission failures", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      submitAgentJob({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow("Unable to reach Agent job intake API");
  });

  it("rejects invalid Agent job intake metadata from the backend", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-1" }),
    });

    await expect(
      submitAgentJob({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow();
  });
});

describe("streamAgentChat", () => {
  it("streams Agent events and returns the final result", async () => {
    const events: unknown[] = [];
    const accepted: unknown[] = [];
    const fetcher = vi.fn().mockResolvedValue({
      body: createStream(
        [
          'event: run-accepted\ndata: {"runId":"run-1","conversationId":"conversation-1"}\n\n',
          'event: agent-event\ndata: {"kind":"text","text":"Working"}\n\n',
          'event: result\ndata: {"promptLength":9,"runtime":"claude","configured":true,"model":"kimi-for-coding","status":"completed","events":[{"kind":"text","text":"Working"},{"kind":"done","result":"Done"}],"output":"Done","runId":"run-1"}\n\n',
        ].join(""),
      ),
      ok: true,
    });

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
    const fetcher = vi.fn().mockResolvedValue({
      body: createStream(
        'event: result\ndata: {"promptLength":8,"runtime":"claude","configured":true,"model":"test","status":"completed","events":[],"output":"Done","runId":"run-2","conversationId":"conversation-1"}\n\n',
      ),
      ok: true,
    });

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

  it("releases the SSE reader after a completed stream", async () => {
    const releaseLock = vi.fn();
    const cancel = vi.fn();
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(
          'event: result\ndata: {"promptLength":9,"runtime":"claude","configured":true,"model":"test","status":"completed","events":[],"output":"Done"}\n\n',
        ),
      })
      .mockResolvedValueOnce({ done: true, value: undefined });
    const fetcher = vi.fn().mockResolvedValue({
      body: { getReader: () => ({ cancel, read, releaseLock }) },
      ok: true,
    });

    await streamAgentChat({ prompt: "Run agent", fetcher });

    expect(releaseLock).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels and releases the SSE reader after a protocol error", async () => {
    const releaseLock = vi.fn();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      body: {
        getReader: () => ({
          cancel,
          read: vi.fn().mockResolvedValue({
            done: false,
            value: new TextEncoder().encode(
              "event: result\ndata: not-json\n\n",
            ),
          }),
          releaseLock,
        }),
      },
      ok: true,
    });

    await expect(
      streamAgentChat({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow();

    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("rejects an unterminated SSE message before buffering without limit", async () => {
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
    });

    await expect(
      streamAgentChat({ prompt: "Run agent", fetcher }),
    ).rejects.toThrow("Agent chat SSE message exceeded 16 MiB");
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });
});

describe("Agent run lifecycle client", () => {
  it("loads and cancels a durable Agent run", async () => {
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
      fetchAgentRun("run-1", { baseUrl: "http://api.test", fetcher }),
    ).resolves.toMatchObject({ id: "run-1", status: "queued" });
    await expect(
      cancelAgentRun("run-1", { baseUrl: "http://api.test", fetcher }),
    ).resolves.toMatchObject({ id: "run-1", status: "queued" });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "http://api.test/agent/runs/run-1",
      { method: "GET" },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "http://api.test/agent/runs/run-1",
      { method: "DELETE" },
    );
  });
});

function createStream(input: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });
}
