import {
  AgentRunEventSchema,
  AgentRunResultSchema,
  createHealthStatus,
  type AgentRunEvent,
  type AgentRunResult,
  type HealthStatus,
} from "@agent-template/shared";

export const scenarioNames = [
  "health-ok",
  "health-degraded",
  "chat-completed",
  "chat-tool-events",
  "chat-artifacts",
  "chat-markdown",
  "chat-slow-cancellable",
  "chat-failed",
  "chat-skipped",
  "chat-disconnected",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

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

export function createScenarioHealth(name: ScenarioName): HealthStatus {
  const degraded = name === "health-degraded";
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
  if (name === "chat-tool-events") {
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

  if (name === "chat-artifacts") {
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

  if (name === "chat-markdown") {
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

  if (name === "chat-failed") {
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

  if (name === "chat-skipped") {
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

  if (name === "chat-disconnected") {
    return {
      events: [
        event({ kind: "text", text: "连接将在最终结果前断开。" }),
      ],
    };
  }

  if (name === "chat-slow-cancellable") {
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
