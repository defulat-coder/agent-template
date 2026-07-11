# apps/worker 协作指南

## 职责

`apps/worker` 是 BullMQ 后台任务进程，负责消费 `agent-jobs` 队列并执行后台任务处理逻辑。

## 能力边界

- Worker 进程入口在 `src/worker.ts`。
- `src/process.ts` 负责 BullMQ Worker 装配、event wiring 和 shutdown。
- 队列名、任务名和 payload schema 来自 `@agent-template/shared`。
- Worker 只按 payload 的 `runId` 恢复公共 `AgentRunLifecycle`，不创建第二条 run record。
- BullMQ 重投只在 PostgreSQL execution lease 过期后 reclaim；BullMQ lock/attempt 不是 Agent run fencing token 或业务状态。
- Agent runtime selector 和 lifecycle 来自 `@agent-template/agent`，持久化 adapter 来自 `@agent-template/db`。
- 日志使用 `@agent-template/logger`。

## 不应该做

- 不暴露 HTTP API。
- 不直接定义共享任务 payload schema。
- 不把不可测试的逻辑全部写在 `worker.ts`；进程装配和 job 处理要分开。
- 不把 BullMQ event name 泄漏到 runtime 测试；测试通过回调 interface 验证 completed/failed 行为。
- 不直接用 BullMQ attempt 或 job status 表达 Agent run 业务状态。
- 不直接依赖 `@agent-template/agent-claude` 或 `@agent-template/agent-eve`；通过公共 selector 选择 runtime。
- 不为方便打包而静态 import 两套 runtime；使用 `pnpm agent-runtime:check:bundle` 验证独立 dynamic chunks。

## 验证

```bash
pnpm --filter @agent-template/worker lint
pnpm --filter @agent-template/worker test
pnpm --filter @agent-template/worker typecheck
pnpm --filter @agent-template/worker build
```
