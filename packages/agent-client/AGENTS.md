# Agent Client 协作指南

## 职责

`packages/agent-client` 是 Web、CLI 和其他 Node 调用方共用的远程 Agent 平台 Client。

## 规则

- 对外只暴露 Agent conversation、Agent run、Agent job 和健康检查 Interface。
- HTTP 路径、Bearer header、SSE 解析、断线游标、错误映射和 Zod 校验留在实现内部。
- 不依赖 Fastify、Prisma、BullMQ 或具体 Agent runtime package。
- Runtime continuation 永远不进入公共返回值或日志。
- HTTP 与 in-memory adapter 必须通过相同 contract tests。

## 验证

```bash
pnpm --filter @agent-template/agent-client lint
pnpm --filter @agent-template/agent-client typecheck
pnpm --filter @agent-template/agent-client test
```
