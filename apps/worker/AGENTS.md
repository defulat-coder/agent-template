# apps/worker 协作指南

## 职责

`apps/worker` 是 BullMQ 后台任务进程，负责消费 `agent-jobs` 队列并执行后台任务处理逻辑。

## 能力边界

- Worker 进程入口在 `src/worker.ts`。
- 可单测的业务处理放在 `src/job-handler.ts`。
- 队列名、任务名和 payload schema 来自 `@project-template/shared`。
- Agent 配置和 SDK 入口来自 `@project-template/agent`。
- 日志使用 `@project-template/logger`。

## 不应该做

- 不暴露 HTTP API。
- 不直接定义共享任务 payload schema。
- 不把不可测试的逻辑全部写在 `worker.ts`；进程装配和 job 处理要分开。

## 验证

```bash
pnpm --filter @project-template/worker lint
pnpm --filter @project-template/worker test
pnpm --filter @project-template/worker typecheck
pnpm --filter @project-template/worker build
```
