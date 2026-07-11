import { describe, expect, it, vi } from "vitest";
import { streamAgentChat, submitAgentJob } from "./agent-client";

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
    const fetcher = vi.fn().mockResolvedValue({
      body: createStream(
        [
          'event: agent-event\ndata: {"kind":"text","text":"Working"}\n\n',
          'event: result\ndata: {"promptLength":9,"runtime":"claude","configured":true,"model":"kimi-for-coding","status":"completed","events":[{"kind":"text","text":"Working"},{"kind":"done","result":"Done"}],"output":"Done"}\n\n',
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
      }),
    ).resolves.toMatchObject({
      output: "Done",
      status: "completed",
    });

    expect(fetcher).toHaveBeenCalledWith("http://api.test/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Run agent" }),
    });
    expect(events).toEqual([{ kind: "text", text: "Working" }]);
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
