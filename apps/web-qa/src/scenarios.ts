import {
  AgentRunEventSchema,
  AgentRunResultSchema,
  createHealthStatus,
  type AgentRunEvent,
  type AgentRunResult,
  type HealthStatus,
} from "@agent-template/shared";

type ScenarioRoute = "/" | "/agent";
type ChatBehavior =
  | "completed"
  | "tool-events"
  | "artifacts"
  | "markdown"
  | "slow-cancellable"
  | "failed"
  | "skipped"
  | "disconnected";

export const scenarioCatalog = {
  "health-ok": {
    health: "ok",
    chat: "completed",
    routes: ["/", "/agent"],
  },
  "health-degraded": {
    health: "degraded",
    chat: null,
    routes: ["/"],
  },
  "chat-completed": {
    health: "ok",
    chat: "completed",
    routes: ["/agent"],
  },
  "chat-tool-events": {
    health: "ok",
    chat: "tool-events",
    routes: ["/agent"],
  },
  "chat-artifacts": {
    health: "ok",
    chat: "artifacts",
    routes: ["/agent"],
  },
  "chat-markdown": {
    health: "ok",
    chat: "markdown",
    routes: ["/agent"],
  },
  "chat-slow-cancellable": {
    health: "ok",
    chat: "slow-cancellable",
    routes: ["/agent"],
  },
  "chat-failed": {
    health: "ok",
    chat: "failed",
    routes: ["/agent"],
  },
  "chat-skipped": {
    health: "ok",
    chat: "skipped",
    routes: ["/agent"],
  },
  "chat-disconnected": {
    health: "ok",
    chat: "disconnected",
    routes: ["/agent"],
  },
} as const satisfies Record<
  string,
  {
    health: "ok" | "degraded";
    chat: ChatBehavior | null;
    routes: readonly ScenarioRoute[];
  }
>;

export type ScenarioName = keyof typeof scenarioCatalog;
export const scenarioNames = Object.keys(scenarioCatalog) as ScenarioName[];

export type ChatScenario = {
  events: AgentRunEvent[];
  result?: AgentRunResult;
  slowBeforeResult?: boolean;
};

export function isScenarioName(value: unknown): value is ScenarioName {
  return (
    typeof value === "string" &&
    (scenarioNames as readonly string[]).includes(value)
  );
}

export function supportsScenarioRoute(name: ScenarioName, route: string) {
  return (scenarioCatalog[name].routes as readonly string[]).includes(route);
}

export function createScenarioHealth(name: ScenarioName): HealthStatus {
  const degraded = scenarioCatalog[name].health === "degraded";
  return createHealthStatus({
    service: "web-qa-fixture",
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    database: degraded
      ? { status: "error", message: "QA fixture database unavailable" }
      : { status: "ok", message: "QA fixture database ready" },
    redis: degraded
      ? { status: "error", message: "QA fixture Redis unavailable" }
      : { status: "ok", message: "QA fixture Redis ready" },
    queue: {
      name: "agent-jobs",
      status: degraded ? "unavailable" : "ready",
    },
    agent: {
      runtime: "claude",
      configured: true,
      model: "qa-fixture",
      readiness: degraded
        ? { status: "error", message: "QA fixture Agent unavailable" }
        : { status: "ok", message: "QA fixture ready" },
    },
    toolbox: {
      configured: true,
      url: "http://localhost:15000",
      capabilityProfile: "qa-fixture",
    },
  });
}

export function createChatScenario(
  name: ScenarioName,
  promptLength: number,
): ChatScenario {
  const behavior = scenarioCatalog[name].chat;
  if (!behavior) {
    throw new Error(`Scenario ${name} does not support Agent Chat`);
  }

  if (behavior === "tool-events") {
    return completedScenario(
      promptLength,
      [
        event({
          kind: "tool-call",
          callId: "qa-call-1",
          toolName: "lookup_template_events",
          input: { limit: 3 },
        }),
        event({
          kind: "tool-result",
          callId: "qa-call-1",
          toolName: "lookup_template_events",
        }),
        event({ kind: "text", text: "工具调用已完成。" }),
        event({ kind: "done", result: "工具场景测试完成。" }),
      ],
      "工具场景测试完成。",
      "qa-run-tools",
    );
  }

  if (behavior === "artifacts") {
    return completedScenario(
      promptLength,
      [
        event({
          kind: "artifacts",
          tabs: [
            {
              id: "summary",
              label: "摘要",
              hint: "Markdown",
              content: "# QA 摘要\n\n场景执行成功。",
            },
            {
              id: "data",
              label: "数据",
              hint: "JSON",
              content: '{"status":"ok"}',
            },
          ],
        }),
        event({ kind: "done", result: "已生成两个 Artifact。" }),
      ],
      "已生成两个 Artifact。",
      "qa-run-artifacts",
    );
  }

  if (behavior === "markdown") {
    const markdown = [
      "# QA Markdown",
      "",
      "- 列表项",
      "",
      "| 状态 | 结果 |",
      "| --- | --- |",
      "| SSE | 通过 |",
      "",
      "```ts",
      'const status = "ok";',
      "```",
      "",
      "[OpenAI](https://openai.com)",
    ].join("\n");
    return completedScenario(
      promptLength,
      [
        event({ kind: "text", text: markdown }),
        event({ kind: "done", result: markdown }),
      ],
      markdown,
      "qa-run-markdown",
    );
  }

  if (behavior === "failed") {
    const events = [event({ kind: "error", message: "QA fixture 模拟失败。" })];
    return {
      events,
      result: AgentRunResultSchema.parse({
        status: "failed",
        configured: true,
        events,
        model: "qa-fixture",
        promptLength,
        reason: "QA fixture 模拟失败。",
        runId: "qa-run-failed",
        runtime: "claude",
      }),
    };
  }

  if (behavior === "skipped") {
    return {
      events: [],
      result: AgentRunResultSchema.parse({
        status: "skipped",
        configured: false,
        model: "qa-fixture",
        promptLength,
        reason: "QA fixture 模拟 runtime 未配置。",
        runId: "qa-run-skipped",
        runtime: "claude",
      }),
    };
  }

  if (behavior === "disconnected") {
    return {
      events: [
        event({ kind: "text", text: "连接将在最终结果前断开。" }),
      ],
    };
  }

  if (behavior === "slow-cancellable") {
    const scenario = completedScenario(
      promptLength,
      [event({ kind: "text", text: "QA fixture 正在等待取消。" })],
      "慢速场景执行完成。",
      "qa-run-slow",
    );
    return { ...scenario, slowBeforeResult: true };
  }

  return completedScenario(
    promptLength,
    [
      event({ kind: "text", text: "正在处理测试请求。" }),
      event({ kind: "done", result: "QA fixture 已完成回复。" }),
    ],
    "QA fixture 已完成回复。",
    "qa-run-completed",
  );
}

function completedScenario(
  promptLength: number,
  events: AgentRunEvent[],
  output: string,
  runId: string,
): ChatScenario {
  return {
    events,
    result: AgentRunResultSchema.parse({
      status: "completed",
      configured: true,
      events,
      model: "qa-fixture",
      output,
      promptLength,
      runId,
      runtime: "claude",
    }),
  };
}

function event(input: unknown): AgentRunEvent {
  return AgentRunEventSchema.parse(input);
}
