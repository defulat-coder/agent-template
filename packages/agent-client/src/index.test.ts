import { describe, expect, it, vi } from "vitest";
import { createAgentPlatformClient } from "./index";

describe("createAgentPlatformClient", () => {
  it("sends bearer auth and validates Agent run pages", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
          items: [runSummary],
          nextCursor: null,
        });
      },
    );
    const client = createAgentPlatformClient({
      baseUrl: "https://agent.example.com/",
      token: "secret-token",
      fetcher,
    });

    await expect(client.runs.list({ limit: 20 })).resolves.toEqual({
      items: [runSummary],
      nextCursor: null,
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://agent.example.com/v1/agent/runs?limit=20");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer secret-token",
    );
  });

  it("parses chunked CRLF event streams", async () => {
    const frames = [
      { type: "accepted", runId: "run-1" },
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
          status: "completed",
          promptLength: 3,
          runtime: "claude",
          configured: true,
          model: "test-model",
          runId: "run-1",
          events: [{ kind: "done", result: "Done" }],
          output: "Done",
        },
      },
    ];
    const payload = frames
      .map((frame) => `event: frame\r\ndata: ${JSON.stringify(frame)}\r\n\r\n`)
      .join("");
    const split = Math.floor(payload.length / 2);
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(
          new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(payload.slice(0, split)));
              controller.enqueue(encoder.encode(payload.slice(split)));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    );
    const client = createAgentPlatformClient({
      baseUrl: "https://agent.example.com",
      fetcher,
    });

    const received = [];
    for await (const frame of client.runs.start({ prompt: "Run" })) {
      received.push(frame);
    }
    expect(received).toEqual(frames);
  });

  it("maps stable remote errors", async () => {
    const client = createAgentPlatformClient({
      baseUrl: "https://agent.example.com",
      fetcher: async () =>
        Response.json(
          {
            error: {
              code: "AUTH_REQUIRED",
              message: "需要登录",
              retryable: false,
            },
          },
          { status: 401 },
        ),
    });

    await expect(client.meta()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
      retryable: false,
    });
  });
});

const runSummary = {
  id: "run-1",
  conversationId: null,
  promptPreview: "Run",
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
  reason: null,
};
