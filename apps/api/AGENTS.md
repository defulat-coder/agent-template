# apps/api 协作指南

## 职责

`apps/api` 是 Fastify HTTP API，负责请求入口、健康检查、Chat SSE、任务入队和运行时依赖检查。

## 能力边界

- HTTP 路由和 Fastify app 装配放在这里。
- 数据库访问通过 `@agent-template/db`。
- Agent job intake 先创建 durable Agent run，再把 `runId` 入队；BullMQ lifecycle 留在 `src/agent-job-intake.ts`。
- BullMQ retry policy 必须从 `defaultAgentRunLeaseDurationMs` 派生，并在 lease 后增加 grace；不能使用会在 lease 内耗尽的快速 retry。
- Agent Chat 通过公共 `AgentRunLifecycle` 启动 run，并用 SSE 返回 event 和最终结果。
- `GET /agent/runs/:runId` 读取持久化状态；`DELETE /agent/runs/:runId` 请求协作式取消。
- `GET /agent/runs/:runId` 的 events 返回持久化 envelope；Chat SSE 的 `agent-event` 仍返回裸 runtime event。
- 任务队列使用 BullMQ，并通过 `@agent-template/shared` 的队列名和 payload schema 保持类型一致。
- 日志使用 `@agent-template/logger`。
- Agent run lifecycle 和 runtime selector 通过 `@agent-template/agent` 使用；持久化 adapter 来自 `@agent-template/db`。
- 不直接依赖 concrete runtime package；execution/readiness 由公共 selector 动态加载部署选择的 adapter。

## 不应该做

- 不在 API 内处理耗时 queued Agent job；queued job 只负责校验请求并入队。
- 不在 API 内定义共享 schema；schema 放 `packages/shared`。
- 不在 API 内创建独立 logger 抽象；logger 规则放 `packages/logger`。
- 不让 Fastify route 直接知道 Redis URL、BullMQ `Queue.add` 或 queue close 细节。
- 不从 request payload 覆盖 Agent runtime；runtime 只读环境变量 `AGENT_RUNTIME`。
- 不把 SSE 连接或 BullMQ job 状态当成 Agent run 的 source of truth。

## 健康检查

`GET /health` 必须快速返回。PostgreSQL、Redis 或所选 Agent runtime 不可用时返回 `degraded`；runtime 协议检查委派给 `@agent-template/agent`，API 不自行连接 Eve/Toolbox。

## 验证

```bash
pnpm --filter @agent-template/api lint
pnpm --filter @agent-template/api test
pnpm --filter @agent-template/api typecheck
pnpm --filter @agent-template/api build
pnpm agent-jobs:verify:local
```
