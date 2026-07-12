import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentPlatformClient } from "@agent-template/agent-client";
import type { AgentRunStreamFrame } from "@agent-template/shared";
import { createWebQaServer } from "./server.js";

const servers: ReturnType<typeof createWebQaServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("Web QA fixture v1 Agent interface", () => {
  it("returns shared-contract health", async () => {
    const { baseUrl } = await startServer();
    const health = await createAgentPlatformClient({ baseUrl }).health();
    expect(health).toMatchObject({
      service: "web-qa-fixture",
      status: "ok",
      database: { status: "ok" },
      redis: { status: "ok" },
      queue: { status: "ready" },
    });
  });

  it("streams Browser scenarios through v1 frames", async () => {
    const { baseUrl } = await startServer({ eventDelayMs: 0 });
    await selectScenario(baseUrl, "chat-completed");
    const frames = await requestFrames(baseUrl, "测试正常回复");

    expect(frames.map((frame) => frame.type)).toEqual([
      "accepted",
      "event",
      "event",
      "terminal",
    ]);
    expect(
      frames.flatMap((frame) =>
        frame.type === "event" ? [frame.event.kind] : [],
      ),
    ).toEqual(["text", "done"]);
    expect(frames.at(-1)).toMatchObject({
      type: "terminal",
      result: { status: "completed", output: "QA fixture 已完成回复。" },
    });
  });

  it("keeps a conversation available for a follow-up run", async () => {
    const { baseUrl } = await startServer();
    const client = createAgentPlatformClient({ baseUrl });
    const created = await client.conversations.create({ title: "退款分析" });
    await expect(client.conversations.get(created.id)).resolves.toMatchObject({
      id: "qa-conversation-1",
      title: "退款分析",
      runtime: "claude",
    });
  });

  it("switches health responses to a deterministic degraded state", async () => {
    const { baseUrl } = await startServer();
    await selectScenario(baseUrl, "health-degraded");
    await expect(
      createAgentPlatformClient({ baseUrl }).health(),
    ).resolves.toMatchObject({
      status: "degraded",
      database: { status: "error" },
      redis: { status: "error" },
      queue: { status: "unavailable" },
    });
  });

  it.each([
    [
      "chat-tool-events",
      ["tool-call", "tool-result", "text", "done"],
      "completed",
    ],
    ["chat-artifacts", ["artifacts", "done"], "completed"],
    ["chat-markdown", ["text", "done"], "completed"],
    ["chat-slow-cancellable", ["text"], "completed"],
    ["chat-failed", ["error"], "failed"],
    ["chat-skipped", [], "skipped"],
  ])("streams %s through v1", async (name, kinds, status) => {
    const { baseUrl } = await startServer({ eventDelayMs: 0, slowDelayMs: 0 });
    await selectScenario(baseUrl, name);
    const frames = await requestFrames(baseUrl, "执行 QA 场景");
    expect(
      frames.flatMap((frame) =>
        frame.type === "event" ? [frame.event.kind] : [],
      ),
    ).toEqual(kinds);
    const terminal = frames.find((frame) => frame.type === "terminal");
    expect(terminal).toMatchObject({ result: { status } });
  });

  it("ends a disconnected scenario without a terminal frame", async () => {
    const { baseUrl } = await startServer({ eventDelayMs: 0 });
    await selectScenario(baseUrl, "chat-disconnected");
    const frames = await requestFrames(baseUrl, "执行 QA 场景");
    expect(frames.map((frame) => frame.type)).toEqual(["accepted", "event"]);
  });

  it("returns stable v1 error envelopes", async () => {
    const { baseUrl } = await startServer();
    const client = createAgentPlatformClient({ baseUrl });
    await expect(client.conversations.get("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      retryable: false,
    });
  });

  it("rejects request bodies larger than 1 MiB with a v1 envelope", async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(
      `${baseUrl}/v1/agent/conversations/qa-conversation-1/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x".repeat(1024 * 1024 + 1) }),
      },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Request body exceeds 1 MiB",
        retryable: false,
      },
    });
  });

  it("does not expose the removed legacy chat interface", async () => {
    const { baseUrl } = await startServer();
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "legacy" }),
    });
    expect(response.status).toBe(404);
  });

  it("cancels a slow v1 stream when its reader closes", async () => {
    const { baseUrl, server } = await startServer({
      eventDelayMs: 0,
      slowDelayMs: 30_000,
    });
    await selectScenario(baseUrl, "chat-slow-cancellable");
    const client = createAgentPlatformClient({ baseUrl });
    const conversation = await client.conversations.create();
    const controller = new AbortController();
    const stream = client.conversations.send(
      conversation.id,
      { prompt: "等待取消" },
      { signal: controller.signal },
    );
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    controller.abort("Browser disconnected");
    await iterator.return?.();
    server.closeIdleConnections();
    await expect(waitForNoConnections(server)).resolves.toBeUndefined();
  });
});

async function startServer(options?: Parameters<typeof createWebQaServer>[0]) {
  const server = createWebQaServer(options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function requestFrames(baseUrl: string, prompt: string) {
  const client = createAgentPlatformClient({ baseUrl });
  const conversation = await client.conversations.create();
  const received: AgentRunStreamFrame[] = [];
  for await (const frame of client.conversations.send(conversation.id, {
    prompt,
  })) {
    received.push(frame);
  }
  return received;
}

async function selectScenario(baseUrl: string, name: string) {
  const response = await fetch(`${baseUrl}/__qa/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(200);
}

async function waitForNoConnections(
  server: ReturnType<typeof createWebQaServer>,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const connections = await new Promise<number>((resolve, reject) => {
      server.getConnections((error, count) =>
        error ? reject(error) : resolve(count),
      );
    });
    if (connections === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("QA stream connection remained open after abort");
}
