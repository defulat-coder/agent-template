import { Cli, z } from "incur";
import {
  createAgentPlatformClient,
  type AgentPlatformClient,
} from "@agent-template/agent-client";

export function createCli(options: { client?: AgentPlatformClient } = {}) {
  const client =
    options.client ??
    createAgentPlatformClient({
      baseUrl: process.env.AGENT_TEMPLATE_API_URL ?? "http://localhost:14000",
      ...(process.env.AGENT_TEMPLATE_TOKEN
        ? { token: process.env.AGENT_TEMPLATE_TOKEN }
        : {}),
    });

  const conversations = Cli.create("conversations", {
    description: "管理 Agent 会话",
  })
    .command("list", {
      description: "列出 Agent 会话",
      options: z.object({
        cursor: z.string().optional().describe("分页游标"),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      run({ options }) {
        return client.conversations.list(options);
      },
    })
    .command("get", {
      description: "查看 Agent 会话",
      args: z.object({ conversationId: z.string().describe("会话 ID") }),
      run({ args }) {
        return client.conversations.get(args.conversationId);
      },
    })
    .command("send", {
      description: "在 Agent 会话中继续发送消息",
      args: z.object({
        conversationId: z.string().describe("会话 ID"),
        prompt: z.string().min(1).describe("发送给 Agent 的内容"),
      }),
      async *run({ args }) {
        yield* client.conversations.send(args.conversationId, {
          prompt: args.prompt,
        });
      },
    });

  const runs = Cli.create("runs", { description: "管理 Agent run" })
    .command("list", {
      description: "列出 Agent run",
      options: z.object({
        conversationId: z.string().optional().describe("按会话过滤"),
        cursor: z.string().optional().describe("分页游标"),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        runtime: z.enum(["claude", "eve"]).optional(),
        status: z
          .enum([
            "queued",
            "running",
            "completed",
            "failed",
            "skipped",
            "cancelled",
          ])
          .optional(),
      }),
      run({ options }) {
        const { status, ...query } = options;
        return client.runs.list({
          ...query,
          ...(status ? { status: [status] } : {}),
        });
      },
    })
    .command("get", {
      description: "查看 Agent run",
      args: z.object({ runId: z.string().describe("Agent run ID") }),
      run({ args }) {
        return client.runs.get(args.runId);
      },
    })
    .command("watch", {
      description: "订阅 Agent run 的持久化事件",
      args: z.object({ runId: z.string().describe("Agent run ID") }),
      options: z.object({
        after: z.coerce.number().int().min(-1).default(-1),
      }),
      async *run({ args, options }) {
        yield* client.runs.watch(args.runId, {
          afterSequence: options.after,
        });
      },
    })
    .command("output", {
      description: "只输出已完成 Agent run 的最终结果",
      args: z.object({ runId: z.string().describe("Agent run ID") }),
      async run({ args }) {
        const run = await client.runs.get(args.runId);
        if (run.status !== "completed" || run.output === null) {
          throw new Error(`Agent run ${args.runId} 尚未成功完成`);
        }
        return { output: run.output };
      },
    })
    .command("cancel", {
      description: "请求协作式取消 Agent run",
      args: z.object({ runId: z.string().describe("Agent run ID") }),
      run({ args }) {
        return client.runs.cancel(args.runId);
      },
    });

  const jobs = Cli.create("jobs", {
    description: "提交后台 Agent job",
  }).command("submit", {
    description: "提交后台 Agent job",
    args: z.object({ prompt: z.string().min(1).describe("任务内容") }),
    run({ args }) {
      return client.jobs.submit({
        prompt: args.prompt,
        requestedAt: new Date().toISOString(),
      });
    },
  });

  return Cli.create("agent-template", {
    version: "0.1.0",
    description: "Agent Template 命令行客户端",
  })
    .command("chat", {
      description: "创建或继续 Agent 会话并流式输出结果",
      args: z.object({
        prompt: z.string().min(1).describe("发送给 Agent 的内容"),
      }),
      options: z.object({
        conversation: z.string().optional().describe("继续已有会话 ID"),
      }),
      async *run({ args, options }) {
        const conversationId =
          options.conversation ??
          (
            await client.conversations.create({
              title:
                args.prompt.length > 60
                  ? `${args.prompt.slice(0, 57)}...`
                  : args.prompt,
            })
          ).id;
        yield* client.conversations.send(conversationId, {
          prompt: args.prompt,
        });
      },
    })
    .command(conversations)
    .command(runs)
    .command(jobs)
    .command("health", {
      description: "查看 Agent API 健康状态",
      run() {
        return client.health();
      },
    })
    .command("doctor", {
      description: "检查本地配置、协议兼容性和远端健康状态",
      async run() {
        const [meta, health] = await Promise.all([
          client.meta(),
          client.health(),
        ]);
        return {
          apiUrl:
            process.env.AGENT_TEMPLATE_API_URL ?? "http://localhost:14000",
          authenticated: Boolean(process.env.AGENT_TEMPLATE_TOKEN),
          meta,
          health,
        };
      },
    });
}
