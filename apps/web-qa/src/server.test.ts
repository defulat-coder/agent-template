import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentRunEventSchema,
  AgentRunResultSchema,
  HealthStatusSchema,
} from "@agent-template/shared";
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

describe("Web QA fixture HTTP interface", () => {
  it("returns a shared-contract health-ok response", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/health`);
    const health = HealthStatusSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(health).toMatchObject({
      service: "web-qa-fixture",
      status: "ok",
      database: { status: "ok" },
      redis: { status: "ok" },
      queue: { status: "ready" },
    });
  });

  it("selects chat-completed and streams shared-contract SSE events", async () => {
    const { baseUrl } = await startServer({ eventDelayMs: 0 });

    const selected = await fetch(`${baseUrl}/__qa/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "chat-completed" }),
    });
    expect(await selected.json()).toEqual({ name: "chat-completed" });

    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "测试正常回复" }),
    });
    const messages = parseSseMessages(await response.text());
    const events = messages
      .filter(({ event }) => event === "agent-event")
      .map(({ data }) => AgentRunEventSchema.parse(data));
    const result = AgentRunResultSchema.parse(
      messages.find(({ event }) => event === "result")?.data,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(events).toEqual([
      { kind: "text", text: "正在处理测试请求。" },
      { kind: "done", result: "QA fixture 已完成回复。" },
    ]);
    expect(result).toMatchObject({
      status: "completed",
      output: "QA fixture 已完成回复。",
      promptLength: 6,
      runtime: "claude",
      model: "qa-fixture",
    });
  });

  it("switches health responses to a deterministic degraded state", async () => {
    const { baseUrl } = await startServer();
    await selectScenario(baseUrl, "health-degraded");

    const response = await fetch(`${baseUrl}/health`);
    const health = HealthStatusSchema.parse(await response.json());

    expect(health).toMatchObject({
      status: "degraded",
      database: { status: "error" },
      redis: { status: "error" },
      queue: { status: "unavailable" },
    });
  });

  it.each([
    {
      name: "chat-tool-events",
      kinds: ["tool-call", "tool-result", "text", "done"],
      status: "completed",
    },
    {
      name: "chat-artifacts",
      kinds: ["artifacts", "done"],
      status: "completed",
    },
    {
      name: "chat-markdown",
      kinds: ["text", "done"],
      status: "completed",
    },
    {
      name: "chat-slow-cancellable",
      kinds: ["text"],
      status: "completed",
    },
    {
      name: "chat-failed",
      kinds: ["error"],
      status: "failed",
    },
    {
      name: "chat-skipped",
      kinds: [],
      status: "skipped",
    },
  ])("streams $name through shared contracts", async ({ name, kinds, status }) => {
    const { baseUrl } = await startServer({
      eventDelayMs: 0,
      slowDelayMs: 0,
    });
    await selectScenario(baseUrl, name);

    const messages = parseSseMessages(await requestChat(baseUrl));
    const events = messages
      .filter(({ event }) => event === "agent-event")
      .map(({ data }) => AgentRunEventSchema.parse(data));
    const result = AgentRunResultSchema.parse(
      messages.find(({ event }) => event === "result")?.data,
    );

    expect(events.map((event) => event.kind)).toEqual(kinds);
    expect(result.status).toBe(status);
  });

  it("ends chat-disconnected without a terminal result", async () => {
    const { baseUrl } = await startServer({ eventDelayMs: 0 });
    await selectScenario(baseUrl, "chat-disconnected");

    const messages = parseSseMessages(await requestChat(baseUrl));

    expect(messages.map(({ event }) => event)).toEqual(["agent-event"]);
    expect(AgentRunEventSchema.parse(messages[0]?.data)).toEqual({
      kind: "text",
      text: "连接将在最终结果前断开。",
    });
  });

  it("rejects unknown scenarios without changing the active scenario", async () => {
    const { baseUrl } = await startServer();

    const response = await fetch(`${baseUrl}/__qa/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "not-a-scenario" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Unknown Web QA scenario",
    });
  });
});

async function startServer(options?: Parameters<typeof createWebQaServer>[0]) {
  const server = createWebQaServer(options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function selectScenario(baseUrl: string, name: string) {
  const response = await fetch(`${baseUrl}/__qa/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(200);
}

async function requestChat(baseUrl: string) {
  const response = await fetch(`${baseUrl}/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "执行 QA 场景" }),
  });
  expect(response.status).toBe(200);
  return response.text();
}

function parseSseMessages(body: string) {
  return body
    .trim()
    .split("\n\n")
    .map((message) => {
      const lines = message.split("\n");
      return {
        event: lines.find((line) => line.startsWith("event:"))?.slice(6).trim(),
        data: JSON.parse(
          lines.find((line) => line.startsWith("data:"))?.slice(5).trim() ??
            "null",
        ) as unknown,
      };
    });
}
