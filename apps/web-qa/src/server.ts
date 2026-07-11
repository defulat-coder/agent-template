import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  AgentRunInputSchema,
  type AgentRunEvent,
  type AgentRunResult,
  type AgentRunStreamFrame,
} from "@agent-template/shared";
import {
  createChatScenario,
  createScenarioHealth,
  isScenarioName,
  scenarioNames,
  type ChatScenario,
  type ScenarioName,
} from "./scenarios.js";

export type CreateWebQaServerOptions = {
  eventDelayMs?: number;
  slowDelayMs?: number;
};

const maxRequestBodyBytes = 1024 * 1024;

export function createWebQaServer(options: CreateWebQaServerOptions = {}) {
  const eventDelayMs = options.eventDelayMs ?? 600;
  const slowDelayMs = options.slowDelayMs ?? 30_000;
  let scenario: ScenarioName = "health-ok";
  let conversationTitle: string | null = null;

  return createServer((request, response) => {
    void handleRequest(
      request,
      response,
      {
        getScenario: () => scenario,
        setScenario: (next) => {
          scenario = next;
        },
        getConversationTitle: () => conversationTitle,
        setConversationTitle: (title) => {
          conversationTitle = title;
        },
      },
      { eventDelayMs, slowDelayMs },
    ).catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(
          response,
          error instanceof RequestBodyTooLargeError ? 413 : 400,
          {
            message: error instanceof Error ? error.message : "Invalid request",
          },
        );
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: {
    getScenario(): ScenarioName;
    setScenario(scenario: ScenarioName): void;
    getConversationTitle(): string | null;
    setConversationTitle(title: string | null): void;
  },
  timing: { eventDelayMs: number; slowDelayMs: number },
) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, createScenarioHealth(state.getScenario()));
    return;
  }

  if (request.method === "POST" && request.url === "/v1/agent/conversations") {
    const body = (await readJson(request)) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title : null;
    state.setConversationTitle(title);
    sendJson(response, 201, createConversationView(title));
    return;
  }

  const conversationRequest = request.url?.match(
    /^\/v1\/agent\/conversations\/([^/]+)$/,
  );
  if (request.method === "GET" && conversationRequest) {
    const conversationId = decodeURIComponent(conversationRequest[1] ?? "");
    if (conversationId !== "qa-conversation-1") {
      sendJson(response, 404, { message: "Conversation not found" });
      return;
    }
    sendJson(
      response,
      200,
      createConversationView(state.getConversationTitle()),
    );
    return;
  }

  const conversationRun = request.url?.match(
    /^\/v1\/agent\/conversations\/([^/]+)\/runs$/,
  );
  if (request.method === "POST" && conversationRun) {
    const conversationId = decodeURIComponent(conversationRun[1] ?? "");
    const input = AgentRunInputSchema.parse(await readJson(request));
    const scenario = createChatScenario(
      state.getScenario(),
      input.prompt.length,
      input.inputResponses,
    );
    const runId = scenario.result?.runId ?? "qa-run-stream";

    await streamScenario(request, response, scenario, timing, {
      accepted: encodeFrame({ type: "accepted", runId, conversationId }),
      event(event, sequence) {
        return encodeFrame({ type: "event", runId, sequence, event });
      },
      result(result) {
        return encodeFrame({
          type: "terminal",
          runId,
          result: { ...result, conversationId },
        });
      },
    });
    return;
  }

  const runRequest = request.url?.match(/^\/v1\/agent\/runs\/([^/]+)$/);
  if (request.method === "DELETE" && runRequest) {
    const now = new Date().toISOString();
    sendJson(response, 200, {
      id: decodeURIComponent(runRequest[1] ?? "qa-run"),
      conversationId: "qa-conversation-1",
      prompt: "QA fixture run",
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      cancelRequestedAt: now,
      status: "cancelled",
      executionAttempt: 1,
      leaseExpiresAt: null,
      heartbeatAt: null,
      runtime: "claude",
      model: "qa-fixture",
      output: null,
      reason: "Agent run was cancelled",
      events: [],
    });
    return;
  }

  if (request.method === "POST" && request.url === "/__qa/scenario") {
    const body = (await readJson(request)) as { name?: unknown };
    if (!isScenarioName(body.name)) {
      sendJson(response, 400, {
        message: "Unknown Web QA scenario",
        scenarios: scenarioNames,
      });
      return;
    }
    state.setScenario(body.name);
    sendJson(response, 200, { name: body.name });
    return;
  }

  if (request.method === "POST" && request.url === "/agent/chat") {
    const input = AgentRunInputSchema.parse(await readJson(request));
    const scenario = createChatScenario(
      state.getScenario(),
      input.prompt.length,
      input.inputResponses,
    );

    await streamScenario(request, response, scenario, timing, {
      event: (event) => encodeSse("agent-event", event),
      result: (result) => encodeSse("result", result),
    });
    return;
  }

  sendJson(response, 404, { message: "Not found" });
}

function createConversationView(title: string | null) {
  const now = new Date().toISOString();
  return {
    id: "qa-conversation-1",
    title,
    runtime: "claude",
    createdAt: now,
    updatedAt: now,
    lastRun: null,
    runs: [],
  };
}

async function streamScenario(
  request: IncomingMessage,
  response: ServerResponse,
  scenario: ChatScenario,
  timing: { eventDelayMs: number; slowDelayMs: number },
  encoder: {
    accepted?: string;
    event(event: AgentRunEvent, sequence: number): string;
    result(result: AgentRunResult): string;
  },
) {
  const abortController = new AbortController();
  const abort = () => abortController.abort("QA stream disconnected");
  request.once("aborted", abort);
  response.once("close", abort);
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  });

  try {
    if (encoder.accepted) {
      await writeWithBackpressure(
        response,
        encoder.accepted,
        abortController.signal,
      );
    }
    for (const [sequence, event] of scenario.events.entries()) {
      await writeWithBackpressure(
        response,
        encoder.event(event, sequence),
        abortController.signal,
      );
      await abortableDelay(timing.eventDelayMs, abortController.signal);
    }
    if (scenario.slowBeforeResult) {
      await abortableDelay(timing.slowDelayMs, abortController.signal);
    }
    if (scenario.result) {
      await writeWithBackpressure(
        response,
        encoder.result(scenario.result),
        abortController.signal,
      );
    }
    response.end();
  } catch (error) {
    if (!abortController.signal.aborted) throw error;
  } finally {
    request.removeListener("aborted", abort);
    response.removeListener("close", abort);
  }
}

function encodeSse(
  event: "agent-event" | "result",
  data: AgentRunEvent | AgentRunResult,
) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function encodeFrame(frame: AgentRunStreamFrame) {
  return `event: frame\ndata: ${JSON.stringify(frame)}\n\n`;
}

async function writeWithBackpressure(
  response: ServerResponse,
  chunk: string,
  signal: AbortSignal,
) {
  if (signal.aborted || response.destroyed) {
    throw new DOMException("QA stream disconnected", "AbortError");
  }
  if (response.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.removeListener("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("QA stream disconnected", "AbortError"));
    };
    response.once("drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxRequestBodyBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "DELETE,GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:13000");
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(
      new DOMException("QA stream disconnected", "AbortError"),
    );
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("QA stream disconnected", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds 1 MiB");
    this.name = "RequestBodyTooLargeError";
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
