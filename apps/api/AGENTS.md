# apps/api 协作指南

## 职责

`apps/api` 是 Fastify HTTP API，负责请求入口、健康检查、任务入队和运行时依赖检查。

## 能力边界

- HTTP 路由和 Fastify app 装配放在这里。
- 数据库访问通过 `@project-template/db`。
- 任务队列使用 BullMQ，并通过 `@project-template/shared` 的队列名和 payload schema 保持类型一致。
- 日志使用 `@project-template/logger`。
- Claude 配置状态通过 `@project-template/agent` 读取，不在 API 内直接调用 SDK。

## 不应该做

- 不在 API 内处理耗时 Agent job；只负责校验请求并入队。
- 不在 API 内定义共享 schema；schema 放 `packages/shared`。
- 不在 API 内创建独立 logger 抽象；logger 规则放 `packages/logger`。

## 健康检查

`GET /health` 必须快速返回。PostgreSQL 或 Redis 不可用时应返回 `degraded`，不能让请求长时间挂起。

## 验证

```bash
pnpm --filter @project-template/api lint
pnpm --filter @project-template/api test
pnpm --filter @project-template/api typecheck
pnpm --filter @project-template/api build
```
