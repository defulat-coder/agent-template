import { prisma } from "../src/index.js";
import type { Prisma } from "../generated/client/client.js";

type SeedEvent = {
  id: string;
  type: string;
  payload: Prisma.InputJsonValue;
  createdAt: Date;
};

const seedEvents: SeedEvent[] = [
  {
    id: "evt-run-support-001-requested",
    type: "agent.run.requested",
    createdAt: new Date("2026-07-04T09:00:00.000Z"),
    payload: {
      runId: "run_support_001",
      channel: "web-chat",
      organization: { id: "org_acme_ops", name: "Acme 运营中心" },
      user: { id: "user_lina", name: "林娜", role: "运营负责人" },
      prompt: "汇总过去 24 小时失败的 Agent run，并给出处理建议。",
      priority: "high",
    },
  },
  {
    id: "evt-run-support-001-runtime",
    type: "agent.runtime.selected",
    createdAt: new Date("2026-07-04T09:00:02.000Z"),
    payload: {
      runId: "run_support_001",
      runtime: "claude",
      model: "kimi-for-coding",
      reason: "需要通过 Toolbox 读取最近 Agent run 记录。",
    },
  },
  {
    id: "evt-run-support-001-toolset",
    type: "toolbox.toolset.loaded",
    createdAt: new Date("2026-07-04T09:00:04.000Z"),
    payload: {
      runId: "run_support_001",
      toolProvider: "toolbox",
      toolset: "agent_template_read_model",
      tools: [
        "list-template-events",
        "get-template-event",
        "list-template-events-in-window",
        "summarize-template-events-by-type",
        "list-agent-runs",
        "get-agent-run-summary",
        "list-agent-run-timeline",
        "list-failed-agent-runs-in-window",
        "summarize-tool-invocations",
      ],
    },
  },
  {
    id: "evt-run-support-001-tool",
    type: "toolbox.tool.invoked",
    createdAt: new Date("2026-07-04T09:00:06.000Z"),
    payload: {
      runId: "run_support_001",
      toolName: "list-agent-runs",
      rowsReturned: 3,
      latencyMs: 42,
    },
  },
  {
    id: "evt-run-support-001-completed",
    type: "agent.run.completed",
    createdAt: new Date("2026-07-04T09:00:18.000Z"),
    payload: {
      runId: "run_support_001",
      status: "completed",
      outputSummary:
        "发现 1 个 Eve runtime 配置缺失导致的失败 run，建议补齐 EVE_AGENT_HOST 后重试。",
      latencyMs: 18000,
    },
  },
  {
    id: "evt-job-invoice-001-accepted",
    type: "agent.job.accepted",
    createdAt: new Date("2026-07-04T10:15:00.000Z"),
    payload: {
      jobId: "job_invoice_001",
      runId: "run_invoice_001",
      queue: "agent-jobs",
      organization: {
        id: "org_northwind_finance",
        name: "Northwind 财务共享中心",
      },
      prompt: "检查本月对账异常，并生成需要人工复核的清单。",
      requestedBy: "user_chen",
    },
  },
  {
    id: "evt-run-invoice-001-started",
    type: "agent.run.started",
    createdAt: new Date("2026-07-04T10:15:08.000Z"),
    payload: {
      runId: "run_invoice_001",
      runtime: "eve",
      model: "kimi-for-coding",
      source: "queued-job",
    },
  },
  {
    id: "evt-run-invoice-001-failed",
    type: "agent.run.failed",
    createdAt: new Date("2026-07-04T10:15:11.000Z"),
    payload: {
      runId: "run_invoice_001",
      status: "failed",
      reason: "EVE_AGENT_HOST is not configured",
      retryable: true,
    },
  },
  {
    id: "evt-run-invoice-001-recovered",
    type: "agent.run.completed",
    createdAt: new Date("2026-07-04T10:16:02.000Z"),
    payload: {
      runId: "run_invoice_001",
      status: "completed",
      outputSummary: "重试成功，已生成需要人工复核的对账异常清单。",
      retryCount: 1,
    },
  },
  {
    id: "evt-run-knowledge-001-requested",
    type: "agent.run.requested",
    createdAt: new Date("2026-07-04T11:30:00.000Z"),
    payload: {
      runId: "run_knowledge_001",
      channel: "web-chat",
      organization: { id: "org_zenith_cs", name: "Zenith 客服中心" },
      user: { id: "user_wang", name: "王敏", role: "客服主管" },
      prompt: "根据最近的客户问题，整理一份知识库更新建议。",
      priority: "normal",
    },
  },
  {
    id: "evt-run-knowledge-001-tool",
    type: "toolbox.tool.invoked",
    createdAt: new Date("2026-07-04T11:30:07.000Z"),
    payload: {
      runId: "run_knowledge_001",
      toolName: "list-agent-run-timeline",
      rowsReturned: 5,
      latencyMs: 38,
    },
  },
  {
    id: "evt-run-knowledge-001-artifact",
    type: "agent.artifact.created",
    createdAt: new Date("2026-07-04T11:30:16.000Z"),
    payload: {
      runId: "run_knowledge_001",
      artifactId: "artifact_kb_update_001",
      kind: "markdown_report",
      title: "知识库更新建议",
    },
  },
  {
    id: "evt-run-knowledge-001-completed",
    type: "agent.run.completed",
    createdAt: new Date("2026-07-04T11:30:22.000Z"),
    payload: {
      runId: "run_knowledge_001",
      status: "completed",
      outputSummary: "生成 4 条知识库更新建议，并标记 2 条需要人工复核。",
      latencyMs: 22000,
    },
  },
];

for (const event of seedEvents) {
  await prisma.templateEvent.upsert({
    where: { id: event.id },
    create: event,
    update: {
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    },
  });
}

console.log(`Seeded ${seedEvents.length} template events.`);

await prisma.$disconnect();
