import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AgentRunInputSchema,
  type AgentRunEvent,
  type AgentRunResult,
} from "@agent-template/shared";
import {
  createChatScenario,
  createScenarioHealth,
  isScenarioName,
  scenarioNames,
  type ScenarioName,
} from "./scenarios.js";

export type CreateWebQaServerOptions = {
  eventDelayMs?: number;
  slowDelayMs?: number;
};

export function createWebQaServer(options: CreateWebQaServerOptions = {}) {
  const eventDelayMs = options.eventDelayMs ?? 600;
  const slowDelayMs = options.slowDelayMs ?? 30_000;
  let scenario: ScenarioName = "health-ok";

  return createServer((request, response) => {
    void handleRequest(
      request,
      response,
      {
        getScenario: () => scenario,
        setScenario: (next) => {
          scenario = next;
        },
      },
      { eventDelayMs, slowDelayMs },
    ).catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 400, {
          message: error instanceof Error ? error.message : "Invalid request",
        });
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  scenarios: {
    getScenario(): ScenarioName;
    setScenario(scenario: ScenarioName): void;
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
    sendJson(
      response,
      200,
      createScenarioHealth(scenarios.getScenario()),
    );
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
    scenarios.setScenario(body.name);
    sendJson(response, 200, { name: body.name });
    return;
  }

  if (request.method === "POST" && request.url === "/agent/chat") {
    const input = AgentRunInputSchema.parse(await readJson(request));
    const scenario = createChatScenario(
      scenarios.getScenario(),
      input.prompt.length,
    );

    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    });
    for (const event of scenario.events) {
      if (response.destroyed) return;
      writeSse(response, "agent-event", event);
      await delay(timing.eventDelayMs);
    }
    if (scenario.slowBeforeResult) await delay(timing.slowDelayMs);
    if (scenario.result && !response.destroyed) {
      writeSse(response, "result", scenario.result);
    }
    response.end();
    return;
  }

  sendJson(response, 404, { message: "Not found" });
}

function writeSse(
  response: ServerResponse,
  event: "agent-event" | "result",
  data: AgentRunEvent | AgentRunResult,
) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:13000");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
